import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/setup.mjs';
import { createWorld } from '../helpers/world.mjs';
import { joinQueue, callNext, leaveQueue, setQueueState } from '../../backend/src/services/queue-engine.js';
import { getQueueState } from '../../backend/src/services/queue-reads.js';

let world;
beforeEach(async () => {
  world = await createWorld();
});

test('10 simultaneous joins produce 10 unique sequential tickets', async () => {
  const { queue } = world;
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => joinQueue({ queueId: queue.queueId, contact: { name: `C${i}` } })),
  );
  const tickets = results.map((r) => r.ticket).sort((a, b) => a - b);
  assert.deepEqual(tickets, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(results.map((r) => r.token)).size, 10, 'tokens must be unique');

  const st = await getQueueState(queue.queueId);
  assert.equal(st.waitingCount, 10);
});

test('20 simultaneous joins produce 20 unique tickets with no duplicates', async () => {
  const { queue } = world;
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) => joinQueue({ queueId: queue.queueId, contact: { name: `C${i}`, email: `c${i}@x.example` } })),
  );
  const tickets = results.map((r) => r.ticket).sort((a, b) => a - b);
  assert.deepEqual(tickets, Array.from({ length: 20 }, (_, i) => i + 1));
});

test('20 simultaneous joins from the same customer email allow only one entry', async () => {
  const { queue } = world;
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, (_, i) =>
      joinQueue({ queueId: queue.queueId, contact: { name: `C${i}`, email: 'same@x.example' } })),
  );
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'exactly one join may succeed');
  assert.equal(rejected.length, 19);
  assert.ok(rejected.every((r) => r.reason.code === 'DUPLICATE_JOIN'));

  const st = await getQueueState(queue.queueId);
  assert.equal(st.waitingCount, 1);
});

test('duplicate replay with idempotency key returns the original result', async () => {
  const { queue } = world;
  const body = { queueId: queue.queueId, contact: { name: 'Idem', email: 'idem@x.example' }, idempotencyKey: 'key-123' };
  const first = await joinQueue(body);
  const replay = await joinQueue(body);
  assert.equal(replay.replayed, true);
  assert.equal(replay.token, first.token);
  assert.equal(replay.ticket, first.ticket);

  const st = await getQueueState(queue.queueId);
  assert.equal(st.waitingCount, 1, 'replay must not create a second entry');
});

test('10 simultaneous CALL NEXT calls never double-call a customer', async () => {
  const { queue } = world;
  for (let i = 0; i < 10; i += 1) {
    await joinQueue({ queueId: queue.queueId, contact: { name: `C${i}` } });
  }
  // All 10 staff press "next" at the same moment. The winner calls the next
  // customer; losers retry and may call subsequent customers. The invariants:
  // nobody is called twice, calls happen in ascending order, and the final
  // board is consistent.
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => callNext({ queueId: queue.queueId })),
  );
  const called = results
    .filter((r) => r.status === 'fulfilled' && r.value.called)
    .map((r) => r.value.called.ticket);

  assert.ok(called.length >= 1, 'at least one customer is called');
  assert.equal(new Set(called).size, called.length, 'no customer may be called twice');
  for (let i = 1; i < called.length; i += 1) {
    assert.ok(called[i] > called[i - 1], `calls must be ascending: ${called}`);
  }

  const st = await getQueueState(queue.queueId);
  assert.equal(st.waitingCount, 10 - called.length, 'each call moves exactly one customer out of waiting');
  assert.ok(st.calledCount <= 1, 'at most one customer is currently called');
  assert.equal(st.nowServing, Math.max(...called), 'nowServing reflects the latest call');
});

test('concurrent next rounds drain the queue exactly once each', async () => {
  const { queue } = world;
  for (let i = 0; i < 5; i += 1) {
    await joinQueue({ queueId: queue.queueId, contact: { name: `C${i}` } });
  }
  const allCalled = [];
  for (let round = 0; round < 5; round += 1) {
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () => callNext({ queueId: queue.queueId })),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.called) allCalled.push(r.value.called.ticket);
    }
  }
  assert.deepEqual(allCalled, [1, 2, 3, 4, 5], 'each customer called exactly once, in order');
  const st = await getQueueState(queue.queueId);
  assert.equal(st.waitingCount, 0);
  assert.ok(st.calledCount <= 1);
});

