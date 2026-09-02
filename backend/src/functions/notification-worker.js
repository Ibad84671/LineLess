// SQS target Lambda: notification delivery worker with DLQ backing.

import { processNotification, failedBatchItemIds } from '../services/notify.js';
import { assertEnv } from '../shared/env.js';
import { logger } from '../shared/logger.js';

export async function handler(event) {
  assertEnv(['tableName']);
  const records = event.Records ?? [];
  const results = [];

  for (const record of records) {
    try {
      const body = typeof record.body === 'string' ? JSON.parse(record.body) : record.body;
      // EventBridge -> SQS pipe wraps the event in {detail, 'detail-type', id}.
      results.push(await processNotification(body, {}));
    } catch (err) {
      logger.error('notification processing failed', {
        messageId: record.messageId,
        error: err.message,
      });
      results.push(false); // let SQS retry; DLQ after maxReceiveCount
    }
  }

  const failed = failedBatchItemIds(records, results);
  if (failed.length > 0) {
    // Report partial batch failure so only failed messages are retried.
    throw new Error(`Notification delivery failed for: ${failed.join(',')}`);
  }
  return { batchItemFailures: [] };
}
