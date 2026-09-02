// ID and token generation. All identifiers are opaque, unguessable values.
// Queue IDs are NOT sequential — a guest must only learn a queue via its
// shareable link/QR, never by enumeration.

import { randomUUID, randomBytes } from 'node:crypto';

export const uuid = () => randomUUID();

/** URL-safe, high-entropy identifier (default 128 bits). */
export function opaqueId(bytes = 16) {
  return randomBytes(bytes).toString('base64url');
}

/** Short-lived customer session token: 128-bit random, URL-safe. */
export const customerToken = () => opaqueId(16);

/** Prefix used inside DynamoDB customer-token keys. */
export const TOKEN_PREFIX = 'ctok_';
export const newCustomerToken = () => TOKEN_PREFIX + customerToken();
