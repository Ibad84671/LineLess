# LineLess one-command deployment (CloudFormation source of truth).
# Usage:
#   pwsh scripts/deploy.ps1 -Environment dev [-SenderEmail you@x.com] `
#        [-EnableSmsNotifications] [-SkipTests]
# See docs/deployment.md for the full walkthrough.

[CmdletBinding()]
param(
  [ValidateSet('dev', 'staging', 'prod')] [string]$Environment = 'dev',
  [string]$StackName = '',
  [string]$SenderEmail = '',
  [switch]$EnableSmsNotifications,
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
if (-not $StackName) { $StackName = "lineless-$Environment" }
$Region = $env:AWS_REGION
if (-not $Region) { $Region = (aws configure get region) }
if (-not $Region) { $Region = 'us-east-1' }
$env:AWS_REGION = $Region
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Fail($msg) { Write-Host "DEPLOY FAILED: $msg" -ForegroundColor Red; exit 1 }
function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# ---- 1. Prerequisites ------------------------------------------------------
Step 'Verifying prerequisites'
foreach ($tool in 'node', 'aws') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Fail "$tool is required but not on PATH" }
}
$identity = aws sts get-caller-identity --output json | ConvertFrom-Json
if (-not $identity.Account) { Fail 'AWS credentials not usable (sts get-caller-identity failed)' }
$Account = $identity.Account
Write-Host "AWS account $Account / region $Region / stack $StackName"
if ($SenderEmail -eq '') { Write-Host 'SES sender not configured — email notifications will be skipped (safe default).' -ForegroundColor Yellow }

# ---- 2. Dependencies + tests ------------------------------------------------
Step 'Installing dependencies'
if (-not (Test-Path "$RepoRoot\node_modules")) { npm ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { Fail 'npm ci failed' } }

if (-not $SkipTests) {
  Step 'Running tests (skippable with -SkipTests)'
  npm test; if ($LASTEXITCODE -ne 0) { Fail 'tests failed' }
  node scripts/static-checks.js; if ($LASTEXITCODE -ne 0) { Fail 'static checks failed' }
}

# ---- 3. Validate template ----------------------------------------------------
Step 'Validating CloudFormation template'
aws cloudformation validate-template --template-body "file://infrastructure/lineless.yaml" --region $Region | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'CloudFormation validation failed' }

# ---- 4. Package Lambda artifact ----------------------------------------------
Step 'Packaging Lambda artifact'
node scripts/package-backend.js --out dist/lambda.zip; if ($LASTEXITCODE -ne 0) { Fail 'packaging failed' }

# ---- 5. Upload artifact --------------------------------------------------------
Step 'Uploading Lambda artifact'
$ArtifactBucket = "lineless-$Environment-artifacts-$Account"
aws s3api head-bucket --bucket $ArtifactBucket 2>$null
if ($LASTEXITCODE -ne 0) {
  aws s3api create-bucket --bucket $ArtifactBucket --region $Region | Out-Null
  aws s3api put-public-access-block --bucket $ArtifactBucket --public-access-block-configuration BlockPublicAcls=true,BlockPublicPolicy=true,IgnorePublicAcls=true,RestrictPublicBuckets=true | Out-Null
  aws s3api put-bucket-encryption --bucket $ArtifactBucket --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' | Out-Null
}
$hash = (Get-FileHash dist/lambda.zip -Algorithm SHA256).Hash.Substring(0, 12).ToLower()
$CodeKey = "lambda/lineless-$hash.zip"
aws s3 cp dist/lambda.zip "s3://$ArtifactBucket/$CodeKey" | Out-Null

# ---- 6. Stack create/update ------------------------------------------------------
Step 'Determining stack state'
$stackJson = aws cloudformation describe-stacks --stack-name $StackName --region $Region --output json 2>$null
$stackExists = ($LASTEXITCODE -eq 0)

$CfnDeployArgs = @(
  '--stack-name', $StackName,
  '--template-file', 'infrastructure/lineless.yaml',
  '--parameter-overrides',
  "Environment=$Environment",
  "LambdaCodeBucket=$ArtifactBucket",
  "LambdaCodeKey=$CodeKey",
  "SenderEmail=$SenderEmail",
  "EnableSmsNotifications=$(if ($EnableSmsNotifications) {'true'} else {'false'})",
  '--capabilities', 'CAPABILITY_NAMED_IAM',
  '--region', $Region
)

