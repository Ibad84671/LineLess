# LineLess Engineering Constitution

This document is the permanent engineering standard for the LineLess project.
All contributors and autonomous agents must adhere to these rules.

## Core Principles

### Never Fake Success
- Never claim a test passed unless the test framework reported success
- Never hide errors or replace failed tests with fake successes
- Never print "success" unless the relevant verification actually passed
- Never report completion without evidence

### Never Skip Tests
- All tests must pass before declaring a phase complete
- New code requires new or updated tests
- Broken tests must be fixed, not removed (unless the test itself is wrong)

### Never Bypass Infrastructure Validation
- CloudFormation templates must validate before deployment
- `cfn-lint` warnings must be investigated; errors must be fixed
- `aws cloudformation validate-template` must succeed before `create-stack`

### Never Hardcode AWS Deployment Outputs
- CloudFront URLs, API URLs, and WebSocket URLs must come from CloudFormation outputs
- Frontend runtime config must be generated from stack outputs
- No hardcoded account IDs, regions, or resource ARNs

### Never Commit Secrets
- No `.env` files with real values
- No AWS credentials in source code
- No API keys, tokens, or passwords in any committed file
- `.gitignore` must exclude all secret-bearing patterns

### Never Weaken Tenant Isolation
- All data access must be scoped to the authenticated tenant
- Cross-tenant access must be impossible by design, not by convention
- DynamoDB keys must always include the tenant boundary

### Never Expose Private S3 Objects
- User documents must be served only via presigned URLs
- S3 buckets must block public access
- CloudFront must use Origin Access Control

### Never Trust Frontend Authorization
- All authorization decisions must be made server-side
- Client-side role checks are for UX only, never security
- API endpoints must re-verify every permission

### Never Use Polling When WebSocket Is Required
- Real-time queue updates must use WebSocket broadcasts
- Customer-facing queue status must update without page refresh
- Polling is acceptable only as a fallback transport

### Never Ask Routine Permission
- Create files, modify code, run tests, and validate infrastructure autonomously
- Only pause for genuinely ambiguous product decisions
- Only pause for irreversible destructive actions outside the project scope

## Operational Standards

### Always Inspect Before Modifying
- Read existing code before changing it
- Understand the current state before taking action
- Check git status and branch before committing

### Always Fix Root Causes
- Don't mask symptoms; fix the underlying bug
- Don't add retries to hide race conditions; make operations idempotent
- Don't suppress errors; handle them explicitly

### Always Rerun Regression Tests
- After every fix, rerun the full test suite
- After every infrastructure change, re-validate the template
- After every frontend change, re-run the build

### Always Keep CloudFormation as Infrastructure Source of Truth
- No manual AWS Console changes for project resources
- All infrastructure changes go through versioned CloudFormation
- Stack outputs are the canonical source of runtime configuration

### Always Keep README Synchronized
- Document every new feature
- Document every architectural decision
- Keep deployment and setup instructions current

### Always Keep Git Clean
- No junk files, build artifacts, or editor configs committed
- Conventional commit messages (`feat:`, `fix:`, `test:`, `docs:`, `infra:`)
- No merge commits on main (rebase or squash)

### Always Verify Live Behavior After Deployment
- Smoke tests must pass against the real stack
- CloudFormation success alone is not deployment success
- Frontend, API, WebSocket, and auth must all be verified live

### Always Prefer Simple Serverless Architecture
- No EC2 unless absolutely necessary
- No RDS unless absolutely necessary
- No NAT Gateway
- No always-on infrastructure

### Avoid Unnecessary AWS Costs
- Parameterize optional paid features (WAF, SQS, SNS) and disable by default
- Right-size Lambda memory
- Set CloudWatch log retention
- Avoid unnecessary DynamoDB GSIs

### Do Not Declare Success Without Evidence
- "Tests pass" requires test framework output showing pass count
- "Deployed" requires CloudFormation stack status `CREATE_COMPLETE` / `UPDATE_COMPLETE`
- "Working" requires live HTTP/WS verification, not just code review

## Quality Gates

A phase is complete only when all of its defined gates pass:

- `frontend builds` — the frontend compiles/packs without errors
- `backend tests pass` — unit and integration suites report 0 failures
- `CloudFormation validates` — `validate-template` succeeds
- `no hardcoded secrets` — grep for AKIA/ASIA/secret/token patterns returns nothing
- `no cross-tenant access path` — code review confirms tenant-scoped keys
- `README complete` — architecture, setup, deploy, and API sections are populated
- `git clean` — no uncommitted junk, no build artifacts staged

## Enforcement

This document governs all engineering work in this repository.
When in doubt, prioritize correctness, security, and verifiability over speed.
