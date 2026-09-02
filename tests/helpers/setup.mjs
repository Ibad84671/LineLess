// Shared test setup: environment before backend modules load, in-memory
// Dynamo store, and an event recorder replacing EventBridge publishing.

process.env.TABLE_NAME = 'test-table';
process.env.EVENT_BUS_NAME = 'test-bus'; // events routed to the recorder below
process.env.AWS_REGION = 'us-east-1';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
process.env.SENDER_EMAIL = '';

import { createMemDynamo } from './mem-dynamo.mjs';
import { setStore } from '../../backend/src/shared/dynamo.js';
import { _setPublisher, _resetPublisher } from '../../backend/src/shared/events.js';

export const recordedEvents = [];

_setPublisher(async (type, detail) => {
  recordedEvents.push({ type, detail });
});

export function resetEvents() {
  recordedEvents.length = 0;
}

export function installMemStore() {
  const store = createMemDynamo();
  setStore(store);
  return store;
}
