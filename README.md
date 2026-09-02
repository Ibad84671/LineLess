# LineLess

> **Join the Queue. Skip the Wait.**

LineLess is a real-time, serverless virtual queue platform for businesses that need to replace physical waiting lines with a live digital experience.

Customers can join a queue remotely, keep their place on their phone, see live movement and estimated wait time, and receive turn notifications. Staff get a fast queue console for calling, skipping, recalling, pausing, resuming, and closing queues.

[![Tests](https://img.shields.io/badge/tests-58%2F58%20passing-0A0A0A?style=for-the-badge)](https://github.com/Ibad84671/LineLess/actions)
[![AWS](https://img.shields.io/badge/AWS-serverless-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white)](https://aws.amazon.com/serverless/)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-111111?style=for-the-badge)](LICENSE)

---

## Why LineLess?

Physical queues create wasted time, crowded waiting areas, unpredictable wait times, and unnecessary pressure on front-desk staff.

LineLess turns the queue into a live digital workflow:

```text
Customer scans QR / opens link
          ↓
      Joins queue
          ↓
  Gets digital ticket
          ↓
Tracks position + ETA in real time
          ↓
  Receives turn notification
          ↓
       Gets served
```

No refresh button. No clipboard. No guessing.

---

## Product Surface

### Customer

- Join a queue without creating an account
- Receive a human-friendly ticket number
- See people ahead and estimated wait
- Follow live queue movement through WebSocket updates
- Leave the queue when plans change
- Get notification events through the asynchronous notification pipeline

### Staff

- Secure staff authentication through Amazon Cognito
- Queue dashboard and live board
- Call next customer
- Skip and recall customers
- Pause, resume, and close queues
- View queue and service analytics
- Manage organization/branch/service data according to role

### Display / Reception

- Dedicated live display route for TVs or reception screens
- Current serving state and queue movement
- WebSocket-powered updates instead of polling

---

## Architecture

```text
                         ┌──────────────────────┐
                         │      Customers       │
                         │  Mobile / Browser    │
                         └──────────┬───────────┘
                                    │ HTTPS
                                    ▼
┌──────────────────┐       ┌──────────────────────┐
│ CloudFront + S3  │──────▶│   API Gateway REST  │
│ Private frontend │       └──────────┬───────────┘
└──────────────────┘                  │
                                      ▼
                              ┌───────────────┐
                              │  API Lambda   │
                              └───────┬───────┘
                                      │
                     ┌────────────────┼────────────────┐
                     ▼                ▼                ▼
                ┌─────────┐     ┌────────────┐   ┌────────────┐
                │DynamoDB │     │ EventBridge│   │  Cognito   │
                │  State  │     │   Events   │   │   Staff    │
                └────┬────┘     └─────┬──────┘   └────────────┘
                     │                │
                     │                ▼
                     │          ┌───────────┐
                     │          │    SQS    │
                     │          │ + retries │
                     │          └─────┬─────┘
                     │                ▼
                     │        ┌─────────────────┐
                     │        │ Notification   │
                     │        │     Lambda     │
                     │        └───────┬─────────┘
                     │                ▼
                     │          SES / SNS
                     │
                     ▼
              ┌───────────────┐
              │ WebSocket API │
              └───────┬───────┘
                      ▼
              ┌───────────────┐
              │ Broadcaster   │
              │ + connections │
              └───────────────┘
```

### AWS services

| Service | Responsibility |
|---|---|
| Amazon CloudFront | Global HTTPS delivery and frontend edge caching |
| Amazon S3 | Private static frontend origin |
| Origin Access Control | Keeps the frontend bucket private behind CloudFront |
| API Gateway | REST API and WebSocket transport |
| AWS Lambda | API, WebSocket, broadcast, and notification compute |
| Amazon DynamoDB | Queue state, organizations, connections, idempotency and operational data |
| Amazon Cognito | Staff authentication and identity |
| Amazon EventBridge | Domain/event fan-out |
| Amazon SQS | Durable asynchronous notification processing |
| Amazon SES | Email notification delivery |
| Amazon SNS | Optional notification channel abstraction |
| Amazon CloudWatch | Logs and operational observability |
| AWS CloudFormation | Infrastructure as code and repeatable deployment |

---

## Engineering Highlights

### Concurrency-safe queue engine

Queue operations are designed around DynamoDB conditional writes and transactions rather than unsafe read-then-write counters. The test suite exercises simultaneous joins, concurrent `CALL NEXT`, leave/next races, pause/close races, and duplicate customer attempts.

### Idempotency

Mutating operations support idempotency semantics so client retries do not accidentally create duplicate queue actions.

### Multi-tenant data model

The application models organization → branch/service → queue boundaries and uses tenant-aware access checks. Authorization is enforced server-side; the browser is never treated as the security boundary.

### Real-time state

Queue changes emit domain events that feed the broadcast path. Connected clients receive state changes over API Gateway WebSockets rather than repeatedly polling the API.

### Async notifications

Notifications are deliberately separated from the critical queue mutation path using EventBridge and SQS. Transient delivery failures can therefore be retried without blocking the queue operation itself.

### Private frontend origin

The S3 frontend bucket is not intended to be publicly readable. CloudFront accesses it through Origin Access Control.

---

## Repository Layout

```text
LineLess/
├── backend/
│   └── src/
│       ├── functions/          # Lambda entry points
│       ├── routes/             # REST route handlers
│       ├── services/            # Queue, org, analytics, notifications, WS
│       └── shared/              # Auth, DynamoDB, validation, events, logging
├── frontend/
│   ├── assets/
│   │   ├── css/
│   │   └── js/
│   │       └── views/           # Customer, staff, display and auth views
│   ├── config.example.js
│   └── index.html
├── infrastructure/
│   └── lineless.yaml            # CloudFormation source of truth
├── scripts/
│   ├── build.js
│   ├── deploy.ps1
│   ├── destroy.ps1
│   ├── package-backend.js
│   ├── static-checks.js
│   └── dev-server.js
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── infra/
│   └── websocket/
├── docs/
│   └── AGENT_RULES.md
├── .env.example
├── package.json
└── README.md
```

---

## Quality Gates

The current repository includes a 58-test suite covering four areas:

```text
Unit             ✓
Integration      ✓
CloudFormation   ✓
WebSocket        ✓
--------------------
Total            58 / 58 PASS
```

Run the complete suite:

```powershell
npm test
```

Run static/security-oriented checks:

```powershell
npm run check
```

Build the frontend/package artifacts:

```powershell
npm run build
```

---

## Local Development

### Prerequisites

- Node.js 22+
- AWS CLI configured for the target account when deploying
- PowerShell on Windows

Install dependencies:

```powershell
npm ci
```

Start the local application:

```powershell
npm run dev
```

The frontend is intentionally configuration-driven. Copy the example configuration only when local runtime values are available; never commit credentials or environment secrets.

---

## AWS Deployment

The infrastructure is defined in `infrastructure/lineless.yaml` and deployment automation lives in `scripts/`.

Deploy:

```powershell
./scripts/deploy.ps1 -Environment dev
```

Destroy the environment:

```powershell
./scripts/destroy.ps1 -Environment dev
```

The deployment workflow validates prerequisites, tests the project, packages Lambda code, uploads the artifact, validates CloudFormation, creates/updates the stack, and publishes the frontend according to the configured deployment outputs.

**Never paste AWS access keys, secret keys, session tokens, or GitHub tokens into source files or commit history.**

---

## Security Model

LineLess is designed around several explicit security boundaries:

- Private S3 origin behind CloudFront Origin Access Control
- S3 Block Public Access
- Least-privilege Lambda IAM roles
- Cognito-backed staff authentication
- Server-side authorization and tenant isolation
- DynamoDB conditional writes for state integrity
- Input validation and bounded fields
- Idempotency for retry-sensitive mutations
- No credentials in frontend source
- Asynchronous notification processing through SQS
- Static secret/account/placeholder checks

See the `docs/` directory for deeper operational documentation as the project evolves.

---

## Design Principles

1. **Correctness before cosmetics** — queue state must remain consistent under concurrency.
2. **Server-side trust boundaries** — frontend state is never authorization.
3. **Events for decoupling** — notifications and broadcasts should not make queue mutations fragile.
4. **Infrastructure as code** — CloudFormation is the deployment source of truth.
5. **Observable failures** — errors should be diagnosable from logs and deterministic tests.
6. **Cost-conscious serverless** — avoid always-on infrastructure where managed serverless primitives are sufficient.
7. **Progressive enhancement** — a customer should be able to join a queue with the minimum possible friction.

---

## Roadmap

The roadmap intentionally separates production-critical work from optional product expansion.

### Next

- [ ] Production browser smoke tests
- [ ] GitHub Actions quality gates
- [ ] CloudWatch operational dashboard
- [ ] Stronger API rate limiting/WAF configuration
- [ ] Production notification configuration and delivery tests
- [ ] Deployment/rollback runbook

### Product expansion

- [ ] Multi-branch management UI improvements
- [ ] Advanced queue analytics and peak-hour visualizations
- [ ] Appointment + walk-in hybrid queues
- [ ] Configurable customer notification channels
- [ ] PWA install experience
- [ ] Business branding/customization

### Future / optional

- [ ] Predictive wait-time models
- [ ] Voice announcements
- [ ] Additional messaging providers
- [ ] Advanced operational forecasting

Features are not advertised as complete until their backend, infrastructure, UI, tests, and documentation are actually implemented.

---

## Project Status

**Current engineering baseline:** functional serverless queue platform with a concurrency-focused test suite and CloudFormation deployment automation.

This repository is intentionally being hardened in stages. The goal is not to claim production readiness prematurely; every production capability should be backed by implementation and verification.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Author

Built by **Ibad Shaikh** as an AWS/serverless architecture portfolio project.

**LineLess — Join the Queue. Skip the Wait.**