import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/setup.mjs';
import { installMemStore } from '../helpers/setup.mjs';
import { handler } from '../../backend/src/functions/ws.js';
import { keys } from '../../backend/src/shared/keys.js';

let store;

beforeEach(() => {
  store = installMemStore();
});

function wsEvent(eventType, body, connectionId = 'conn-test-1') {
  return {
    requestContext: {
      connectionId,
      eventType,
      domainName: 'ws.example.amazonaws.com',
      stage: 'dev',
    },
    ...(body !== undefined ? { body } : {}),
  };
}

const parseBody = (res) => JSON.parse(res.body);

test('CONNECT registers the connection', async () => {
  const res = await handler(wsEvent('CONNECT'));
  assert.equal(res.statusCode, 200);
  const conn = await store.get(keys.connection('conn-test-1'));
  assert.ok(conn, 'connection row must exist');
  assert.equal(conn.connectionId, 'conn-test-1');
  assert.ok(conn.expiresAt > Math.floor(Date.now() / 1000));
});

test('MESSAGE ping returns PONG', async () => {
  await handler(wsEvent('CONNECT'));
  const res = await handler(wsEvent('MESSAGE', JSON.stringify({ action: 'ping' })));
  assert.equal(res.statusCode, 200);
  assert.equal(parseBody(res).type, 'PONG');
});

test('MESSAGE subscribe (queue scope) stores the subscription scope', async () => {
  await handler(wsEvent('CONNECT'));
  const res = await handler(wsEvent('MESSAGE', JSON.stringify({
    action: 'subscribe',
    scopeType: 'queue',
    queueId: 'q-123',
  })));
  assert.equal(parseBody(res).type, 'SUBSCRIBED');
  const conn = await store.get(keys.connection('conn-test-1'));
  assert.equal(conn.GSI3PK, keys.queueSubscriptionScope('q-123'));
  assert.equal(conn.scopeType, 'queue');
});

test('MESSAGE subscribe (customer scope) stores the token scope', async () => {
  await handler(wsEvent('CONNECT'));
  const res = await handler(wsEvent('MESSAGE', JSON.stringify({
    action: 'subscribe',
    scopeType: 'customer',
    token: 'ctok_abcdefghijklmnopqrstuvwxyz123456',
  })));
  assert.equal(parseBody(res).type, 'SUBSCRIBED');
  const conn = await store.get(keys.connection('conn-test-1'));
  assert.equal(conn.GSI3PK, keys.customerSubscriptionScope('ctok_abcdefghijklmnopqrstuvwxyz123456'));
});

test('MESSAGE subscribe replaces a previous scope (one scope per connection)', async () => {
  await handler(wsEvent('CONNECT'));
  await handler(wsEvent('MESSAGE', JSON.stringify({ action: 'subscribe', scopeType: 'queue', queueId: 'q-1' })));
  await handler(wsEvent('MESSAGE', JSON.stringify({ action: 'subscribe', scopeType: 'queue', queueId: 'q-2' })));
  const conn = await store.get(keys.connection('conn-test-1'));
  assert.equal(conn.GSI3PK, keys.queueSubscriptionScope('q-2'));
});

test('MESSAGE subscribe before connect is rejected', async () => {
  const res = await handler(wsEvent('MESSAGE', JSON.stringify({ action: 'subscribe', scopeType: 'queue', queueId: 'q-1' }), 'ghost-conn'));
  const body = parseBody(res);
  assert.equal(body.type, 'ERROR');
});

test('MESSAGE with malformed JSON returns a clean error, not a crash', async () => {
  await handler(wsEvent('CONNECT'));
  const res = await handler(wsEvent('MESSAGE', 'not-json{{'));
  assert.equal(res.statusCode, 200);
  assert.equal(parseBody(res).type, 'ERROR');
  assert.match(parseBody(res).message, /JSON/i);
});

test('MESSAGE with an unknown action returns ERROR', async () => {
  await handler(wsEvent('CONNECT'));
  const res = await handler(wsEvent('MESSAGE', JSON.stringify({ action: 'explode' })));
  assert.equal(parseBody(res).type, 'ERROR');
});

test('MESSAGE subscribe with an invalid queueId returns ERROR', async () => {
  await handler(wsEvent('CONNECT'));
  const res = await handler(wsEvent('MESSAGE', JSON.stringify({
    action: 'subscribe',
    scopeType: 'queue',
    queueId: 'bad id with spaces!!',
  })));
  assert.equal(parseBody(res).type, 'ERROR');
});

test('DISCONNECT removes the connection registration', async () => {
  await handler(wsEvent('CONNECT'));
  await handler(wsEvent('DISCONNECT'));
  const conn = await store.get(keys.connection('conn-test-1'));
  assert.equal(conn, null, 'connection must be cleaned up on disconnect');
});
