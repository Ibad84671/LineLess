// Domain event publishing to EventBridge.
// Queue mutations NEVER do WebSocket fan-out or notifications inline — they
// publish a durable domain event; rules route it to the broadcaster and the
// notification pipeline.

import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { env } from './env.js';
import { logger } from './logger.js';

export const EVENT_TYPES = {
  QUEUE_JOINED: 'QUEUE_JOINED',
  QUEUE_UPDATED: 'QUEUE_UPDATED',
  NEXT_CALLED: 'NEXT_CALLED',
  CUSTOMER_SERVED: 'CUSTOMER_SERVED',
  CUSTOMER_SKIPPED: 'CUSTOMER_SKIPPED',
  CUSTOMER_RECALLED: 'CUSTOMER_RECALLED',
  CUSTOMER_LEFT: 'CUSTOMER_LEFT',
  QUEUE_PAUSED: 'QUEUE_PAUSED',
  QUEUE_RESUMED: 'QUEUE_RESUMED',
  QUEUE_CLOSED: 'QUEUE_CLOSED',
  QUEUE_REOPENED: 'QUEUE_REOPENED',
  TURN_APPROACHING: 'TURN_APPROACHING',
};

const eb = () => new EventBridgeClient({ region: env.region });

// Test seam: unit tests can substitute a publisher to capture events.
let publisher = null;
export function _setPublisher(fn) {
  publisher = fn;
}
export function _resetPublisher() {
  publisher = null;
}

/**
 * Publishes a domain event. Failures are logged and metric-emitted but never
 * block the queue mutation that produced them — the caller has already
 * committed its DynamoDB transaction.
 */
export async function publishEvent(type, detail) {
  if (publisher) return publisher(type, detail);
  if (!env.eventBusName) {
    logger.warn('Event bus not configured; event dropped', { type });
    return false;
  }
  try {
    await eb().send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: env.eventBusName,
            Source: 'lineless.queue',
            DetailType: type,
            Detail: JSON.stringify({ ...detail, emittedAt: new Date().toISOString() }),
          },
        ],
      }),
    );
    return true;
  } catch (err) {
    logger.error('EventBridge publish failed', { type, message: err.message });
    return false;
  }
}
