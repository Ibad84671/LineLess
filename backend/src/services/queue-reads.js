// Queue read models: public join info, TV display state, customer session
// state, and the staff queue view. Read-side functions never mutate and
// never expose internal keys or other customers' contact details.

import { db } from '../shared/dynamo.js';
import { keys, pad as padNum } from '../shared/keys.js';
import { notFound, badRequest } from '../shared/errors.js';
import { estimateWaitMinutes } from '../shared/waittime.js';

async function loadQueue(queueId, store) {
  if (!queueId || typeof queueId !== 'string' || queueId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(queueId)) {
    throw badRequest('Invalid queue id');
  }
  const queue = await store.get(keys.queueMeta(queueId));
  if (!queue) throw notFound('Queue not found');
  return queue;
}

async function displayOf(store, queue, ticket) {
  if (!ticket) return null;
  const entry = await store.get({
    PK: keys.queuePartition(queue.queueId),
    SK: `ENTRY#${padNum(ticket, queue.padWidth)}`,
  });
  return entry?.display ?? null;
}

async function countWaiting(store, queueId) {
  const res = await store.query({
    KeyConditionExpression: 'PK = :p',
    FilterExpression: '#st = :s',
    ExpressionAttributeNames: { '#st': 'state' },
    ExpressionAttributeValues: { ':p': keys.queuePartition(queueId), ':s': 'WAITING' },
    Select: 'COUNT',
  });
  return res.count;
}

/** Public join-page data: queue identity + live counters, no customer data. */
export async function getPublicQueue(queueId, { store = db() } = {}) {
  const queue = await loadQueue(queueId, store);
  const waitingCount = await countWaiting(store, queueId);
  return {
    queueId,
    orgId: queue.orgId,
    name: queue.name,
    description: queue.description ?? null,
    orgName: queue.orgName ?? null,
    branchName: queue.branchName ?? null,
    serviceName: queue.serviceName ?? null,
    status: queue.status,
    paused: Boolean(queue.paused),
    nowServing: queue.nowServing ?? null,
    nowServingDisplay: await displayOf(store, queue, queue.nowServing),
    prefix: queue.prefix,
    padWidth: queue.padWidth,
    waitingCount,
    avgWaitMinutes: queue.avgServiceMs
      ? Math.max(1, Math.round(queue.avgServiceMs / 60000))
      : null,
  };
}

/** TV / reception display state: now serving + next up. */
export async function getDisplayState(queueId, { store = db() } = {}) {
  const queue = await loadQueue(queueId, store);
  const res = await store.query({
    KeyConditionExpression: 'PK = :p',
    FilterExpression: '#st = :waiting',
    ExpressionAttributeNames: { '#st': 'state' },
    ExpressionAttributeValues: { ':p': keys.queuePartition(queueId), ':waiting': 'WAITING' },
    ScanIndexForward: true,
    Limit: 8,
  });
  return {
    queueId,
    name: queue.name,
    orgName: queue.orgName ?? null,
    status: queue.status,
    paused: Boolean(queue.paused),
    nowServing: await displayOf(store, queue, queue.nowServing),
    next: res.items.map((e) => ({ display: e.display, ticket: e.ticket })),
    updatedAt: queue.updatedAt ?? null,
  };
}

