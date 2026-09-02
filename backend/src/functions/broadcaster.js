// EventBridge rule target: fans committed queue events out to WebSocket
// subscribers. Failures here never affect queue correctness.

import { handleQueueEvent } from '../services/broadcast.js';
import { logger } from '../shared/logger.js';

export async function handler(event) {
  // EventBridge sends one record per event for our rule.
  const results = await Promise.all(
    (event.Records ?? [event]).map(async (record) => {
      try {
        await handleQueueEvent(record, {});
        return true;
      } catch (err) {
        // Throwing causes EventBridge retry; log full detail first.
        logger.error('broadcast failed', { error: err.message, type: record['detail-type'] });
        throw err;
      }
    }),
  );
  return { ok: results.every(Boolean) };
}
