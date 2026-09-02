# LineLess Security Model

## Security objectives

LineLess protects three things first: queue correctness, tenant isolation, and credentials/secrets.

## Authentication and authorization

Staff authentication uses Amazon Cognito. Authorization is evaluated server-side from the authenticated identity and role. The frontend may hide controls for UX, but hiding a button is never a security control.

Customer queue access is intentionally low-friction, but public identifiers must not become a way to access unrelated tenant or staff data.

## Tenant isolation

Every organization-scoped read and mutation must establish the organization/branch/queue relationship server-side before accessing data. Never trust a tenant ID supplied by a browser without validating the caller's authority over it.

## DynamoDB integrity

Operations that can race use conditional writes or transactions. This is required for ticket numbering, duplicate customer prevention, `CALL NEXT`, leave/next races, pause/close races, and idempotent retries.

## Frontend and storage

- S3 Block Public Access should remain enabled.
- CloudFront should access the bucket through Origin Access Control.
- Do not put AWS credentials or provider secrets in frontend JavaScript.
- Do not commit generated runtime configuration containing secrets.
- Keep security headers strict enough for the deployed asset strategy.

## API security

Validate request bodies, query parameters, path parameters and headers at the boundary. Apply explicit size limits and reject malformed input early. Use conservative CORS configuration rather than `*` for authenticated operations.

For production exposure, add API/WAF rate limiting appropriate to public queue-join endpoints and staff mutation endpoints.

## WebSockets

Treat WebSocket connection IDs as ephemeral. Authenticate/authorize subscriptions where required, remove stale connections after failed delivery, and never trust a client-provided organization/queue identity as proof of access.

## Secrets

Use environment configuration only for non-secret deployment values. Provider credentials and other sensitive values belong in AWS-managed secret/configuration mechanisms. Never log access tokens, authorization headers, credentials, or full customer contact information unnecessarily.

## Notifications

Notification processing is asynchronous. Protect against duplicate delivery by making notification state/idempotency explicit and by designing workers to tolerate retries.

## Logging

Logs should contain enough context to diagnose failures without becoming a secondary data-leak channel. Prefer request/operation IDs and tenant-safe identifiers over raw personal data.

## Security verification checklist

- [ ] No credentials in source or Git history
- [ ] S3 bucket remains private
- [ ] CloudFront OAC remains enabled
- [ ] IAM policies are least privilege
- [ ] Tenant authorization is server-side
- [ ] Public endpoints have abuse/rate-limit controls
- [ ] WebSocket authorization is enforced where required
- [ ] Sensitive data is not logged
- [ ] Notification retries are idempotent
- [ ] CloudFormation changes are reviewed before production deployment