/** Customer live session state, keyed by the customer's opaque token. */
export async function getCustomerSession(token, { store = db(), now = () => new Date().toISOString() } = {}) {
  if (!token || typeof token !== 'string' || token.length > 160) {
    throw badRequest('Invalid session token');
  }
  const found = await store.query({
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :t',
    FilterExpression: '#st IN (:w, :c)',
    ExpressionAttributeNames: { '#st': 'state' },
    ExpressionAttributeValues: { ':t': `TOK#${token}`, ':w': 'WAITING', ':c': 'CALLED' },
    ScanIndexForward: false,
    Limit: 5,
  });
  const entry = found.items[0];
  if (!entry) throw notFound('No active queue session');

  const queue = await loadQueue(entry.queueId, store);
  const waiting = entry.state === 'WAITING'
    ? await countWaitingBeforeMe(store, queue, entry.ticket)
    : 0;
  const estimate = entry.state === 'WAITING'
    ? estimateWaitMinutes(waiting, queue, queue.paused)
    : { minutes: 0, basis: entry.state === 'CALLED' ? 'it is your turn' : 'done' };

  return {
    token,
    queueId: entry.queueId,
    queueName: queue.name,
    orgName: queue.orgName ?? null,
    ticket: entry.ticket,
    display: entry.display,
    state: entry.state,
    peopleAhead: entry.state === 'WAITING' ? waiting : 0,
    estimatedWaitMinutes: estimate.minutes,
    estimateBasis: estimate.basis,
    nowServing: queue.nowServing ?? null,
    nowServingDisplay: await displayOf(store, queue, queue.nowServing),
    queueStatus: queue.status,
    queuePaused: Boolean(queue.paused),
    updatedAt: now(),
  };
}

async function countWaitingBeforeMe(store, queue, ticket) {
  // No one can be ahead of ticket #1
  if (ticket <= 1) return 0;
  const res = await store.query({
    KeyConditionExpression: 'PK = :p AND SK BETWEEN :lo AND :hi',
    FilterExpression: '#st = :waiting',
    ExpressionAttributeNames: { '#st': 'state' },
    ExpressionAttributeValues: {
      ':p': keys.queuePartition(queue.queueId),
      ':lo': `ENTRY#${padNum(1, queue.padWidth)}`,
      ':hi': `ENTRY#${padNum(ticket - 1, queue.padWidth)}`,
      ':waiting': 'WAITING',
    },
    Select: 'COUNT',
  });
  return res.count;
}

function maskName(name) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0];
  const initial = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return `${first[0].toUpperCase()}${first.slice(1).toLowerCase()}${initial}`.trim();
}

/** Staff queue view: queue meta + waiting/called lists (contact data omitted
 * beyond a masked name so the screen never shows full PII). */
export async function getQueueState(queueId, { store = db() } = {}) {
  const queue = await loadQueue(queueId, store);
  const res = await store.query({
    KeyConditionExpression: 'PK = :p',
    FilterExpression: '#st IN (:w, :c)',
    ExpressionAttributeNames: { '#st': 'state' },
    ExpressionAttributeValues: {
      ':p': keys.queuePartition(queueId),
      ':w': 'WAITING',
      ':c': 'CALLED',
    },
    ScanIndexForward: true,
    Limit: 200,
  });

  let position = 0;
  const entries = res.items.map((e) => {
    let estimateMinutes = 0;
    if (e.state === 'WAITING') {
      estimateMinutes = estimateWaitMinutes(position, queue, queue.paused).minutes;
      position += 1;
    }
    return {
      ticket: e.ticket,
      display: e.display,
      state: e.state,
      name: e.name ? maskName(e.name) : null,
      joinedAt: e.joinedAt,
      calledAt: e.calledAt ?? null,
      callCount: e.callCount ?? 0,
      estimateMinutes,
    };
  });

  const waiting = entries.filter((e) => e.state === 'WAITING');
  const called = entries.filter((e) => e.state === 'CALLED');

  return {
    queueId,
    name: queue.name,
    orgId: queue.orgId,
    orgName: queue.orgName ?? null,
    status: queue.status,
    paused: Boolean(queue.paused),
    nowServing: queue.nowServing ?? null,
    nowServingDisplay: await displayOf(store, queue, queue.nowServing),
    waitingCount: waiting.length,
    calledCount: called.length,
    estimatedWaitMinutes: waiting.length > 0
      ? estimateWaitMinutes(waiting.length, queue, queue.paused).minutes
      : 0,
    avgServiceMinutes: queue.avgServiceMs
      ? Math.round((queue.avgServiceMs / 60000) * 10) / 10
      : null,
    entries,
  };
}
