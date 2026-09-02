# LineLess teardown: deletes the deployment stack and its data.
# NEVER touches infrastructure outside the LineLess stack and its buckets.
# Usage: pwsh scripts/destroy.ps1 -StackName lineless-dev [-Force]

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$StackName,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Region = $env:AWS_REGION
if (-not $Region) { $Region = (aws configure get region) }
if (-not $Region) { $Region = 'us-east-1' }
$env:AWS_REGION = $Region
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Fail($msg) { Write-Host "DESTROY FAILED: $msg" -ForegroundColor Red; exit 1 }

# Safety: only ever target LineLess stacks.
if ($StackName -notlike 'lineless-*') {
  Fail "refusing to delete stack '$StackName' — this script only deletes stacks named lineless-*"
}

$stackJson = aws cloudformation describe-stacks --stack-name $StackName --region $Region --output json 2>$null
if ($LASTEXITCODE -ne 0) { Fail "stack $StackName not found in $Region" }
$stack = ($stackJson | ConvertFrom-Json).Stacks[0]
if ($stack.StackStatus -like '*IN_PROGRESS*') { Fail "stack is busy ($($stack.StackStatus))" }

$account = (aws sts get-caller-identity --output json | ConvertFrom-Json).Account

Write-Host "This will DELETE stack '$StackName' in account $account / $Region," -ForegroundColor Yellow
Write-Host "including the DynamoDB table (all queue data), Cognito users, and frontend bucket." -ForegroundColor Yellow

if (-not $Force) {
  $answer = Read-Host "Type the stack name to confirm"
  if ($answer -ne $StackName) { Fail 'confirmation did not match; aborting' }
}

# Empty + delete buckets created outside of CFN retention rules.
$stack = (aws cloudformation describe-stacks --stack-name $StackName --region $Region --output json | ConvertFrom-Json).Stacks[0]
$out = @{}
foreach ($o in $stack.Outputs) { $out[$o.OutputKey] = $o.OutputValue }
$envSlug = if ($StackName -match '^lineless-(.+)$') { $Matches[1] } else { $StackName }
$buckets = @($out['FrontendBucketName'], "lineless-$envSlug-artifacts-$account")
foreach ($b in $buckets) {
  if (-not $b) { continue }
  Write-Host "Purging bucket $b…"
  $versionsJson = aws s3api list-object-versions --bucket $b --output json 2>$null | ConvertFrom-Json
  $objects = @()
  if ($versionsJson.Versions) {
    $objects += $versionsJson.Versions | ForEach-Object { @{ Key = $_.Key; VersionId = $_.VersionId } }
  }
  if ($versionsJson.DeleteMarkers) {
    $objects += $versionsJson.DeleteMarkers | ForEach-Object { @{ Key = $_.Key; VersionId = $_.VersionId } }
  }
  foreach ($obj in $objects) {
    aws s3api delete-object --bucket $b --key $obj.Key --version-id $obj.VersionId | Out-Null
  }
  aws s3 rb "s3://$b" --force 2>$null
}

Write-Host "Deleting stack $StackName…"
aws cloudformation delete-stack --stack-name $StackName --region $Region
if ($LASTEXITCODE -ne 0) { Fail 'delete-stack failed' }
Write-Host 'Waiting for deletion (may take several minutes)…'
aws cloudformation wait stack-delete-complete --stack-name $StackName --region $Region
if ($LASTEXITCODE -ne 0) { Fail 'stack deletion did not complete cleanly — check CloudFormation events' }

Write-Host "`nLineLess stack '$StackName' deleted." -ForegroundColor Green
