// Validation helpers — strict, allocation-light, no dependency on a schema lib.
// Every API input passes through one of these before touching DynamoDB.
// All failures raise AppError(400) so routers return clean 400 responses.

import { badRequest } from './errors.js';

export function isNonEmptyString(v, max = 256) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}

export function str(v, { name = 'value', min = 1, max = 256, pattern } = {}) {
  if (typeof v !== 'string' || v.trim().length < min || v.length > max) {
    throw badRequest(`${name} must be a string of ${min}-${max} characters`);
  }
  if (pattern && !pattern.test(v)) {
    throw badRequest(`${name} has an invalid format`);
  }
  return v.trim();
}

export function intIn(v, { name = 'value', min = 0, max = 1000000, def } = {}) {
  if (v === undefined || v === null) {
    if (def !== undefined) return def;
    throw badRequest(`${name} is required`);
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw badRequest(`${name} must be an integer between ${min} and ${max}`);
  }
  return n;
}

export function oneOf(v, allowed, { name = 'value', def } = {}) {
  if (v === undefined || v === null) {
    if (def !== undefined) return def;
    throw badRequest(`${name} is required`);
  }
  if (!allowed.includes(v)) {
    throw badRequest(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return v;
}

export function bool(v, { def = false } = {}) {
  if (v === undefined || v === null) return def;
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw badRequest('must be a boolean');
}

export function email(v, { name = 'email' } = {}) {
  const s = str(v, { name, max: 254 });
  // Pragmatic RFC-ish validation, deliberately conservative.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) {
    throw badRequest(`${name} is not a valid email address`);
  }
  return s.toLowerCase();
}

/**
 * Escapes user-provided text for safe display. Backend defense-in-depth:
 * the frontend renders via textContent only, but stored values are also
 * stripped of control characters at write time.
 */
export function sanitizeText(v, max = 256) {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max).trim();
}

export function assert(condition, message, details) {
  if (!condition) throw badRequest(message, details);
}
