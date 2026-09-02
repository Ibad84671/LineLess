// Queue mutation engine. All correctness guarantees live here:
//
// - JOIN: atomic counter (`SET lastNumber = if_not_exists(...) + 1` with a
//   condition) issues unique ticket numbers; a transaction guards per-customer
//   duplicate joins and records the idempotency key atomically with the entry.
// - NEXT: transaction with conditional writes — exactly one of two concurrent
//   "call next" requests wins; the loser gets STALE_STATE and retries.
//
// Every mutation publishes a domain event (EventBridge) AFTER its DynamoDB
// transaction commits; WebSocket fan-out and notifications are downstream.

import { db } from '../shared/dynamo.js';
import { keys, pad as padNum, dayKey } from '../shared/keys.js';
import { formatTicket } from '../shared/numbering.js';
import { publishEvent, EVENT_TYPES } from '../shared/events.js';
import { notFound, conflict, badRequest } from '../shared/errors.js';
import { newCustomerToken, opaqueId } from '../shared/ids.js';
import { sanitizeText, email as validEmail } from '../shared/validate.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isCondCheckFailure(err) {
  return (
    err?.name === 'ConditionalCheckFailedException' ||
    err?.name === 'TransactionCanceledException' ||
    err?.name === 'TransactionInProgressException'
  );
}

/** Counts WAITING entries with a ticket strictly before `ticket`. */
export async function countWaitingBefore(queueId, ticket, padWidth, store = db()) {
  const res = await store.query({
    KeyConditionExpression: 'PK = :p AND SK BETWEEN :lo AND :hi',
    FilterExpression: '#st = :waiting',
    ExpressionAttributeNames: { '#st': 'state' },
    ExpressionAttributeValues: {
      ':p': keys.queuePartition(queueId),
      ':lo': `ENTRY#${padNum(1, padWidth)}`,
      ':hi': `ENTRY#${padNum(Math.max(1, ticket - 1), padWidth)}`,
      ':waiting': 'WAITING',
    },
    Select: 'COUNT',
  });
  return res.count;
}

// ---------------------------------------------------------------------------
// JOIN
// ---------------------------------------------------------------------------

export async function joinQueue(
  { queueId, contact = {}, idempotencyKey },
  { store = db(), now = () => new Date().toISOString() } = {},
) {
  const ts = now();

  if (idempotencyKey) {
    const prior = await store.get(keys.idempotency(queueId, idempotencyKey));
    if (prior?.result) return { ...prior.result, replayed: true };
  }

  const queue = await store.get(keys.queueMeta(queueId));
  if (!queue) throw notFound('Queue not found');
  if (queue.status !== 'OPEN') throw conflict('This queue is closed', 'QUEUE_CLOSED');
  if (queue.paused) throw conflict('This queue is paused', 'QUEUE_PAUSED');

  const token = newCustomerToken();
  const name = contact.name ? sanitizeText(String(contact.name), 80) : undefined;
  const email = contact.email ? validEmail(String(contact.email)) : undefined;
  const phone = contact.phone ? sanitizeText(String(contact.phone), 24) : undefined;
  if (!name && !email && !phone) {
    throw badRequest('Provide at least a name, email or phone number');
  }

  // Step 1 — atomically reserve the next ticket number. The counter mirrors
  // `open` so a pause/close that raced ahead of us stops the join here.
  // Gaps are possible if a later step fails; uniqueness is never affected.
  let number;
  try {
    const res = await store.update({
      Key: keys.counter(queueId, queue.resetDaily ? dayKey(new Date()) : undefined),
      UpdateExpression: 'SET lastNumber = if_not_exists(lastNumber, :zero) + :one',
      ConditionExpression: 'attribute_not_exists(PK) OR #o = :true',
      ExpressionAttributeNames: { '#o': 'open' },
      ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':true': true },
      ReturnValues: 'UPDATED_NEW',
    });
    number = res.lastNumber;
  } catch (err) {
    if (isCondCheckFailure(err)) {
      throw conflict('This queue is not accepting customers', 'QUEUE_NOT_OPEN');
    }
    throw err;
  }

  const display = formatTicket(number, queue);
  const result = {
    token,
    queueId,
    orgId: queue.orgId,
    ticket: number,
    display,
    state: 'WAITING',
    joinedAt: ts,
    queueName: queue.name,
    padWidth: queue.padWidth,
  };

  return commitJoin(store, { queue, queueId, token, number, display, ts, contact: { name, email, phone }, idempotencyKey, result });
}

