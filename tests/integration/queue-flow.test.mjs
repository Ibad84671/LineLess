import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/setup.mjs';
import { createWorld } from '../helpers/world.mjs';
import { joinQueue, leaveQueue, callNext, skipCurrent, recallCurrent, setQueueState } from '../../backend/src/services/queue-engine.js';
import { getPublicQueue, getDisplayState, getCustomerSession, getQueueState } from '../../backend/src/services/queue-reads.js';

let world;
beforeEach(async () => {
  world = await createWorld();
});

test('join issues a formatted ticket and live state', async () => {
  const { queue } = world;
  const r = await joinQueue({ queueId: queue.queueId, contact: { name: 'Alice', email: 'alice@x.example' } });
  assert.equal(r.display, 'A-001');
  assert.match(r.token, /^ctok_/);

  const pub = await getPublicQueue(queue.queueId);
  assert.equal(pub.waitingCount, 1);
  assert.equal(pub.status, 'OPEN');

  const session = await getCustomerSession(r.token);
  assert.equal(session.display, 'A-001');
  assert.equal(session.peopleAhead, 0);
  assert.equal(session.estimatedWaitMinutes, 0);
});

test('sequential joins get strictly increasing tickets and positions', async () => {
  const { queue } = world;
  const a = await joinQueue({ queueId: queue.queueId, contact: { name: 'A' } });
  const b = await joinQueue({ queueId: queue.queueId, contact: { name: 'B' } });
  const c = await joinQueue({ queueId: queue.queueId, contact: { name: 'C' } });
  assert.deepEqual([a.ticket, b.ticket, c.ticket], [1, 2, 3]);

  const sessionB = await getCustomerSession(b.token);
  assert.equal(sessionB.peopleAhead, 1);
  assert.equal(sessionB.estimatedWaitMinutes, 5);

  const display = await getDisplayState(queue.queueId);
  assert.equal(display.nowServing, null);
  assert.deepEqual(display.next.map((x) => x.display), ['A-001', 'A-002', 'A-003']);
});

test('duplicate join by the same customer email is rejected', async () => {
  const { queue } = world;
  const first = await joinQueue({ queueId: queue.queueId, contact: { name: 'A', email: 'dup@x.example' } });
  assert.equal(first.ticket, 1);
  await assert.rejects(
    () => joinQueue({ queueId: queue.queueId, contact: { name: 'A again', email: 'dup@x.example' } }),
    (err) => err.code === 'DUPLICATE_JOIN',
  );
  // A different customer with a different email can still join.
  // Note: gaps in ticket numbers are expected when a join fails after the
  // counter increments — the failed attempt consumed ticket #2.
  const other = await joinQueue({ queueId: queue.queueId, contact: { name: 'B', email: 'b@x.example' } });
  assert.equal(other.ticket, 3);
});

test('leaving frees the email guard so the customer can rejoin', async () => {
  const { queue } = world;
  const first = await joinQueue({ queueId: queue.queueId, contact: { name: 'A', email: 're@x.example' } });
  await leaveQueue({ token: first.token });
  const again = await joinQueue({ queueId: queue.queueId, contact: { name: 'A', email: 're@x.example' } });
  assert.equal(again.display, 'A-002');
});

test('join with no contact info is rejected', async () => {
  const { queue } = world;
  await assert.rejects(() => joinQueue({ queueId: queue.queueId, contact: {} }), (e) => e.status === 400);
});

test('call next serves previous and calls candidate', async () => {
  const { queue } = world;
  const a = await joinQueue({ queueId: queue.queueId, contact: { name: 'A' } });
  await joinQueue({ queueId: queue.queueId, contact: { name: 'B' } });

  const r1 = await callNext({ queueId: queue.queueId });
  assert.equal(r1.called.ticket, 1);
  assert.equal(r1.served, null);

  const sessionA = await getCustomerSession(a.token);
  assert.equal(sessionA.state, 'CALLED');

  const r2 = await callNext({ queueId: queue.queueId });
  assert.equal(r2.called.ticket, 2);
  assert.equal(r2.served.ticket, 1);

  const st = await getQueueState(queue.queueId);
  assert.equal(st.waitingCount, 0);
  assert.equal(st.nowServingDisplay, 'A-002');
});