if (-not $stackExists) {
  Step "Creating stack $StackName"
  aws cloudformation deploy @CfnDeployArgs
  if ($LASTEXITCODE -ne 0) { Fail 'stack creation failed' }
} else {
  Step "Updating stack $StackName"
  aws cloudformation deploy @CfnDeployArgs
  if ($LASTEXITCODE -ne 0) { Fail 'stack update failed' }
}

# ---- 7. Read outputs ------------------------------------------------------------
Step 'Reading stack outputs'
$stack = (aws cloudformation describe-stacks --stack-name $StackName --region $Region --output json | ConvertFrom-Json).Stacks[0]
if ($stack.StackStatus -match 'ROLLBACK|FAILED') { Fail "stack status is $($stack.StackStatus)" }
$out = @{}
foreach ($o in $stack.Outputs) { $out[$o.OutputKey] = $o.OutputValue }
$CloudFrontUrl = $out['CloudFrontURL']
if (-not $CloudFrontUrl) { Fail 'CloudFrontURL output missing' }

# ---- 8. Build + upload frontend ---------------------------------------------------
Step 'Building frontend with deployed configuration'
node scripts/build.js `
  --api-url "$($out['ApiUrl'])" `
  --ws-url "$($out['WebSocketUrl'])" `
  --region $Region `
  --user-pool-id "$($out['UserPoolId'])" `
  --client-id "$($out['UserPoolClientId'])"
if ($LASTEXITCODE -ne 0) { Fail 'frontend build failed' }

Step 'Uploading frontend to S3'
$FrontendBucket = $out['FrontendBucketName']
aws s3 sync dist/frontend "s3://$FrontendBucket/" --delete --cache-control "public,max-age=300" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'frontend upload failed' }

# ---- 9. Invalidate CloudFront -------------------------------------------------------
Step 'Invalidating CloudFront cache'
$DistId = $out['DistributionId']
aws cloudfront create-invalidation --distribution-id $DistId --paths "/*" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'CloudFront invalidation failed' }

# ---- 10. Smoke tests -------------------------------------------------------------------
Step 'Running smoke tests'
$health = "$($out['ApiUrl'])/health"
try {
  $h = Invoke-RestMethod -Uri $health -Method Get -TimeoutSec 20
  if ($h.status -ne 'ok') { Fail 'health endpoint returned unexpected body' }
  Write-Host "  API health: OK ($health)"
} catch { Fail "API health check failed: $($_.Exception.Message)" }
try {
  $page = Invoke-WebRequest -Uri $CloudFrontUrl -Method Get -TimeoutSec 30
  if ($page.StatusCode -ne 200) { Fail "frontend returned $($page.StatusCode)" }
  Write-Host "  Frontend: OK ($CloudFrontUrl)"
} catch { Fail "frontend check failed: $($_.Exception.Message)" }

# ---- 11. Summary ------------------------------------------------------------------------
$deployInfo = [ordered]@{
  stack = $StackName; region = $Region; account = $Account; environment = $Environment
  frontend = $CloudFrontUrl; api = $out['ApiUrl']; websocket = $out['WebSocketUrl']
  userPoolId = $out['UserPoolId']; userPoolClientId = $out['UserPoolClientId']
  cognitoIssuer = $out['CognitoIssuer']; senderEmail = $SenderEmail
  smsEnabled = [bool]$EnableSmsNotifications; deployedAt = (Get-Date).ToUniversalTime().ToString('o')
}
New-Item -ItemType Directory -Force -Path dist | Out-Null
$deployInfo | ConvertTo-Json | Set-Content dist/deployment-info.json

Write-Host "`n================ LINELESS DEPLOYED ================" -ForegroundColor Green
Write-Host "  Frontend : $CloudFrontUrl"
Write-Host "  API      : $($out['ApiUrl'])"
Write-Host "  WebSocket: $($out['WebSocketUrl'])"
Write-Host "  Cognito  : pool $($out['UserPoolId']) / client $($out['UserPoolClientId'])"
Write-Host "  Email    : $(if ($SenderEmail) { $SenderEmail } else { 'not configured (notifications skipped)' })"
Write-Host "===================================================="
