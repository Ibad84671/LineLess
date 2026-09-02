import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/setup.mjs';
import { str, intIn, oneOf, email, sanitizeText, bool } from '../../backend/src/shared/validate.js';
import { ROLES, hasAtLeast } from '../../backend/src/shared/auth.js';
import { AppError } from '../../backend/src/shared/errors.js';

test('str enforces bounds and pattern', () => {
  assert.equal(str(' hello ', { max: 10 }), 'hello');
  assert.throws(() => str('', {}), AppError);
  assert.throws(() => str('x'.repeat(300), {}), AppError);
  assert.throws(() => str('bad id', { pattern: /^[a-z]+$/ }), AppError);
});

test('intIn enforces integer ranges', () => {
  assert.equal(intIn('5', { min: 1, max: 10 }), 5);
  assert.equal(intIn(undefined, { def: 3 }), 3);
  assert.throws(() => intIn(2.5, {}), AppError);
  assert.throws(() => intIn(0, { min: 1 }), AppError);
});

test('oneOf restricts values with optional default', () => {
  assert.equal(oneOf('a', ['a', 'b']), 'a');
  assert.equal(oneOf(undefined, ['a'], { def: 'a' }), 'a');
  assert.throws(() => oneOf('c', ['a', 'b']), AppError);
});

test('email validation is conservative', () => {
  assert.equal(email('User@Example.COM'), 'user@example.com');
  assert.throws(() => email('not-an-email'), AppError);
  assert.throws(() => email('a@b'), AppError);
});

test('sanitizeText strips control characters and truncates', () => {
  assert.equal(sanitizeText('hello\u0000\u001fworld', 100), 'helloworld');
  assert.equal(sanitizeText('x'.repeat(50), 10), 'x'.repeat(10));
});

test('bool parses accepted representations', () => {
  assert.equal(bool(true), true);
  assert.equal(bool('true'), true);
  assert.equal(bool(undefined, { def: true }), true);
  assert.throws(() => bool('maybe'), AppError);
});

test('role ranking forms a strict hierarchy', () => {
  assert.ok(hasAtLeast(ROLES.STAFF, ROLES.STAFF));
  assert.ok(hasAtLeast(ROLES.MANAGER, ROLES.STAFF));
  assert.ok(hasAtLeast(ROLES.ORGANIZATION_ADMIN, ROLES.MANAGER));
  assert.ok(hasAtLeast(ROLES.PLATFORM_ADMIN, ROLES.ORGANIZATION_ADMIN));
  assert.ok(!hasAtLeast(ROLES.STAFF, ROLES.MANAGER));
  assert.ok(!hasAtLeast(null, ROLES.STAFF));
  assert.ok(!hasAtLeast(ROLES.CUSTOMER, ROLES.STAFF));
});
