// DynamoDB single-table key builders (pure functions, unit-testable).
//
// Key strategy (see docs/database.md):
//   PK ORG#{orgId}   SK META | BR#{id} | SVC#{id} | QUEUE#{id} | STAFF#{sub}
//                    | AUD#{ts}#{rand} | NTF#{eventId}
//   PK Q#{queueId}   SK ENTRY#{ticketPad} | CUST#{token} | COUNTER[#date] | IDEM#{key}
//   PK CUST#{token}  SK PROFILE
//   PK CONN#{connId} SK CONN
// GSIs:
//   GSI1 PK TOK#{token}   SK JOIN#{ts}   -> a customer's entries
//   GSI2 PK USER#{sub}    SK ORG#{orgId} -> a user's memberships
//   GSI3 PK SUB#{scope}   SK CONN#{cid}  -> websocket subscribers per queue/customer

export const pad = (n, width) => String(n).padStart(width, '0');

export const keys = {
  orgMeta: (orgId) => ({ PK: `ORG#${orgId}`, SK: 'META' }),
  branch: (orgId, branchId) => ({ PK: `ORG#${orgId}`, SK: `BR#${branchId}` }),
  service: (orgId, serviceId) => ({ PK: `ORG#${orgId}`, SK: `SVC#${serviceId}` }),
  // Runtime queue item (public-safe metadata + live state). Lives in its own
  // partition so join/display never need the org lookup first.
  queueMeta: (queueId) => ({ PK: `Q#${queueId}`, SK: 'META' }),
  // Org-partition index item for listing a tenant's queues.
  queueIndex: (orgId, queueId) => ({ PK: `ORG#${orgId}`, SK: `QUEUE#${queueId}` }),
  staff: (orgId, sub) => ({ PK: `ORG#${orgId}`, SK: `STAFF#${sub}` }),
  audit: (orgId, ts, rand) => ({ PK: `ORG#${orgId}`, SK: `AUD#${ts}#${rand}` }),
  notificationLog: (orgId, eventId) => ({ PK: `ORG#${orgId}`, SK: `NTF#${eventId}` }),

  queuePartition: (queueId) => `Q#${queueId}`,
  entry: (queueId, ticket, padWidth) => ({
    PK: `Q#${queueId}`,
    SK: `ENTRY#${pad(ticket, padWidth)}`,
  }),
  customerGuard: (queueId, token) => ({ PK: `Q#${queueId}`, SK: `CUST#${token}` }),
  counter: (queueId, dayKey) => ({
    PK: `Q#${queueId}`,
    SK: dayKey ? `COUNTER#${dayKey}` : 'COUNTER',
  }),
  idempotency: (queueId, key) => ({ PK: `Q#${queueId}`, SK: `IDEM#${key}` }),

  customerProfile: (token) => ({ PK: `CUST#${token}`, SK: 'PROFILE' }),

  connection: (connectionId) => ({ PK: `CONN#${connectionId}`, SK: 'CONN' }),
  connectionGsi: (connectionId) => ({ GSI3PK: `CONN#${connectionId}`, GSI3SK: 'CONN' }),

  // GSI3 scopes: one subscription scope per websocket connection at a time.
  queueSubscriptionScope: (queueId) => `SUB#Q:${queueId}`,
  customerSubscriptionScope: (token) => `SUB#C:${token}`,
};

/** UTC day key for daily counter resets, e.g. 2026-09-02. */
export function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
