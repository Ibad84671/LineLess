import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/setup.mjs';
import { installMemStore } from '../helpers/setup.mjs';
import { handler as notifyHandler } from '../../backend/src/functions/notification-worker.js';
import { processNotification } from '../../backend/src/services/notify.js';
import { keys } from '../../backend/src/shared/keys.js';

let store;

beforeEach(() => {
  store = installMemStore();
});

function ebEvent({ id = 'evt-1', type = 'QUEUE_JOINED', orgId = 'org-1', queueId = 'q-1', ticket = 1, padWidth = 3, token = null } = {}) {
  return {
    id,
    'detail-type': type,
    source: 'lineless.queue',
    detail: { orgId, queueId, ticket, padWidth, ...(token ? { token } : {}) },
  };
}

const sqsRecord = (event, messageId = `msg-${event.id}`) => ({
  messageId,
  body: JSON.stringify(event),
});

test('partial batch failure reports only the failed messageId (never throws)', async () => {
  const good = ebEvent({ id: 'evt-good', token: 'ctok_abcdefghijklmnopqrstuvwxyz123456' });
  const bad = sqsRecord({}, 'msg-bad');
  bad.body = 'this is not json{{';

  const res = await notifyHandler({ Records: [sqsRecord(good, 'msg-good'), bad] });
  assert.deepEqual(res.batchItemFailures, [{ itemIdentifier: 'msg-bad' }],
    'only the malformed record may be reported for retry');
});

test('successful batch reports zero failures', async () => {
  const good = ebEvent({ id: 'evt-ok' });
  const res = await notifyHandler({ Records: [sqsRecord(good)] });
  assert.deepEqual(res.batchItemFailures, []);
});

test('duplicate events are suppressed by the idempotency log (one record only)', async () => {
  const event = ebEvent({ id: 'evt-dup', orgId: 'org-1', type: 'QUEUE_JOINED' });
  assert.equal(await processNotification(event, { store }), true);
  assert.equal(await processNotification(event, { store }), true, 'replay must be a no-op');

  const log = await store.query({
    KeyConditionExpression: 'PK = :p',
    ExpressionAttributeValues: { ':p': keys.notificationLog('org-1', 'evt-dup').PK },
  });
  assert.equal(log.items.length, 1, 'exactly one notification log record');
});

test('malformed events (missing orgId/queueId) are acknowledged, not retried forever', async () => {
  assert.equal(await processNotification({ id: 'x', 'detail-type': 'QUEUE_JOINED', detail: {} }, { store }), true);
});

test('QUEUE_CLOSED fans out one idempotent notification per waiting customer', async () => {
  // Seed two waiting entries in the queue partition.
  const entries = [
    { ticket: 1, display: 'A-001', token: 'ctok_abcdefghijklmnopqrstuvwxyz123456', email: 'a@x.example' },
    { ticket: 2, display: 'A-002', token: 'ctok_abcdefghijklmnopqrstuvwxyz789012', email: 'b@x.example' },
  ];
  for (const e of entries) {
    await store.put({
      PK: 'Q#q-1',
      SK: `ENTRY#${String(e.ticket).padStart(3, '0')}`,
      entityType: 'QueueEntry',
      queueId: 'q-1',
      orgId: 'org-1',
      state: 'WAITING',
      token: e.token,
      email: e.email,
      ticket: e.ticket,
      display: e.display,
      joinedAt: new Date().toISOString(),
    });
  }

  const event = ebEvent({ id: 'evt-close', type: 'QUEUE_CLOSED', orgId: 'org-1', queueId: 'q-1' });
  assert.equal(await processNotification(event, { store }), true);

  const logKeys = [
    keys.notificationLog('org-1', 'evt-close:1'),
    keys.notificationLog('org-1', 'evt-close:2'),
  ];
  for (const k of logKeys) {
    const rec = await store.get(k);
    assert.ok(rec, `notification log for ticket ${k.SK} must exist`);
  }
  // Replaying the closure must not duplicate notifications.
  assert.equal(await processNotification(event, { store }), true);
  const firstLog = await store.get(logKeys[0]);
  assert.equal(firstLog.eventId, 'evt-close:1');
});
