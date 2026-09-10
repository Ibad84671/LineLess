# LineLess API Map

The HTTP API is a single Lambda (backend/src/functions/api.js) reached through
API Gateway HTTP API (ApiUrl output). The router (backend/src/routes/router.js)
normalizes the event, resolves auth centrally, and dispatches on
method + regex path. Errors map to a uniform error model.

## Authentication model

- `self` — bearer access token (Cognito JWT) verified via JWKS; the resolved
  context carries the caller's active org memberships (used by /me and org CRUD).
- `queue` — bearer token plus staff membership in the owning org of the queue.
- `queue-manager` — like `queue` but requires MANAGER (or higher) role.
- `org:path` — org taken from the URL path; membership required, optional
  `minRole` enforced (hasAtLeast).

Role is always resolved server-side from the DynamoDB membership record, never
from token claims.

## Public routes (no auth)

| Method | Path | Description |
| --- | --- | --- |
| GET | /health | Service health (`{ status: 'ok' }`) |
| GET | /directory | Public directory of published orgs and their open queues |
| GET | /queues/{queueId}/public | Public queue info (name, service, open/closed) |
| GET | /queues/{queueId}/display | Display wall state (called/waiting) |
| GET | /queues/{queueId}/qr.svg | QR code SVG linking to /join/{queueId} |
| POST | /queues/{queueId}/join | Join the queue (supports Idempotency-Key); returns session token |
| GET | /session/{token} | Customer session status (position, state, ETA) |
| POST | /session/{token}/leave | Leave the queue (deletes the session) |

queueId: `[A-Za-z0-9_-]{1,64}` · token: `[A-Za-z0-9_-]{20,160}`

## Staff routes (authenticated)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | /me | self | Caller identity + organizations; links pending invites |
| POST | /organizations | self | Create an organization |
| GET | /organizations | self | List the caller's organizations |
| POST | /organizations/{orgId}/branches | org:path | Create a branch |
| GET | /organizations/{orgId}/branches | org:path (staff) | List branches |
| POST | /organizations/{orgId}/services | org:path | Create a service |
| GET | /organizations/{orgId}/services | org:path (staff) | List services |
| POST | /organizations/{orgId}/queues | org:path | Create a queue |
| GET | /organizations/{orgId}/queues | org:path (staff) | List org queues |
| POST | /organizations/{orgId}/staff | org:path | Invite staff (Cognito admin user) |
| GET | /organizations/{orgId}/staff | org:path | List staff |
| PATCH | /organizations/{orgId}/staff | org:path | Update staff role |
| POST | /organizations/{orgId}/publish | org:path | Publish/unpublish org in the directory |
| GET | /organizations/{orgId}/analytics | org:path | Analytics KPIs and per-queue series |
| GET | /queues/{queueId}/state | queue | Live queue state for the operator console |
| POST | /queues/{queueId}/next | queue | Call next customer |
| POST | /queues/{queueId}/skip | queue | Skip the current customer |
| POST | /queues/{queueId}/recall | queue | Recall the current customer |
| POST | /queues/{queueId}/pause | queue-manager | Pause the queue |
| POST | /queues/{queueId}/resume | queue-manager | Resume the queue |
| POST | /queues/{queueId}/close | queue-manager | Close the queue |
| POST | /queues/{queueId}/reopen | queue-manager | Reopen the queue |

## WebSocket (WebSocketUrl output)

Lambda-backed API Gateway WebSocket (backend/src/functions/ws.js). Routes:
connect / disconnect / default. Clients send JSON messages with an `action`
field (e.g. `subscribe` with a queueId / session token) and receive pushed
state events (join/leave/call/recall/skip/pause/resume/close).
