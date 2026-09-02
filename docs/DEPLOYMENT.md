# LineLess Deployment Runbook

## Principle

CloudFormation is the infrastructure source of truth. Deployment scripts should be the normal entry point rather than manually creating resources in the AWS console.

## Preflight

From the repository root:

```powershell
npm ci
npm test
npm run check
npm run build
aws sts get-caller-identity
aws cloudformation validate-template --template-body file://infrastructure/lineless.yaml --region us-east-1
```

Confirm the AWS account and region before creating a stack.

## Deploy

```powershell
./scripts/deploy.ps1 -Environment dev
```

The deployment script is expected to validate prerequisites, install/build what is required, package Lambda code, upload the artifact, create/update the CloudFormation stack, publish the frontend, and report stack outputs.

## Smoke test

After deployment, verify at minimum:

1. CloudFront frontend responds with HTTPS.
2. Public queue discovery/join flow works.
3. A customer receives a valid ticket and queue state.
4. Staff authentication and queue mutation work.
5. WebSocket connection establishes and receives a queue update.
6. `CALL NEXT`, skip, recall, leave, pause/resume and close preserve queue invariants.
7. Notification events reach the configured asynchronous path.
8. CloudWatch logs show no unexpected error loops.

Do not call a deployment successful solely because CloudFormation reached `CREATE_COMPLETE`; application smoke tests are part of the acceptance gate.

## Destroy

```powershell
./scripts/destroy.ps1 -Environment dev
```

Use destroy only for the intended environment. Verify the stack name/account/region before confirming deletion.

## Failure handling

If deployment fails:

```text
identify failed resource
      ↓
read CloudFormation reason
      ↓
fix root cause in source/IaC
      ↓
run regression tests
      ↓
validate template
      ↓
redeploy
      ↓
repeat smoke tests
```

Do not make undocumented console changes that cause the deployed environment to diverge from CloudFormation.

## Git workflow

Use `main` as the canonical branch for the public repository. Keep deployment-related changes reviewable and use conventional commit messages such as `feat:`, `fix:`, `infra:`, `test:`, and `docs:`.

Never commit AWS credentials, session tokens, GitHub tokens, generated secret configuration, or local build artifacts that are excluded by `.gitignore`.
