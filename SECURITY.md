# Security Policy

## Supported versions

The `main` branch is the actively maintained development line.

## Reporting a vulnerability

Please do not publish exploitable security details in a public GitHub issue.

Until a private security-contact workflow is configured for this repository, report suspected vulnerabilities privately to the repository owner through GitHub and include:

- affected component/path
- reproduction steps
- security impact
- relevant logs or screenshots with secrets/redacted personal data
- suggested mitigation, if known

Never include AWS access keys, session tokens, passwords, or other credentials in a report.

## Security priorities

LineLess treats tenant isolation, queue-state integrity, authentication/authorization, public endpoint abuse, secret handling, and WebSocket access control as high-priority security boundaries.
