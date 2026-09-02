// WebSocket API Lambda entrypoints: $connect, $default, $disconnect.
//
// - $connect registers the connection (2h TTL, refreshed on activity).
// - $default handles subscribe/unsubscribe/ping actions. Queue scopes are
//   public by design (queue boards are public data); customer scopes are
//   protected by possession of the opaque session token.
// - $disconnect removes the registration immediately.

import { registerConnection, removeConnection, subscribeConnection, unsubscribeConnection } from '../services/connections.js';
import { badRequest, AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';
import { assertEnv } from '../shared/env.js';

function endpointFromEvent(event) {
  return `https://${event.requestContext.domainName}/${event.requestContext.stage}`;
}

export async function connect(event) {
  assertEnv(['tableName']);
  try {
    await registerConnection(event.requestContext.connectionId, endpointFromEvent(event));
  } catch (err) {
    logger.error('connect registration failed', { error: err.message });
  }
  return { statusCode: 200, body: '' };
}

export async function disconnect(event) {
  try {
    await removeConnection(event.requestContext.connectionId);
  } catch (err) {
    logger.warn('disconnect cleanup failed', { error: err.message });
  }
  return { statusCode: 200, body: '' };
}

function wsResponse(body) {
  return { statusCode: 200, body: JSON.stringify(body) };
}

export async function defaultHandler(event) {
  assertEnv(['tableName']);
  let action;
  try {
    action = JSON.parse(event.body ?? '{}');
  } catch {
    return wsResponse({ type: 'ERROR', message: 'Invalid JSON' });
  }

  const connectionId = event.requestContext.connectionId;
  try {
    switch (action.action) {
      case 'ping':
        return wsResponse({ type: 'PONG', ts: new Date().toISOString() });
      case 'subscribe':
        await subscribeConnection(connectionId, {
          type: action.scopeType,
          queueId: action.queueId,
          token: action.token,
        });
        return wsResponse({ type: 'SUBSCRIBED', scopeType: action.scopeType, queueId: action.queueId ?? null });
      case 'unsubscribe':
        await unsubscribeConnection(connectionId);
        return wsResponse({ type: 'UNSUBSCRIBED' });
      default:
        return wsResponse({ type: 'ERROR', message: 'Unknown action' });
    }
  } catch (err) {
    if (err instanceof AppError && err.status < 500) {
      return wsResponse({ type: 'ERROR', message: err.message });
    }
    logger.error('ws default handler failed', { error: err.message, name: err.name });
    return wsResponse({ type: 'ERROR', message: 'Internal error' });
  }
}
