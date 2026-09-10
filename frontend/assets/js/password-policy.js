// Password policy + strength helpers for the sign-in/reset screens.
//
// Source of truth for the requirements is the deployed Cognito pool policy in
// infrastructure/lineless.yaml (UserPool.Policies.PasswordPolicy). Keep the
// two in sync — the checklist here is only shown for rules Cognito actually
// enforces, so it stays honest and matches server rejection reasons.
//
// This module is intentionally pure (no DOM, no window) so it can be unit
// tested with node:test.

export const PASSWORD_POLICY = {
  minLength: 8,
  requireLowercase: true,
  requireUppercase: true,
  requireNumbers: true,
  requireSymbols: false,
};

// Single regex set used by both the checklist and the strength assessment so
// there is exactly one definition of each rule.
const RULES = [
  { key: 'length', label: 'At least 8 characters', met: (v) => v.length >= PASSWORD_POLICY.minLength },
  { key: 'uppercase', label: 'An uppercase letter (A–Z)', met: (v) => /[A-Z]/.test(v) },
  { key: 'lowercase', label: 'A lowercase letter (a–z)', met: (v) => /[a-z]/.test(v) },
  { key: 'number', label: 'A number (0–9)', met: (v) => /[0-9]/.test(v) },
];

/**
 * Returns the enforced-rule checks for a candidate password, each with a
 * human label and whether it is satisfied. Mirrors PASSWORD_POLICY exactly.
 * @param {string} value
 * @returns {{key: string, label: string, met: boolean}[]}
 */
export function passwordRuleChecks(value) {
  const v = String(value ?? '');
  return RULES.map((r) => ({ key: r.key, label: r.label, met: r.met(v) }));
}

/**
 * True when the candidate satisfies every enforced Cognito rule AND is
 * non-empty (so empty fields are never treated as "valid").
 * @param {string} value
 * @returns {boolean}
 */
export function passwordMeetsPolicy(value) {
  const v = String(value ?? '');
  return v.length > 0 && RULES.every((r) => r.met(v));
}

/**
 * Composes the live-password strength verdict from the enforced rules only.
 * Length is a gate: a password that is too short is never fair/strong, and
 * everything else is decided by which of the character rules are satisfied.
 * @param {string} value
 * @returns {'weak' | 'fair' | 'strong'}
 */
export function passwordStrength(value) {
  const v = String(value ?? '');
  if (v.length < PASSWORD_POLICY.minLength) return 'weak';
  const extras = RULES.slice(1).filter((r) => r.met(v)).length; // upper + lower + number
  if (extras >= 3) return 'strong';
  if (extras === 2) return 'fair';
  return 'weak';
}

/**
 * Confirmation comparison used by the "passwords match" indicator.
 * Empty values never "match" so the submit gate stays shut until both are
 * filled in.
 * @param {string} value
 * @param {string} confirmation
 * @returns {boolean}
 */
export function confirmMatches(value, confirmation) {
  const a = String(value ?? '');
  const b = String(confirmation ?? '');
  return a.length > 0 && a === b;
}

// Friendly, non-revealing copy for the Cognito errors a reset flow actually
// surfaces. Never echo the request that failed or other sensitive internals.
const COGNITO_FRIENDLY = {
  UserNotFoundException: 'No account matches that email. Check the address and try again.',
  CodeMismatchException: 'That verification code is incorrect. Check your email and try again.',
  ExpiredCodeException: 'That verification code has expired. Request a new one.',
  InvalidPasswordException: 'That password does not meet the requirements. Try a different one.',
  LimitExceededException: 'Too many attempts. Please wait a minute and try again.',
  InvalidParameterException: 'The request could not be processed. Check the code and try again.',
  NotAuthorizedException: 'Your session is no longer valid. Request a new code.',
};

/**
 * Maps a thrown error (as produced by frontend/assets/js/auth.js) to a clear,
 * user-facing message. Falls back to the raw message only when it is safe.
 * @param {Error & {code?: string}} err
 * @returns {string}
 */
export function describeCognitoError(err) {
  if (err && typeof err.code === 'string' && COGNITO_FRIENDLY[err.code]) {
    return COGNITO_FRIENDLY[err.code];
  }
  if (err instanceof TypeError) {
    return 'Could not reach the service. Check your connection and try again.';
  }
  if (err && typeof err.message === 'string' && err.message.length > 0) {
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}