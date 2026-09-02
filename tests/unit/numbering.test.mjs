import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/setup.mjs';
import { formatTicket, normalizeNumberingConfig, ticketSortKey } from '../../backend/src/shared/numbering.js';
import { keys, pad, dayKey } from '../../backend/src/shared/keys.js';

test('formatTicket produces human-friendly zero-padded numbers', () => {
  assert.equal(formatTicket(1, { prefix: 'A', padWidth: 3 }), 'A-001');
  assert.equal(formatTicket(47, { prefix: 'A', padWidth: 3 }), 'A-047');
  assert.equal(formatTicket(1234, { prefix: 'B', padWidth: 3 }), 'B-1234');
});

test('formatTicket rejects invalid numbers', () => {
  assert.throws(() => formatTicket(0, {}));
  assert.throws(() => formatTicket(-5, {}));
  assert.throws(() => formatTicket(1000000, {}));
  assert.throws(() => formatTicket(Number.NaN, {}));
});

test('normalizeNumberingConfig sanitizes and clamps', () => {
  assert.deepEqual(normalizeNumberingConfig({ prefix: 'x!', padWidth: 99 }), {
    prefix: 'X', padWidth: 6, resetDaily: false,
  });
  assert.equal(normalizeNumberingConfig({}).prefix, 'A');
  assert.equal(normalizeNumberingConfig({ padWidth: -3 }).padWidth, 3);
});

test('ticket sort keys preserve numeric order lexicographically', () => {
  const keys = [1, 2, 10, 99, 100, 999, 1000].map((n) => ticketSortKey(n, 6));
  const sorted = [...keys].sort();
  assert.deepEqual(keys, sorted);
});

test('key builders produce the documented layout', () => {
  assert.deepEqual(keys.queueMeta('q1'), { PK: 'Q#q1', SK: 'META' });
  assert.deepEqual(keys.queueIndex('org1', 'q1'), { PK: 'ORG#org1', SK: 'QUEUE#q1' });
  assert.deepEqual(keys.entry('q1', 7, 3), { PK: 'Q#q1', SK: 'ENTRY#007' });
  assert.deepEqual(keys.customerGuard('q1', 'ctok_x'), { PK: 'Q#q1', SK: 'CUST#ctok_x' });
  assert.deepEqual(keys.counter('q1'), { PK: 'Q#q1', SK: 'COUNTER' });
  assert.deepEqual(keys.counter('q1', '2026-09-02'), { PK: 'Q#q1', SK: 'COUNTER#2026-09-02' });
});

test('pad and dayKey utilities', () => {
  assert.equal(pad(5, 3), '005');
  assert.match(dayKey(new Date('2026-09-02T10:00:00Z')), /^2026-09-02$/);
});
