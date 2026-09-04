// Notification worker: consumes queue events from SQS and delivers email
// (SES) / SMS (SNS) asynchronously. Guarantees:
// - Idempotent per event id: a notification record is written with a
//   conditional put before sending, so SQS redelivery or retries can never
//   spam a customer twice.
// - Never blocks queue operations (runs entirely downstream of EventBridge).
// - SES/SNS configuration is optional; when absent the delivery is skipped
//   and logged (the platform still works with live queue pages).

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { db } from '../shared/dynamo.js';
import { keys } from '../shared/keys.js';
import { env } from '../shared/env.js';
import { sanitizeText } from '../shared/validate.js';
import { logger } from '../shared/logger.js';

let sesClient = null;
let snsClient = null;

const SUBJECTS = {
  QUEUE_JOINED: 'You are in the queue',
  TURN_APPROACHING: 'Almost your turn',
  NEXT_CALLED: 'It is your turn',
  QUEUE_CLOSED: 'Queue closed',
};

function emailBody(type, d) {
  const queue = sanitizeText(d.queueName ?? 'the queue', 100);
  const ticket = sanitizeText(d.display ?? '', 12);
  switch (type) {
    case 'QUEUE_JOINED':
      return `You joined ${queue}. Your number is ${ticket}. Keep this page open to see live updates.`;
    case 'TURN_APPROACHING':
      return `Heads up: you are almost up at ${queue}. Your number ${ticket} is next in line. Please head over now.`;
    case 'NEXT_CALLED':
      return `It is your turn at ${queue}. Your number ${ticket} is being called. Please go to the counter now.`;
    case 'QUEUE_CLOSED':
      return `${queue} has closed before your number ${ticket} was called. We apologize for the inconvenience.`;
    default:
      return `Update for ${queue}: your number ${ticket}.`;
  }
}

/**
 * Processes one notification request. Returns true when handled (sent or
 * intentionally skipped), false to signal the record should be retried.
 */
export async function processNotification(event, { store = db() } = {}) {
  const type = event['detail-type'];
  const d = event.detail ?? {};
  const eventId = event.id;
  const orgId = d.orgId;
  if (!eventId || !orgId || !d.queueId) {
    logger.warn('Malformed notification event ignored', { type: type ?? null });
    return true;
  }

  // QUEUE_CLOSED is a fan-out notification: every still-waiting customer
  // gets a cancellation notice (each individually idempotent).
  if (type === 'QUEUE_CLOSED') {
    return notifyQueueClosed(store, event);
  }

  // Idempotency: conditional put wins exactly once per event id. The key is
  // the full notificationLog key (PK + SK = NTF#eventId) — using a constant SK
  // here would make the first notification ever block all later ones for the
  // organization, because attribute_not_exists evaluates against the whole key.
  try {
    await store.transactWrite([
      {
        Put: {
          Item: {
            PK: keys.notificationLog(orgId, eventId).PK,
            SK: keys.notificationLog(orgId, eventId).SK,
            entityType: 'Notification',
            eventId,
            type,
            queueId: d.queueId,
            createdAt: new Date().toISOString(),
            expiresAt: Math.floor(Date.now() / 1000) + 30 * 86400,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ]);
  } catch (err) {
    if (err?.name === 'TransactionCanceledException' || err?.name === 'ConditionalCheckFailedException') {
      logger.info('Duplicate notification suppressed', { eventId, type });
      return true;
    }
    throw err;
  }

  // Resolve the customer's contact info from their entry.
  const entry = await store.get({
    PK: `Q#${d.queueId}`,
    SK: `ENTRY#${String(d.ticket ?? '').padStart(Number(d.padWidth ?? 3), '0')}`,
  }).catch(() => null);

  const contact = await resolveContact(store, d.token, entry);

  if (!contact.email && !contact.phone) {
    logger.info('No contact info for customer; notification skipped', { type });
    return true;
  }

  await deliver(type, d, contact);
  return true;
}

async function notifyQueueClosed(store, event) {
  const d = event.detail ?? {};
  const res = await store.query({
    KeyConditionExpression: 'PK = :p',
    FilterExpression: '#st = :w',
    ExpressionAttributeNames: { '#st': 'state' },
    ExpressionAttributeValues: { ':p': `Q#${d.queueId}`, ':w': 'WAITING' },
    Limit: 500,
  });
  for (const entry of res.items) {
    const perCustomerId = `${event.id}:${entry.ticket}`;
    try {
      await store.transactWrite([
        {
          Put: {
            Item: {
              PK: keys.notificationLog(d.orgId, perCustomerId).PK,
              SK: keys.notificationLog(d.orgId, perCustomerId).SK,
              entityType: 'Notification',
              eventId: perCustomerId,
              type: 'QUEUE_CLOSED',
              queueId: d.queueId,
              createdAt: new Date().toISOString(),
              expiresAt: Math.floor(Date.now() / 1000) + 30 * 86400,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
      ]);
    } catch {
      continue; // already notified this customer for this closure
    }
    const contact = await resolveContact(store, entry.token, entry);
    if (contact.email || contact.phone) {
      await deliver('QUEUE_CLOSED', { ...d, display: entry.display }, contact);
    }
  }
  return true;
}

async function deliver(type, d, contact) {
  const body = emailBody(type, d);
  let sent = false;

  if (contact.email && env.senderEmail) {
    if (!sesClient) sesClient = new SESv2Client({ region: env.region });
    try {
      await sesClient.send(new SendEmailCommand({
        FromEmailAddress: env.senderEmail,
        Destination: { ToAddresses: [contact.email] },
        Content: {
          Simple: {
            Subject: { Data: `LineLess — ${SUBJECTS[type] ?? 'Queue update'}` },
            Body: { Text: { Data: body } },
          },
        },
      }));
      sent = true;
    } catch (err) {
      logger.error('SES send failed', { type, error: err.name });
    }
  }

  if (contact.phone && env.smsTopicArn) {
    if (!snsClient) snsClient = new SNSClient({ region: env.region });
    try {
      await snsClient.send(new PublishCommand({
        TopicArn: env.smsTopicArn,
        Message: body,
        MessageAttributes: {
          SMSType: { DataType: 'String', StringValue: 'Transactional' },
        },
      }));
      sent = true;
    } catch (err) {
      logger.error('SNS send failed', { type, error: err.name });
    }
  }

  if (!sent) {
    logger.warn('Notification not delivered (channel unconfigured or failed)', { type });
  }
}

async function resolveContact(store, token, entry) {
  const contact = { email: null, phone: null };
  if (entry?.email) contact.email = entry.email;
  if (entry?.phone) contact.phone = entry.phone;
  if ((!contact.email && !contact.phone) && token) {
    const profile = await store.get(keys.customerProfile(token)).catch(() => null);
    if (profile?.email) contact.email = profile.email;
    if (profile?.phone) contact.phone = profile.phone;
  }
  return contact;
}

/** SQS batch entrypoint helper: returns messageIds that must be retried. */
export function failedBatchItemIds(records, results) {
  return records.filter((_, i) => results[i] === false).map((r) => r.messageId);
}
