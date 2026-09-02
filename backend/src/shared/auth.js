// Cognito JWT verification + server-side role resolution.
//
// SECURITY MODEL (see docs/security.md):
// - Roles are NEVER read from token claims. A forged `custom:role` claim
//   grants nothing. The role is resolved from the DynamoDB staff record
//   (GSI2 lookup on the verified `sub`) inside the target organization.
// - Every authenticated route receives an AuthContext carrying {sub, email,
//   role, orgId} — built here, trusted everywhere else.

import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { env } from './env.js';
import { db } from './dynamo.js';
import { unauthorized, forbidden, notFound } from './errors.js';

export const ROLES = {
  CUSTOMER: 'CUSTOMER',
  STAFF: 'STAFF',
  MANAGER: 'MANAGER',
  ORGANIZATION_ADMIN: 'ORGANIZATION_ADMIN',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
};

const ROLE_RANK = {
  [ROLES.CUSTOMER]: 0,
  [ROLES.STAFF]: 1,
  [ROLES.MANAGER]: 2,
  [ROLES.ORGANIZATION_ADMIN]: 3,
  [ROLES.PLATFORM_ADMIN]: 4,
};

export function hasAtLeast(role, min) {
  return (ROLE_RANK[role] ?? -1) >= (ROLE_RANK[min] ?? 99);
}

// ---- JWT verification (RS256 via Cognito JWKS, cached) -------------------

const jwksCache = { keys: null, fetchedAt: 0 };
const JWKS_TTL_MS = 60 * 60 * 1000;

async function fetchJwks() {
  const now = Date.now();
  if (jwksCache.keys && now - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(`${env.cognitoIssuer}/.well-known/jwks.json`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  jwksCache.keys = await res.json();
  jwksCache.fetchedAt = now;
  return jwksCache.keys;
}

function b64urlToBuffer(s) {
  return Buffer.from(s, 'base64url');
}

/** Verifies signature + iss + exp + token_use. Returns payload or throws unauthorized. */
export async function verifyAccessToken(token) {
  if (!token || typeof token !== 'string') throw unauthorized();
  const parts = token.split('.');
  if (parts.length !== 3) throw unauthorized('Malformed token');
  let header;
  let payload;
  try {
    header = JSON.parse(b64urlToBuffer(parts[0]).toString('utf8'));
    payload = JSON.parse(b64urlToBuffer(parts[1]).toString('utf8'));
  } catch {
    throw unauthorized('Malformed token');
  }
  if (header.alg !== 'RS256' || !header.kid) throw unauthorized('Unsupported token');
  if (payload.iss !== env.cognitoIssuer) throw unauthorized('Unknown issuer');
  if (payload.token_use !== 'access' || payload.client_id !== env.appClientId) {
    throw unauthorized('Wrong token type');
  }
  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
    throw unauthorized('Token expired');
  }
  const jwks = await fetchJwks();
  const jwk = jwks.keys?.find((k) => k.kid === header.kid);
  if (!jwk) throw unauthorized('Unknown signing key');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const ok = cryptoVerify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    key,
    b64urlToBuffer(parts[2]),
  );
  if (!ok) throw unauthorized('Invalid signature');
  return payload;
}

export function extractBearer(event) {
  const h = event.headers || {};
  const auth = h.Authorization || h.authorization || '';
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  throw unauthorized();
}

// ---- Authorization context ----------------------------------------------

function badRequestOrgRequired(memberships) {
  const err = forbidden('Organization context required');
  err.details = { organizations: memberships.items.map((m) => m.orgId) };
  return err;
}

/**
 * Resolves the caller's role for an organization from DynamoDB.
 * The role comes from the staff record, never from the token.
 */
export async function resolveContext(event, { orgId, minRole } = {}) {
  const payload = await verifyAccessToken(extractBearer(event));
  const sub = payload.sub;
  if (!sub) throw unauthorized();

  const memberships = await db().query({
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :u',
    ExpressionAttributeValues: { ':u': `USER#${sub}` },
  });

  // Platform admins hold a membership in the reserved org '__platform__'.
  const platformMember = memberships.items.find(
    (m) => m.orgId === '__platform__' && m.status === 'ACTIVE',
  );
  let role = platformMember ? ROLES.PLATFORM_ADMIN : null;

  if (orgId) {
    const member = memberships.items.find(
      (m) => m.orgId === orgId && m.status === 'ACTIVE',
    );
    if (member && (role === ROLES.PLATFORM_ADMIN || (ROLE_RANK[member.role] ?? -1) > (ROLE_RANK[role] ?? -1))) {
      role = member.role;
    }
    if (!role) throw forbidden('You are not a member of this organization');
  } else if (!role) {
    // Cognito user with no org membership yet (onboarding state) — allowed
    // through with role null so they can create an organization.
    if (memberships.items.length === 0) {
      return {
        sub,
        email: payload.username || null,
        role: null,
        orgId: null,
        memberships: [],
      };
    }
    throw badRequestOrgRequired(memberships);
  }

  if (minRole && role && !hasAtLeast(role, minRole)) {
    throw forbidden(`Requires ${minRole} role`);
  }
  return {
    sub,
    email: payload.username || null,
    role,
    orgId: orgId ?? null,
    memberships: memberships.items,
  };
}

export async function requireRole(ctx, minRole) {
  if (!ctx.role || !hasAtLeast(ctx.role, minRole)) {
    throw forbidden(`Requires ${minRole} role`);
  }
}

/**
 * Central tenant-isolation choke point for queue operations: verifies the
 * caller's resolved role covers the queue's organization.
 */
export function authorizeQueueAccess(queueMeta, ctx, minRole = ROLES.STAFF) {
  if (!queueMeta) throw notFound('Queue not found');
  if (ctx.role === ROLES.PLATFORM_ADMIN) return;
  if (ctx.role && hasAtLeast(ctx.role, minRole) && ctx.orgId === queueMeta.orgId) return;
  throw forbidden('Not permitted for this queue');
}

export { notFound };

