import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/setup.mjs';
import { estimateWaitMinutes, updateAvgServiceMs, DEFAULT_SERVICE_MS } from '../../backend/src/shared/waittime.js';

const queue = (over = {}) => ({ avgServiceMs: null, defaultServiceMs: 300000, staffCount: 1, ...over });

test('no one ahead means zero wait', () => {
  assert.deepEqual(estimateWaitMinutes(0, queue(), false), { minutes: 0, basis: 'you are next' });
});

test('estimate uses people ahead and default service time', () => {
  const r = estimateWaitMinutes(3, queue(), false);
  assert.equal(r.minutes, 15); // 3 * 5min / 1 staff
  assert.match(r.basis, /typical/);
});

test('estimate uses rolling average when available', () => {
  const r = estimateWaitMinutes(4, queue({ avgServiceMs: 60000 }), false);
  assert.equal(r.minutes, 4);
  assert.match(r.basis, /recent/);
});

test('staff count divides the estimate', () => {
  const r = estimateWaitMinutes(4, queue({ staffCount: 2 }), false);
  assert.equal(r.minutes, 10);
});

test('paused queues report an unknown wait', () => {
  const r = estimateWaitMinutes(5, queue(), true);
  assert.equal(r.minutes, null);
  assert.match(r.basis, /paused/);
});

test('EWMA blends service samples conservatively', () => {
  const base = updateAvgServiceMs(300000, 60000);
  assert.equal(base, Math.round(300000 * 0.7 + 60000 * 0.3));
  // first sample initializes directly
  assert.equal(updateAvgServiceMs(null, 120000), 120000);
  // absurd samples are ignored
  assert.equal(updateAvgServiceMs(300000, 10 * 3600 * 1000), 300000);
  assert.equal(updateAvgServiceMs(null, null), DEFAULT_SERVICE_MS);
});