test('call next with nobody waiting completes current only', async () => {
  const { queue } = world;
  await joinQueue({ queueId: queue.queueId, contact: { name: 'A' } });
  await callNext({ queueId: queue.queueId });
  const r = await callNext({ queueId: queue.queueId });
  assert.equal(r.called, null);
  assert.equal(r.served.ticket, 1);
  const st = await getQueueState(queue.queueId);
  assert.equal(st.nowServing, null);
});

test('skip marks the current customer and advances fairly', async () => {
  const { queue } = world;
  await joinQueue({ queueId: queue.queueId, contact: { name: 'A' } });
  await joinQueue({ queueId: queue.queueId, contact: { name: 'B' } });
  await callNext({ queueId: queue.queueId });

  const r = await skipCurrent({ queueId: queue.queueId });
  assert.equal(r.skipped.display, 'A-001');

  const next = await callNext({ queueId: queue.queueId });
  assert.equal(next.called.ticket, 2); // skipped customer is not recalled
});

test('recall increments the recall count on a called customer', async () => {
  const { queue } = world;
  await joinQueue({ queueId: queue.queueId, contact: { name: 'A' } });
  await callNext({ queueId: queue.queueId });
  const r = await recallCurrent({ queueId: queue.queueId });
  assert.equal(r.recalled.display, 'A-001');
  const st = await getQueueState(queue.queueId);
  assert.equal(st.entries.find((e) => e.display === 'A-001').callCount, 1);
});

test('recall with nobody serving conflicts', async () => {
  const { queue } = world;
  await assert.rejects(() => recallCurrent({ queueId: queue.queueId }), (e) => e.code === 'NOTHING_SERVING');
});

test('pause blocks joins; resume reopens; close is terminal', async () => {
  const { queue } = world;
  await setQueueState(queue.queueId, 'pause');
  await assert.rejects(() => joinQueue({ queueId: queue.queueId, contact: { name: 'A' } }), (e) => e.code === 'QUEUE_PAUSED');

  await setQueueState(queue.queueId, 'resume');
  const joined = await joinQueue({ queueId: queue.queueId, contact: { name: 'A' } });
  assert.equal(joined.display, 'A-001');

  await setQueueState(queue.queueId, 'close');
  await assert.rejects(() => joinQueue({ queueId: queue.queueId, contact: { name: 'B' } }), (e) => e.code === 'QUEUE_CLOSED');
  await assert.rejects(() => callNext({ queueId: queue.queueId }), (e) => e.code === 'QUEUE_CLOSED');

  await setQueueState(queue.queueId, 'reopen');
  await assert.rejects(() => setQueueState(queue.queueId, 'resume'), (e) => e.code === 'INVALID_STATE');
});

test('leave removes the customer and updates the board', async () => {
  const { queue } = world;
  const a = await joinQueue({ queueId: queue.queueId, contact: { name: 'A' } });
  await joinQueue({ queueId: queue.queueId, contact: { name: 'B' } });
  await leaveQueue({ token: a.token });

  const st = await getQueueState(queue.queueId);
  assert.equal(st.waitingCount, 1);
  assert.equal(st.entries[0].display, 'A-002');

  await assert.rejects(() => getCustomerSession(a.token), (e) => e.status === 404);
  await assert.rejects(() => leaveQueue({ token: a.token }), (e) => e.status === 404);
});

test('unknown queue rejects joins and reads', async () => {
  await assert.rejects(() => joinQueue({ queueId: 'nope', contact: { name: 'A' } }), (e) => e.status === 404);
  await assert.rejects(() => getPublicQueue('nope'), (e) => e.status === 404);
});

test('domain events are recorded for queue operations', async () => {
  const { queue } = world;
  const { recordedEvents, resetEvents } = await import('../helpers/setup.mjs');
  resetEvents();
  const a = await joinQueue({ queueId: queue.queueId, contact: { name: 'A' } });
  await callNext({ queueId: queue.queueId });
  const types = recordedEvents.map((e) => e.type);
  assert.ok(types.includes('QUEUE_JOINED'));
  assert.ok(types.includes('NEXT_CALLED'));
  const joined = recordedEvents.find((e) => e.type === 'QUEUE_JOINED');
  assert.equal(joined.detail.token, a.token);
});
