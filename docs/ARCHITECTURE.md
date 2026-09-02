# LineLess Architecture

## System goal

LineLess is a serverless virtual queue system. The synchronous path is intentionally small: validate the request, authorize it, perform the queue state transition, and return the new state. Secondary work is event-driven.

## Logical flow

```text
Browser
  │
  ├── CloudFront → private S3 frontend
  │
  ├── HTTPS → API Gateway REST → API Lambda → DynamoDB
  │                                      │
  │                                      └→ EventBridge
  │                                             ├→ Broadcaster Lambda → WebSocket API
  │                                             └→ SQS → Notification Lambda → SES/SNS
  │
  └── WebSocket API ← Broadcaster Lambda
```

## Data ownership

DynamoDB is the authoritative source for queue state. The frontend never owns authoritative ticket numbering or service state.

The queue engine uses conditional writes/transactions for operations that can race, including joins, next/skip/recall, leave, pause and close.

## Tenant boundary

The intended hierarchy is:

```text
Platform
└── Organization
    └── Branch
        └── Service / Queue
            └── Staff / Customers
```

Tenant identifiers are carried through server-side authorization and DynamoDB key construction. A client-supplied organization identifier is not sufficient authorization.

## Real-time path

1. A queue mutation commits to DynamoDB.
2. The operation emits a domain event.
3. EventBridge invokes the broadcaster path.
4. The broadcaster resolves relevant WebSocket connections.
5. Connected clients receive the updated queue state.
6. Stale/broken connections are cleaned up rather than treated as permanent state.

The queue mutation does not depend on a browser successfully receiving a WebSocket message.

## Notification path

Notifications are asynchronous by design:

```text
Queue event → EventBridge → SQS → notification worker → provider
```

This keeps email/SMS provider latency and transient failures outside the critical queue transaction. Retries and a DLQ should be used for production delivery guarantees.

## Infrastructure

`infrastructure/lineless.yaml` is the source of truth. Deployment scripts package Lambda code, publish artifacts, create/update CloudFormation, and publish the frontend using stack outputs.

The frontend bucket is private and accessed through CloudFront Origin Access Control.

## Reliability principles

- Atomic state transitions where races are possible
- Idempotency for retry-sensitive mutations
- Durable asynchronous processing
- Explicit terminal queue states
- Defensive WebSocket cleanup
- No frontend-only authorization
- Infrastructure validation before deployment

## Scaling considerations

The design avoids an always-on server. Lambda scales request compute, DynamoDB provides managed state storage, and WebSocket connections are managed by API Gateway. If traffic grows materially, review hot partitions, queue write contention, API throttling, WebSocket fan-out volume, notification throughput, and observability costs before changing the architecture.
