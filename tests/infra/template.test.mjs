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

// Structural checks using regex — CloudFormation intrinsic tags (!Ref, !GetAtt, Fn::Sub)
// break stock YAML parsers, so we verify the *shape* of the template with text matching.
function resourceBlocks(raw) {
  const blocks = [];
  const lines = raw.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const m = /^ {2}([A-Za-z][\w]*):$/.exec(line);
    if (m) {
      current = { name: m[1], lines: [] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return blocks;
}

function blockContains(block, needle) {
  return block.lines.some((l) => l.includes(needle));
}

function blockType(block) {
  const typeLine = block.lines.find((l) => l.trim().startsWith('Type:'));
  if (!typeLine) return null;
  const cleaned = typeLine.split(':').slice(1).join(':').trim();
  return cleaned.replace(/![A-Za-z]+\s*/g, '').replace(/^"|"$/g, '');
}

test('CloudFormation template has required top-level keys', () => {
  const raw = loadRaw();
  for (const key of ['AWSTemplateFormatVersion:', 'Parameters:', 'Resources:', 'Outputs:']) {
    assert.ok(raw.includes(key), `missing top-level key: ${key}`);
  }
});

test('all Lambda functions have a Role property', () => {
  const raw = loadRaw();
  const blocks = resourceBlocks(raw);
  const lambdas = blocks.filter((b) => blockType(b) === 'AWS::Lambda::Function');
  assert.ok(lambdas.length >= 4, `expected at least 4 Lambdas, found ${lambdas.length}`);
  for (const fn of lambdas) {
    assert.ok(blockContains(fn, 'Role:'), `Lambda ${fn.name} must have a Role property`);
  }
});

test('S3 buckets block public access', () => {
  const raw = loadRaw();
  const blocks = resourceBlocks(raw);
  const buckets = blocks.filter((b) => blockType(b) === 'AWS::S3::Bucket');
  assert.ok(buckets.length >= 1);
  for (const b of buckets) {
    assert.ok(
      blockContains(b, 'PublicAccessBlockConfiguration:'),
      `Bucket ${b.name} must declare PublicAccessBlockConfiguration`,
    );
    assert.ok(blockContains(b, 'BlockPublicAcls: true'), `Bucket ${b.name} must block public ACLs`);
    assert.ok(blockContains(b, 'BlockPublicPolicy: true'), `Bucket ${b.name} must block public policy`);
  }
});

test('DynamoDB table has SSE enabled', () => {
  const raw = loadRaw();
  const blocks = resourceBlocks(raw);
  const tables = blocks.filter((b) => blockType(b) === 'AWS::DynamoDB::Table');
  assert.ok(tables.length >= 1);
  for (const t of tables) {
    assert.ok(blockContains(t, 'SSEEnabled: true'), `Table ${t.name} must have SSE enabled`);
  }
});

test('outputs include all required deployment values', () => {
  const raw = loadRaw();
  for (const needed of ['CloudFrontURL:', 'ApiUrl:', 'WebSocketUrl:', 'UserPoolId:', 'UserPoolClientId:']) {
    assert.ok(raw.includes(needed), `missing output: ${needed}`);
  }
});

test('no hardcoded account IDs in resources', () => {
  const raw = loadRaw();
  const matches = raw.match(/(?<![\w-])\d{12}(?![\w-])/g) || [];
  assert.equal(matches.length, 0, `found hardcoded 12-digit numbers: ${matches.join(', ')}`);
});
