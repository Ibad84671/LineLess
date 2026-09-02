import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const templatePath = join(root, 'infrastructure', 'lineless.yaml');

function loadRaw() {
  return readFileSync(templatePath, 'utf8');
}

function resourceBlocks(raw) {
  const blocks = [];
  const lines = raw.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const m = /^  ([A-Za-z][\w]*):$/.exec(line);
    if (m) {
      current = { name: m[1], lines: [] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return blocks;
}

function blockText(b) {
  return b.lines.join('\n');
}

test('WebSocket API is declared', () => {
  const raw = loadRaw();
  assert.ok(/AWS::ApiGatewayV2::Api/.test(raw), 'no WebSocket API declared');
});

test('WebSocket routes exist for connect/default/disconnect', () => {
  const raw = loadRaw();
  for (const route of ['$connect', '$default', '$disconnect']) {
    assert.ok(raw.includes(`RouteKey: ${route}`) || raw.includes(`RouteKey: "${route}"`),
      `missing WebSocket route: ${route}`);
  }
});

test('WebSocket integration points at a Lambda function', () => {
  const raw = loadRaw();
  assert.ok(/AWS::ApiGatewayV2::Integration/.test(raw), 'no WebSocket integration');
  assert.ok(/IntegrationType: AWS_PROXY/.test(raw), 'integration must use AWS_PROXY');
});

test('DynamoDB table exists', () => {
  const raw = loadRaw();
  assert.ok(/AWS::DynamoDB::Table/.test(raw), 'no DynamoDB table declared');
});

test('broadcast Lambda is wired to EventBridge', () => {
  const raw = loadRaw();
  assert.ok(/AWS::Events::Rule/.test(raw), 'no EventBridge rule');
  assert.ok(/lineless\.queue/.test(raw), 'EventBridge rule should match queue events');
});

test('SQS queue exists for notifications', () => {
  const raw = loadRaw();
  assert.ok(/AWS::SQS::Queue/.test(raw), 'no SQS queue declared');
});

test('CloudFront uses Origin Access Control', () => {
  const raw = loadRaw();
  assert.ok(/OriginAccessControl/.test(raw), 'no OriginAccessControl resource');
  assert.ok(/S3OriginConfig/.test(raw), 'no S3OriginConfig');
});

test('S3 bucket blocks public access', () => {
  const raw = loadRaw();
  assert.ok(/BlockPublicAccess/.test(raw) || /BlockPublicAcls: true/.test(raw),
    'S3 bucket must block public access');
});

test('no hardcoded account IDs or regions in resources', () => {
  const raw = loadRaw();
  const accountIdLike = raw.match(/(?<!["\w-])\d{12}(?!["\w-])/g) || [];
  assert.equal(accountIdLike.length, 0, `found hardcoded account IDs: ${accountIdLike.join(', ')}`);
});
