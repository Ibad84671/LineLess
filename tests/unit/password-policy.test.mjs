import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSWORD_POLICY,
  passwordRuleChecks,
  passwordMeetsPolicy,
  passwordStrength,
  confirmMatches,
  describeCognitoError,
} from '../../frontend/assets/js/password-policy.js';

test('PASSWORD_POLICY mirrors the deployed Cognito pool policy', () => {
  // Source of truth: infrastructure/lineless.yaml UserPool.Policies.PasswordPolicy.
  assert.deepEqual(PASSWORD_POLICY, {
    minLength: 8,
    requireLowercase: true,
    requireUppercase: true,
    requireNumbers: true,
    requireSymbols: false,
  });
});

test('passwordRuleChecks covers exactly the enforced rules', () => {
  const keys = passwordRuleChecks('anything').map((c) => c.key);
  assert.deepEqual(new Set(keys), new Set(['length', 'uppercase', 'lowercase', 'number']));
  // RequireSymbols=false in the pool: no special-character requirement is shown.
  assert.ok(!keys.includes('symbol'));
  assert.ok(!keys.includes('specialChar'));
});

test('passwordRuleChecks reports each rule as unmet for an empty string', () => {
  const checks = Object.fromEntries(passwordRuleChecks('').map((c) => [c.key, c.met]));
  assert.deepEqual(checks, { length: false, uppercase: false, lowercase: false, number: false });
});

test('passwordRuleChecks flips each rule individually', () => {
  const of = (pw) => Object.fromEntries(passwordRuleChecks(pw).map((c) => [c.key, c.met]));
  assert.deepEqual(of('aaaaaaaa'), { length: true, uppercase: false, lowercase: true, number: false });
  assert.deepEqual(of('AAAAAAAA'), { length: true, uppercase: true, lowercase: false, number: false });
  assert.deepEqual(of('11111111'), { length: true, uppercase: false, lowercase: false, number: true });
  assert.deepEqual(of('Abcdef12'), { length: true, uppercase: true, lowercase: true, number: true });
});

test('passwordMeetsPolicy rejects empty and invalid passwords', () => {
  assert.equal(passwordMeetsPolicy(''), false);
  assert.equal(passwordMeetsPolicy('   '), false);
  assert.equal(passwordMeetsPolicy('short1'), false);       // lacks uppercase
  assert.equal(passwordMeetsPolicy('LOWERCASE123'), false); // lacks lowercase
  assert.equal(passwordMeetsPolicy('Abcdefgh'), false);     // lacks number
  assert.equal(passwordMeetsPolicy('abcdef12'), false);     // lacks uppercase
  assert.equal(passwordMeetsPolicy('12345678'), false);     // lacks letters
});

test('passwordMeetsPolicy accepts policy-compliant passwords', () => {
  assert.equal(passwordMeetsPolicy('Abcdef12'), true);      // 8 chars + all classes
  assert.equal(passwordMeetsPolicy('Abcdefg1'), true);      // 9 chars
  assert.equal(passwordMeetsPolicy('Ab1!@#xyz'), true);     // symbols not required
  assert.equal(passwordMeetsPolicy('A1b2C3d4E5'), true);
});

test('passwordStrength gates on length first, then the character rules', () => {
  assert.equal(passwordStrength(''), 'weak');
  assert.equal(passwordStrength('x7'), 'weak');             // too short to ever be fair
  assert.equal(passwordStrength('abcdefgh'), 'weak');       // length + lowercase only
  assert.equal(passwordStrength('abcdef12'), 'fair');       // length + lowercase + number
  assert.equal(passwordStrength('Abcdefgh'), 'fair');       // length + upper + lower
  assert.equal(passwordStrength('Abcdefg1'), 'strong');     // all enforced rules met
  assert.equal(passwordStrength('Abcdef1!xy'), 'strong');   // symbols are irrelevant
});

test('confirmMatches only matches non-empty equal strings', () => {
  assert.equal(confirmMatches('', ''), false);
  assert.equal(confirmMatches('Abcdef12', ''), false);
  assert.equal(confirmMatches('', 'Abcdef12'), false);
  assert.equal(confirmMatches('Abcdef12', 'Abcdef13'), false);
  assert.equal(confirmMatches('Cab', 'cab'), false);
  assert.equal(confirmMatches('Abcdef12', 'Abcdef12'), true);
});

test('describeCognitoError maps known Cognito codes to friendly copy', () => {
  assert.match(describeCognitoError({ code: 'CodeMismatchException' }), /incorrect/i);
  assert.match(describeCognitoError({ code: 'ExpiredCodeException' }), /expired/i);
  assert.match(describeCognitoError({ code: 'InvalidPasswordException' }), /requirements/i);
  assert.match(describeCognitoError({ code: 'UserNotFoundException' }), /No account matches/i);
  assert.match(describeCognitoError({ code: 'LimitExceededException' }), /Too many attempts/i);
  assert.match(describeCognitoError({ code: 'NotAuthorizedException' }), /no longer valid/i);
});

test('describeCognitoError never leaks internals for network/unknown errors', () => {
  assert.match(describeCognitoError(new TypeError('Failed to fetch')), /connection/i);
  assert.equal(describeCognitoError({ message: 'Boom' }), 'Boom');
  assert.match(describeCognitoError(null), /Something went wrong/i);
  assert.match(describeCognitoError(undefined), /Something went wrong/i);
});