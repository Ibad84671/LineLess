// WebSocket connection registry + fan-out.
//
// Connections live in their own partition (CONN#{connectionId}) with a short
// TTL. GSI3 indexes the current subscription scope so the broadcaster can
// find subscribers without scanning:
//   GSI3PK = SUB#Q:{queueId}  -> queue-wide subscribers (staff/display)
//   GSI3PK = SUB#C:{token}    -> targeted customer subscribers
// Stale connections (GoneException on post) are deleted immediately.

import { ApiGatewayManagementApiClient, PostToConnectionCommand, GoneException } from '@aws-sdk/client-apigatewaymanagementapi';
import { db } from '../shared/dynamo.js';
import { keys } from '../shared/keys.js';
import { env } from '../shared/env.js';
import { badRequest } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

const CONNECTION_TTL_S = 2 * 3600;
const now = () => Math.floor(Date.now() / 1000);

function managementApi(endpointUrl) {
  return new ApiGatewayManagementApiClient({
    region: env.region,
    endpoint: endpointUrl,
  });
}

// Test seam: unit tests substitute a factory returning a fake client.
let apiFactory = managementApi;
export function _setApiGatewayFactory(factory) {
  apiFactory = factory;
}
export function _resetApiGatewayFactory() {
  apiFactory = managementApi;
}

export async function registerConnection(connectionId, endpointUrl, { store = db() } = {}) {
  await store.put({
    PK: keys.connection(connectionId).PK,
    SK: 'CONN',
    entityType: 'Connection',
    connectionId,
    endpoint: endpointUrl,
    connectedAt: new Date().toISOString(),
    expiresAt: now() + CONNECTION_TTL_S,
  });
}

export async function removeConnection(connectionId, { store = db() } = {}) {
  await store.delete(keys.connection(connectionId));
}

/**
 * Subscribes a connection to one scope. A connection holds a single scope at
 * a time; re-subscribing replaces the previous GSI3 mapping.
 * scope: {type:'queue', queueId} or {type:'customer', token}
 */
export async function subscribeConnection(connectionId, scope, { store = db() } = {}) {
  let gsiPK;
  if (scope.type === 'queue') {
    if (!scope.queueId || !/^[A-Za-z0-9_-]{1,64}$/.test(scope.queueId)) {
      throw badRequest('Invalid queueId');
    }
    gsiPK = keys.queueSubscriptionScope(scope.queueId);
  } else if (scope.type === 'customer') {
    if (!scope.token || typeof scope.token !== 'string' || scope.token.length > 160) {
      throw badRequest('Invalid token');
    }
    gsiPK = keys.customerSubscriptionScope(scope.token);
  } else {
    throw badRequest('Invalid subscription scope');
  }

  await store.update({
    Key: keys.connection(connectionId),
    UpdateExpression:
      'SET scopeType = :type, scopeId = :sid, GSI3PK = :gpk, GSI3SK = :gsk, expiresAt = :ttl',
    ConditionExpression: 'attribute_exists(PK)',
    ExpressionAttributeValues: {
      ':type': scope.type,
      ':sid': scope.type === 'queue' ? scope.queueId : scope.token,
      ':gpk': gsiPK,
      ':gsk': `CONN#${connectionId}`,
      ':ttl': now() + CONNECTION_TTL_S,
    },
  });
}

export async function unsubscribeConnection(connectionId, { store = db() } = {}) {
  await store.update({
    Key: keys.connection(connectionId),
    UpdateExpression: 'REMOVE scopeType, scopeId, GSI3PK, GSI3SK',
    ConditionExpression: 'attribute_exists(PK)',
  });
}

async function subscribersForScope(scopeGsiPK, store) {
  const res = await store.query({
    IndexName: 'GSI3',
    KeyConditionExpression: 'GSI3PK = :g',
    ExpressionAttributeValues: { ':g': scopeGsiPK },
    Limit: 200,
  });
  return res.items.map((c) => c.connectionId).filter(Boolean);
}

/**
 * Sends a message to every subscriber of a scope. Stale connections (410)
 * are removed so they never accumulate.
 */
export async function broadcastToScope(scopeType, scopeId, message, { store = db(), endpointUrl } = {}) {
  const gsiPK = scopeType === 'queue'
    ? keys.queueSubscriptionScope(scopeId)
    : keys.customerSubscriptionScope(scopeId);
  const connectionIds = await subscribersForScope(gsiPK, store);
  if (connectionIds.length === 0) return { delivered: 0, stale: 0 };

  const endpoints = new Set();
  const conns = await store.batchGet(connectionIds.map((id) => keys.connection(id)));
  for (const c of conns) if (c.endpoint) endpoints.add(c.endpoint);
  const endpoint = endpointUrl || [...endpoints][0];
  if (!endpoint) return { delivered: 0, stale: 0 };

  const client = apiFactory(endpoint);
  const payload = JSON.stringify(message);
  let delivered = 0;
  let stale = 0;

  await Promise.all(
    connectionIds.map(async (connectionId) => {
      try {
        await client.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: payload }));
        delivered += 1;
      } catch (err) {
        if (err instanceof GoneException || err?.$metadata?.httpStatusCode === 410 || err.name === 'GoneException') {
          stale += 1;
          await store.delete(keys.connection(connectionId));
        } else {
          logger.warn('WebSocket post failed', { error: err.name });
        }
      }
    }),
  );
  return { delivered, stale };
}
