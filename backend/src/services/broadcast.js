// Broadcaster: maps committed domain events to WebSocket messages and fans
// them out. Runs in its own Lambda triggered by the EventBridge bus, so queue
// mutations never block on WebSocket delivery.
//
// Fan-out rules (no cross-tenant leakage by construction):
// - Queue-scoped events go to SUB#Q:{queueId} subscribers only.
// - Customer-targeted events (token present) additionally/only go to
//   SUB#C:{token} subscribers.
// - Messages never include other customers' contact data.

import { broadcastToScope } from './connections.js';
import { logger } from '../shared/logger.js';

const QUEUE_WIDE = new Set([
  'QUEUE_UPDATED',
  'NEXT_CALLED',
  'CUSTOMER_SERVED',
  'CUSTOMER_SKIPPED',
  'CUSTOMER_RECALLED',
  'CUSTOMER_LEFT',
  'QUEUE_JOINED',
  'QUEUE_PAUSED',
  'QUEUE_RESUMED',
  'QUEUE_CLOSED',
  'QUEUE_REOPENED',
]);

const CUSTOMER_ONLY = new Set(['TURN_APPROACHING']);

/** Builds the outbound message for a domain event. */
export function buildMessage(event) {
  const type = event['detail-type'];
  const d = event.detail ?? {};
  const base = {
    type,
    queueId: d.queueId,
    ticket: d.ticket,
    display: d.display,
    nowServing: d.nowServing,
    status: d.status,
    paused: d.paused,
    queueName: d.queueName,
    ts: d.emittedAt,
  };
  if (type === 'NEXT_CALLED' || type === 'CUSTOMER_RECALLED') {
    return { ...base, yourTurn: false, attention: true };
  }
  if (type === 'TURN_APPROACHING') {
    return { ...base, yourTurn: false, almost: true };
  }
  return base;
}

export async function handleQueueEvent(event, deps) {
  const type = event['detail-type'];
  const d = event.detail ?? {};
  if (!d.queueId) {
    logger.warn('Event without queueId ignored', { type });
    return;
  }

  if (CUSTOMER_ONLY.has(type)) {
    if (d.token) {
      await broadcastToScope('customer', d.token, buildMessage(event), deps);
    }
    return;
  }

  if (QUEUE_WIDE.has(type)) {
    await broadcastToScope('queue', d.queueId, buildMessage(event), deps);
  }
}