async function commitJoin(store, ctx) {
  const { queue, queueId, token, number, display, ts, contact, idempotencyKey, result } = ctx;
  const { name, email, phone } = contact;
  const ttl = Math.floor(Date.parse(ts) / 1000) + 24 * 3600;

  // Duplicate-join guards: per contact identity (email/phone) so the same
  // customer cannot enter the queue twice, plus the per-session guard.
  const guards = [];
  if (email) {
    guards.push({
      Put: {
        Item: { PK: keys.queuePartition(queueId), SK: `CUST#E:${email}`, email, joinedAt: ts },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    });
  }
  if (phone) {
    guards.push({
      Put: {
        Item: { PK: keys.queuePartition(queueId), SK: `CUST#P:${phone}`, phone, joinedAt: ts },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    });
  }

  try {
    await store.transactWrite([
      {
        Put: {
          Item: {
            PK: keys.queuePartition(queueId),
            SK: `ENTRY#${padNum(number, queue.padWidth)}`,
            GSI1PK: `TOK#${token}`,
            GSI1SK: `JOIN#${ts}`,
            entityType: 'QueueEntry',
            queueId,
            orgId: queue.orgId,
            ticket: number,
            display,
            token,
            ...(name ? { name } : {}),
            ...(email ? { email } : {}),
            ...(phone ? { phone } : {}),
            state: 'WAITING',
            joinedAt: ts,
            updatedAt: ts,
            expiresAt: ttl,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          Item: {
            PK: keys.queuePartition(queueId),
            SK: `CUST#${token}`,
            token,
            ticket: number,
            joinedAt: ts,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      ...guards,
      {
        Put: {
          Item: {
            PK: keys.customerProfile(token).PK,
            SK: 'PROFILE',
            token,
            queueId,
            ...(name ? { name } : {}),
            ...(email ? { email } : {}),
            ...(phone ? { phone } : {}),
            createdAt: ts,
            expiresAt: ttl,
          },
        },
      },
      ...(idempotencyKey
        ? [
            {
              Put: {
                Item: {
                  PK: keys.queuePartition(queueId),
                  SK: `IDEM#${idempotencyKey}`,
                  result,
                  createdAt: ts,
                  expiresAt: ttl,
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ]
        : []),
      {
        Put: {
          Item: {
            PK: `ORG#${queue.orgId}`,
            SK: keys.audit(queue.orgId, ts, opaqueId(6)).SK,
            entityType: 'AuditEvent',
            action: 'QUEUE_JOINED',
            queueId,
            ticket: number,
            ts,
            expiresAt: ttl + 90 * 86400,
          },
        },
      },
    ]);
  } catch (err) {
    if (isCondCheckFailure(err)) {
      // Either a duplicate join (guard) or a duplicate idempotency key.
      if (idempotencyKey) {
        const prior = await store.get(keys.idempotency(queueId, idempotencyKey));
        if (prior?.result) return { ...prior.result, replayed: true };
      }
      throw conflict('You are already in this queue', 'DUPLICATE_JOIN');
    }
    throw err;
  }

  await publishEvent(EVENT_TYPES.QUEUE_JOINED, {
    orgId: queue.orgId,
    queueId,
    token,
    ticket: number,
    display,
    queueName: queue.name,
  });

  return result;
}

// ---------------------------------------------------------------------------
// LEAVE
// ---------------------------------------------------------------------------

export async function leaveQueue(
  { token },
  { store = db(), now = () => new Date().toISOString() } = {},
) {
  if (!token || typeof token !== 'string' || token.length > 160) {
    throw badRequest('Invalid session token');
  }
  const ts = now();
  const found = await store.query({
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :t',
    FilterExpression: '#st IN (:w, :c)',
    ExpressionAttributeNames: { '#st': 'state' },
    ExpressionAttributeValues: {
      ':t': `TOK#${token}`,
      ':w': 'WAITING',
      ':c': 'CALLED',
    },
    ScanIndexForward: false,
    Limit: 5,
  });
  const entry = found.items[0];
  if (!entry) throw notFound('No active queue entry for this session');

  await store.transactWrite([
    {
      Update: {
        Key: { PK: entry.PK, SK: entry.SK },
        UpdateExpression: 'SET #st = :left, updatedAt = :now',
        ConditionExpression: '#st = :w OR #st = :c',
        ExpressionAttributeNames: { '#st': 'state' },
        ExpressionAttributeValues: {
          ':left': 'LEFT',
          ':w': 'WAITING',
          ':c': 'CALLED',
          ':now': ts,
        },
      },
    },
    {
      Delete: {
        Key: { PK: keys.queuePartition(entry.queueId), SK: `CUST#${token}` },
      },
    },
    ...(entry.email
      ? [{ Delete: { Key: { PK: keys.queuePartition(entry.queueId), SK: `CUST#E:${entry.email}` } } }]
      : []),
    ...(entry.phone
      ? [{ Delete: { Key: { PK: keys.queuePartition(entry.queueId), SK: `CUST#P:${entry.phone}` } } }]
      : []),
  ]);

  await publishEvent(EVENT_TYPES.CUSTOMER_LEFT, {
    orgId: entry.orgId,
    queueId: entry.queueId,
    token,
    ticket: entry.ticket,
    display: entry.display,
  });

  return { ticket: entry.ticket, display: entry.display, state: 'LEFT' };
}

// ---------------------------------------------------------------------------
// STAFF OPERATIONS
// ---------------------------------------------------------------------------

function queueGuardChecks(queue) {
  if (!queue) throw notFound('Queue not found');
  if (queue.status !== 'OPEN') throw conflict('This queue is closed', 'QUEUE_CLOSED');
  if (queue.paused) throw conflict('This queue is paused', 'QUEUE_PAUSED');
}

async function nextWaitingEntry(store, queue, afterTicket) {
  let cursor;
  do {
    const res = await store.query({
      KeyConditionExpression: 'PK = :p AND SK > :after',
      FilterExpression: '#st = :waiting',
      ExpressionAttributeNames: { '#st': 'state' },
      ExpressionAttributeValues: {
        ':p': keys.queuePartition(queue.queueId),
        ':after': `ENTRY#${padNum(afterTicket ?? 0, queue.padWidth)}`,
        ':waiting': 'WAITING',
      },
      ScanIndexForward: true,
      ExclusiveStartKey: cursor,
      Limit: 20,
    });
    if (res.items.length > 0) return res.items[0];
    cursor = res.nextCursor;
  } while (cursor);
  return null;
}

/**
 * Calls the next waiting customer. Completes the currently-called customer
 * first, atomically. Safe under concurrency: the transaction's conditional
 * write on the entry guarantees exactly one caller wins; the loser retries
 * with fresh state.
 */
export async function callNext(
  { queueId },
  { store = db(), now = () => new Date().toISOString(), retries = 3 } = {},
) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const ts = now();
    const queue = await store.get(keys.queueMeta(queueId));
    queueGuardChecks(queue);

    const prev = queue.nowServing
      ? await store.get({
          PK: keys.queuePartition(queueId),
          SK: `ENTRY#${padNum(queue.nowServing, queue.padWidth)}`,
        })
      : null;

    const candidate = await nextWaitingEntry(store, queue, queue.lastServedTicket ?? 0);

    if (!candidate) {
      return completeCurrentOnly(store, queue, prev, ts);
    }

    const transact = [
      {
        Update: {
          Key: { PK: candidate.PK, SK: candidate.SK },
          UpdateExpression:
            'SET #st = :called, calledAt = :now, updatedAt = :now, callCount = if_not_exists(callCount, :zero) + :one',
          ConditionExpression: '#st = :waiting',
          ExpressionAttributeNames: { '#st': 'state' },
          ExpressionAttributeValues: {
            ':called': 'CALLED',
            ':waiting': 'WAITING',
            ':now': ts,
            ':zero': 0,
            ':one': 1,
          },
        },
      },
      {
        Update: {
          Key: keys.queueMeta(queueId),
          UpdateExpression: 'SET nowServing = :t, lastServedTicket = :prevT, lastCalledAt = :now, updatedAt = :now',
          ExpressionAttributeValues: {
            ':t': candidate.ticket,
            ':prevT': candidate.ticket - 1,
            ':now': ts,
          },
        },
      },
    ];

    if (prev?.state === 'CALLED') {
      transact.push({
        Update: {
          Key: { PK: prev.PK, SK: prev.SK },
          UpdateExpression: 'SET #st = :served, servedAt = :now, updatedAt = :now, serviceMs = :svc',
          ConditionExpression: '#st = :called',
          ExpressionAttributeNames: { '#st': 'state' },
          ExpressionAttributeValues: {
            ':served': 'SERVED',
            ':called': 'CALLED',
            ':now': ts,
            ':svc': Math.max(0, Date.parse(ts) - Date.parse(prev.calledAt ?? prev.joinedAt)),
          },
        },
      });
    }

    try {
      await store.transactWrite(transact);
    } catch (err) {
      if (isCondCheckFailure(err) && attempt < retries) {
        await sleep(25 * attempt);
        continue;
      }
      if (isCondCheckFailure(err)) {
        throw conflict('Queue changed concurrently, please retry', 'STALE_STATE');
      }
      throw err;
    }

    await publishEvent(EVENT_TYPES.NEXT_CALLED, {
      orgId: queue.orgId,
      queueId,
      ticket: candidate.ticket,
      display: candidate.display,
      token: candidate.token,
      servedTicket: prev?.state === 'CALLED' ? prev.ticket : undefined,
    });
    if (prev?.state === 'CALLED') {
      await publishEvent(EVENT_TYPES.CUSTOMER_SERVED, {
        orgId: queue.orgId, queueId, token: prev.token, ticket: prev.ticket, display: prev.display,
      });
    }

    await maybeEmitTurnApproaching(store, queue, candidate.ticket);

    return {
      called: { ticket: candidate.ticket, display: candidate.display, token: candidate.token },
      served: prev?.state === 'CALLED' ? { ticket: prev.ticket, display: prev.display } : null,
    };
  }
  throw conflict('Queue busy, please retry', 'STALE_STATE');
}

async function completeCurrentOnly(store, queue, prev, ts) {
  if (prev?.state !== 'CALLED') {
    return { called: null, served: null };
  }
  await store.update({
    Key: { PK: prev.PK, SK: prev.SK },
    UpdateExpression: 'SET #st = :served, servedAt = :now, updatedAt = :now, serviceMs = :svc',
    ConditionExpression: '#st = :called',
    ExpressionAttributeNames: { '#st': 'state' },
    ExpressionAttributeValues: {
      ':served': 'SERVED',
      ':called': 'CALLED',
      ':now': ts,
      ':svc': Math.max(0, Date.parse(ts) - Date.parse(prev.calledAt ?? prev.joinedAt)),
    },
  });
  await store.update({
    Key: keys.queueMeta(queue.queueId),
    UpdateExpression: 'REMOVE nowServing SET lastServedTicket = :t, updatedAt = :now',
    ExpressionAttributeValues: { ':t': prev.ticket, ':now': ts },
  });
  await publishEvent(EVENT_TYPES.CUSTOMER_SERVED, {
    orgId: queue.orgId, queueId: queue.queueId, token: prev.token, ticket: prev.ticket, display: prev.display,
  });
  return { called: null, served: { ticket: prev.ticket, display: prev.display } };
}

/** Near-turn alert: warn the next customer if they are almost up. */
async function maybeEmitTurnApproaching(store, queue, calledTicket) {
  const upNext = await nextWaitingEntry(store, queue, calledTicket);
  if (!upNext) return;
  const ahead = await countWaitingBefore(queue.queueId, upNext.ticket, queue.padWidth, store);
  if (ahead <= 2) {
    await publishEvent(EVENT_TYPES.TURN_APPROACHING, {
      orgId: queue.orgId,
      queueId: queue.queueId,
      token: upNext.token,
      ticket: upNext.ticket,
      display: upNext.display,
    });
  }
}

export async function skipCurrent(
  { queueId },
  { store = db(), now = () => new Date().toISOString() } = {},
) {
  const ts = now();
  const queue = await store.get(keys.queueMeta(queueId));
  queueGuardChecks(queue);
  if (!queue.nowServing) throw conflict('No customer is currently called', 'NOTHING_SERVING');

  const prev = await store.get({
    PK: keys.queuePartition(queueId),
    SK: `ENTRY#${padNum(queue.nowServing, queue.padWidth)}`,
  });
  if (prev?.state !== 'CALLED') throw conflict('No customer is currently called', 'NOTHING_SERVING');

  await store.transactWrite([
    {
      Update: {
        Key: { PK: prev.PK, SK: prev.SK },
        UpdateExpression: 'SET #st = :skipped, skippedAt = :now, updatedAt = :now',
        ConditionExpression: '#st = :called',
        ExpressionAttributeNames: { '#st': 'state' },
        ExpressionAttributeValues: { ':skipped': 'SKIPPED', ':called': 'CALLED', ':now': ts },
      },
    },
    {
      Update: {
        Key: keys.queueMeta(queueId),
        UpdateExpression: 'REMOVE nowServing SET lastServedTicket = :t, updatedAt = :now',
        ExpressionAttributeValues: { ':t': prev.ticket, ':now': ts },
      },
    },
  ]);

  await publishEvent(EVENT_TYPES.CUSTOMER_SKIPPED, {
    orgId: queue.orgId, queueId, token: prev.token, ticket: prev.ticket, display: prev.display,
  });
  return { skipped: { ticket: prev.ticket, display: prev.display } };
}

export async function recallCurrent(
  { queueId },
  { store = db(), now = () => new Date().toISOString() } = {},
) {
  const ts = now();
  const queue = await store.get(keys.queueMeta(queueId));
  queueGuardChecks(queue);
  if (!queue.nowServing) throw conflict('No customer is currently called', 'NOTHING_SERVING');

  const entry = await store.get({
    PK: keys.queuePartition(queueId),
    SK: `ENTRY#${padNum(queue.nowServing, queue.padWidth)}`,
  });
  if (entry?.state !== 'CALLED') throw conflict('No customer is currently called', 'NOTHING_SERVING');

  await store.update({
    Key: { PK: entry.PK, SK: entry.SK },
    UpdateExpression:
      'SET recalledAt = :now, updatedAt = :now, recallCount = if_not_exists(recallCount, :zero) + :one',
    ConditionExpression: '#st = :called',
    ExpressionAttributeNames: { '#st': 'state' },
    ExpressionAttributeValues: { ':now': ts, ':zero': 0, ':one': 1, ':called': 'CALLED' },
  });

  await publishEvent(EVENT_TYPES.CUSTOMER_RECALLED, {
    orgId: queue.orgId, queueId, token: entry.token, ticket: entry.ticket, display: entry.display,
  });
  return { recalled: { ticket: entry.ticket, display: entry.display } };
}

// Queue-level state transitions. Each writes the queue meta AND mirrors `open`
// onto the counter item inside one transaction, so a join racing a pause/close
// is rejected by the counter condition.

function counterKeyFor(queue) {
  return keys.counter(queue.queueId, queue.resetDaily ? dayKey(new Date()) : undefined);
}

export async function setQueueState(
  queueId,
  action,
  { store = db(), now = () => new Date().toISOString() } = {},
) {
  const ts = now();
  const queue = await store.get(keys.queueMeta(queueId));
  if (!queue) throw notFound('Queue not found');

  const transitions = {
    pause: { from: 'OPEN', requirePaused: false, setPaused: true, counterOpen: false, event: EVENT_TYPES.QUEUE_PAUSED, status: 'OPEN' },
    resume: { from: 'OPEN', requirePaused: true, setPaused: false, counterOpen: true, event: EVENT_TYPES.QUEUE_RESUMED, status: 'OPEN' },
    close: { from: 'OPEN', requirePaused: null, setPaused: false, counterOpen: false, event: EVENT_TYPES.QUEUE_CLOSED, status: 'CLOSED' },
    reopen: { from: 'CLOSED', requirePaused: null, setPaused: false, counterOpen: true, event: EVENT_TYPES.QUEUE_REOPENED, status: 'OPEN' },
  };
  const t = transitions[action];
  if (!t) throw badRequest(`Unknown queue action: ${action}`);
  if (queue.status !== t.from) {
    throw conflict(`Queue is ${String(queue.status).toLowerCase()}, cannot ${action}`, 'INVALID_STATE');
  }
  if (t.requirePaused !== null && Boolean(queue.paused) !== t.requirePaused) {
    throw conflict(
      action === 'resume' ? 'Queue is not paused' : 'Queue is already paused',
      'INVALID_STATE',
    );
  }

  await store.transactWrite([
    {
      Update: {
        Key: keys.queueMeta(queueId),
        UpdateExpression: 'SET #st = :status, paused = :paused, updatedAt = :now',
        ConditionExpression: '#st = :from',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':status': t.status,
          ':paused': t.setPaused,
          ':from': t.from,
          ':now': ts,
        },
      },
    },
    {
      Update: {
        Key: counterKeyFor(queue),
        UpdateExpression: 'SET #o = :open',
        ExpressionAttributeNames: { '#o': 'open' },
        ExpressionAttributeValues: { ':open': t.counterOpen },
      },
    },
  ]);

  await publishEvent(t.event, { orgId: queue.orgId, queueId, status: t.status, paused: t.setPaused });
  return { status: t.status, paused: t.setPaused };
}
