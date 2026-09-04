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
      results.push(false); // signal this record for retry; DLQ after maxReceiveCount
    }
  }

  // The event source mapping enables ReportBatchItemFailures, so report only
  // the failed messageIds — successful messages in the batch are NOT retried.
  const failed = failedBatchItemIds(records, results);
  return {
    batchItemFailures: failed.map((itemIdentifier) => ({ itemIdentifier })),
  };
}
