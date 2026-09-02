# Contributing to LineLess

## Before changing code

Read `docs/AGENT_RULES.md`, understand the queue state model, and inspect existing tests before changing queue behavior.

## Development

```powershell
npm ci
npm test
npm run check
npm run build
```

Keep changes focused and preserve the server-side tenant/security boundaries.

## Queue changes

Any change to queue transitions should include regression tests. Concurrency-sensitive changes should include at least one race-oriented test rather than only a sequential happy path.

## Infrastructure changes

Treat `infrastructure/lineless.yaml` as the source of truth. Validate CloudFormation before deployment and avoid manual console changes that create drift.

## Commit style

Use conventional commit prefixes:

- `feat:` new capability
- `fix:` bug fix
- `infra:` infrastructure/deployment
- `test:` tests
- `docs:` documentation
- `refactor:` behavior-preserving refactor
- `chore:` maintenance

## Pull requests

Explain what changed, why it changed, test evidence, infrastructure impact, and any known limitations. Do not include credentials or sensitive customer data.