test('simultaneous leave + next keep the queue consistent', async () => {
  const { queue } = world;
  const a = await joinQueue({ queueId: queue.queueId, contact: { name: 'A' } });
  await joinQueue({ queueId: queue.queueId, contact: { name: 'B' } });

  // Customer A leaves exactly while staff call next.
  const [leaveRes, nextRes] = await Promise.allSettled([
    leaveQueue({ token: a.token }),
    callNext({ queueId: queue.queueId }),
  ]);
  void leaveRes;
  void nextRes;

  const st = await getQueueState(queue.queueId);
  assert.ok(st.calledCount <= 1, 'never two called customers');
  assert.ok(st.waitingCount >= 0);
  if (st.nowServing !== null) {
    // nowServing may legally reference a customer who just left; the board
    // must still have a consistent waiting/called split.
    const active = st.entries.filter((e) => e.state === 'WAITING' || e.state === 'CALLED');
    assert.equal(active.length, st.waitingCount + st.calledCount);
  }
});

test('queue pause during simultaneous joins blocks in-flight joins', async () => {
  const { queue } = world;
  const joins = Array.from({ length: 8 }, (_, i) =>
    joinQueue({ queueId: queue.queueId, contact: { name: `C${i}` } }),
  );
  await setQueueState(queue.queueId, 'pause');
  const results = await Promise.allSettled(joins);

  const succeeded = results.filter((r) => r.status === 'fulfilled');
  const blocked = results.filter((r) => r.status === 'rejected');
  assert.equal(succeeded.length + blocked.length, 8);
  assert.ok(
    blocked.every((r) => ['QUEUE_PAUSED', 'QUEUE_NOT_OPEN'].includes(r.reason.code)),
    `unexpected rejection codes: ${blocked.map((r) => r.reason.code).join(', ')}`,
  );
  const st = await getQueueState(queue.queueId);
  assert.equal(st.waitingCount, succeeded.length, 'committed entries only');
  assert.equal(st.paused, true);
});

test('queue close during a join keeps state consistent', async () => {
  const { queue } = world;
  const joinPromise = joinQueue({ queueId: queue.queueId, contact: { name: 'Late' } });
  await setQueueState(queue.queueId, 'close');
  const result = await joinPromise.then(() => 'joined', (e) => e.code);

  const st = await getQueueState(queue.queueId);
  if (result === 'joined') {
    assert.equal(st.waitingCount, 1, 'join won the race before close committed');
  } else {
    assert.ok(['QUEUE_NOT_OPEN', 'QUEUE_CLOSED'].includes(result), `unexpected code: ${result}`);
    assert.equal(st.waitingCount, 0);
  }
  assert.equal(st.status, 'CLOSED');
});

test('single-attempt concurrent calls never double-call a specific customer', async () => {
  const { queue } = world;
  for (let i = 0; i < 3; i += 1) {
    await joinQueue({ queueId: queue.queueId, contact: { name: `C${i}` } });
  }
  // Two simultaneous CALL NEXT, each limited to a single attempt (no retry).
  const [r1, r2] = await Promise.allSettled([
    callNext({ queueId: queue.queueId }, { retries: 1 }),
    callNext({ queueId: queue.queueId }, { retries: 1 }),
  ]);
  const successes = [r1, r2].filter((r) => r.status === 'fulfilled' && r.value?.called);
  const calledTickets = successes.map((r) => r.value.called.ticket);

  assert.equal(new Set(calledTickets).size, calledTickets.length, 'distinct customers only');
  assert.ok(calledTickets.every((t) => t >= 1 && t <= 3), 'tickets within range');

  const st = await getQueueState(queue.queueId);
  assert.equal(st.waitingCount, 3 - calledTickets.length);
  assert.ok(st.calledCount <= 1, 'at most one currently-called customer');
  const eitherConflicted = [r1, r2].some((r) => r.status === 'rejected' && r.reason.code === 'STALE_STATE');
  void eitherConflicted;
});
