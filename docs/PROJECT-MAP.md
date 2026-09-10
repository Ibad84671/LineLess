vs-code/  [node project]
├── backend/
│   └── src/
│       ├── functions/
│       │   ├── api.js
│       │   ├── broadcaster.js
│       │   ├── notification-worker.js
│       │   └── ws.js
│       ├── routes/  ← API layer
│       │   ├── public.js
│       │   ├── router.js
│       │   └── staff.js
│       ├── services/  ← business logic
│       │   ├── analytics.js
│       │   ├── broadcast.js
│       │   ├── connections.js
│       │   ├── notify.js
│       │   ├── orgs.js
│       │   ├── queue-engine.js
│       │   ├── queue-reads.js
│       │   └── staff.js
│       └── shared/  ← utilities
│           ├── auth.js
│           ├── dynamo.js
│           ├── env.js
│           ├── errors.js
│           ├── events.js
│           ├── http.js
│           ├── ids.js
│           ├── keys.js
│           ├── logger.js
│           ├── numbering.js
│           ├── validate.js
│           └── waittime.js
├── docs/  ← documentation
│   ├── diagrams/
│   │   └── lineless-architecture.mmd
│   ├── AGENT_RULES.md
│   ├── API-MAP.md
│   ├── ARCHITECTURE.md
│   ├── AWS-INFRA-MAP.md
│   ├── DEPENDENCY-MAP.json
│   ├── DEPENDENCY-MAP.md
│   ├── DEPLOYMENT.md
│   ├── MASTER-AI-CONTEXT.md
│   ├── PROJECT-MAP.md
│   ├── SECURITY.md
│   └── TESTING.md
├── frontend/
│   ├── assets/  ← static assets
│   │   ├── css/  ← styles
│   │   │   └── app.css
│   │   └── js/
│   │       ├── views/  ← pages / views
│   │       │   ├── console.js
│   │       │   ├── dashboard.js
│   │       │   ├── display.js
│   │       │   ├── join.js
│   │       │   ├── landing.js
│   │       │   ├── login.js
│   │       │   ├── notfound.js
│   │       │   ├── onboarding.js
│   │       │   ├── signup.js
│   │       │   └── status.js
│   │       ├── api.js
│   │       ├── auth.js
│   │       ├── dom.js
│   │       ├── icons.js
│   │       ├── main.js
│   │       ├── password-policy.js
│   │       ├── router.js
│   │       ├── theme.js
│   │       ├── topbar.js
│   │       └── ws.js
│   ├── config.example.js
│   └── index.html
├── infrastructure/  ← infrastructure
│   └── lineless.yaml
├── scripts/  ← scripts / tooling
│   ├── build.js
│   ├── deploy.bat
│   ├── deploy.ps1
│   ├── destroy.bat
│   ├── destroy.ps1
│   ├── dev-server.js
│   ├── package-backend.js
│   └── static-checks.js
├── tests/  ← tests
│   ├── helpers/  ← utilities
│   │   ├── env.mjs
│   │   ├── mem-dynamo.mjs
│   │   ├── setup.mjs
│   │   └── world.mjs
│   ├── infra/  ← infrastructure
│   │   └── template.test.mjs
│   ├── integration/
│   │   ├── authorization.test.mjs
│   │   ├── concurrency.test.mjs
│   │   ├── notification.test.mjs
│   │   └── queue-flow.test.mjs
│   ├── live/
│   │   ├── eb-entry.json
│   │   ├── ws-err.log
│   │   ├── ws-out.log
│   │   └── ws-smoke.mjs
│   ├── unit/
│   │   ├── numbering.test.mjs
│   │   ├── validate.test.mjs
│   │   └── waittime.test.mjs
│   └── websocket/
│       ├── dispatch.test.mjs
│       └── ws.test.mjs
├── CHANGELOG.md
├── CONTRIBUTING.md
├── eslint.config.js
├── LICENSE
├── package-lock.json
├── package.json
├── README.md
└── SECURITY.md

24 directories, 104 files
Project type: node project