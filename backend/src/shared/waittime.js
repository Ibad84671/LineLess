// Wait-time estimation from real queue data.
//
// The estimate is explicitly an ESTIMATE: people ahead / effective service
// rate. Service rate derives from the queue's rolling average of actual
// service durations (EWMA), falling back to the configured default.

export const DEFAULT_SERVICE_MS = 5 * 60 * 1000;
export const EWMA_ALPHA = 0.3;

/** Rolling average of service durations; blends new sample at alpha. */
export function updateAvgServiceMs(currentAvgMs, observedMs) {
  const sample = Number.isFinite(observedMs) && observedMs >= 0 && observedMs < 4 * 60 * 60 * 1000
    ? observedMs
    : null;
  if (sample === null) return currentAvgMs ?? DEFAULT_SERVICE_MS;
  if (!Number.isFinite(currentAvgMs) || currentAvgMs <= 0) return sample;
  return Math.round(currentAvgMs * (1 - EWMA_ALPHA) + sample * EWMA_ALPHA);
}

/**
 * @param {number} peopleAhead
 * @param {object} queue - queue meta with avgServiceMs/defaultServiceMs/staffCount
 * @param {boolean} paused
 * @returns {{minutes: number, basis: string}} minutes is a whole-number
 * estimate; basis explains which inputs produced it (shown as "Estimated").
 */
export function estimateWaitMinutes(peopleAhead, queue, paused) {
  if (peopleAhead <= 0) return { minutes: 0, basis: 'you are next' };
  if (paused) return { minutes: null, basis: 'queue paused' };
  const avg = Number.isFinite(queue.avgServiceMs) && queue.avgServiceMs > 0
    ? queue.avgServiceMs
    : (queue.defaultServiceMs || DEFAULT_SERVICE_MS);
  const staff = Math.max(1, Number(queue.staffCount) || 1);
  const minutes = Math.ceil((peopleAhead * avg) / staff / 60000);
  const basis = Number.isFinite(queue.avgServiceMs) && queue.avgServiceMs > 0
    ? 'recent service times'
    : 'typical service time';
  return { minutes, basis };
}
