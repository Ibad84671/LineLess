# LineLess Testing Strategy

LineLess treats queue correctness as a high-risk domain. Tests therefore cover both ordinary behavior and adversarial concurrency.

## Current suites

```text
npm test
├── tests/unit
├── tests/integration
├── tests/infra
└── tests/websocket
```

The current baseline is 58 passing tests.

## Unit tests

Validate deterministic helpers such as ticket numbering, input validation, role hierarchy, IDs/keys, and wait-time estimation.

## Integration tests

Exercise queue behavior including:

- sequential joins
- duplicate customer protection
- leave/rejoin behavior
- call-next progression
- skip/recall
- pause/resume/close
- unknown queue handling
- domain event recording

## Concurrency tests

The integration suite intentionally races operations to detect state corruption:

- simultaneous joins
- duplicate joins
- concurrent `CALL NEXT`
- leave + next races
- pause + join races
- close + join races
- repeated call attempts

These tests are more valuable than a large number of shallow happy-path assertions because queue state is fundamentally concurrent.

## Infrastructure tests

Validate required CloudFormation structure and security invariants such as Lambda roles, DynamoDB encryption, S3 public-access blocking, CloudFront OAC, WebSocket routes and deployment outputs.

## Static checks

```powershell
npm run check
```

Static checks should reject secrets, hardcoded account/region values, and unfinished placeholders in core project code.

## Release gate

Before a production release:

```powershell
npm ci
npm test
npm run check
npm run build
```

Then validate CloudFormation and perform live smoke tests against the deployed environment. A green local suite is necessary but is not proof that AWS integration is healthy.

## Future test layers

- Browser end-to-end tests
- Accessibility checks
- API contract tests against a deployed stage
- WebSocket reconnect tests in real browsers
- Load tests for queue hot partitions
- Notification retry/DLQ integration tests
