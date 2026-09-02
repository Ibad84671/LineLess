// Staff management and public directory publishing.

import { db } from '../shared/dynamo.js';
import { keys } from '../shared/keys.js';
import { opaqueId } from '../shared/ids.js';
import { notFound, conflict, forbidden } from '../shared/errors.js';
import { sanitizeText, email as validEmail, bool, oneOf } from '../shared/validate.js';
import { ROLES, requireRole } from '../shared/auth.js';

const nowIso = () => new Date().toISOString();

export async function inviteStaff(ctx, orgId, { email, role, name }, { store = db(), cognitoAdmin } = {}) {
  await requireRole(ctx, ROLES.ORGANIZATION_ADMIN);
  const staffEmail = validEmail(email);
  const staffRole = oneOf(role, [ROLES.STAFF, ROLES.MANAGER, ROLES.ORGANIZATION_ADMIN], { name: 'role' });

  const existing = await store.query({
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :e',
    ExpressionAttributeValues: { ':e': `STAFFEMAIL#${staffEmail}` },
  });
  const known = existing.items.find((i) => i.orgId === orgId);
  if (known) throw conflict('This person is already staff for this organization', 'ALREADY_STAFF');

  let sub;
  if (cognitoAdmin) {
    // Real deployment: create the Cognito user so the invitee can sign in
    // immediately with a temporary password (they change it on first login).
    const res = await cognitoAdmin(staffEmail);
    sub = res.sub;
  } else {
    // Offline/tests: record is linked to the real Cognito sub at first login
    // (see linkStaffOnSignup).
    sub = `pending:${opaqueId(8)}`;
  }

  const pending = sub.startsWith('pending:');
  await store.put({
    PK: keys.orgMeta(orgId).PK,
    SK: `STAFF#${sub}`,
    GSI2PK: `USER#${sub}`,
    GSI2SK: `ORG#${orgId}`,
    GSI1PK: `STAFFEMAIL#${staffEmail}`,
    GSI1SK: `ORG#${orgId}`,
    entityType: 'Staff',
    orgId,
    sub,
    email: staffEmail,
    ...(name ? { name: sanitizeText(String(name), 100) } : {}),
    role: staffRole,
    status: pending ? 'PENDING_LINK' : 'ACTIVE',
    createdAt: nowIso(),
  });
  return { email: staffEmail, role: staffRole, status: pending ? 'PENDING_LINK' : 'ACTIVE' };
}

/** On first authenticated request, links PENDING_LINK staff records (matched
 * by verified email) to the real Cognito sub. Server-side only. */
export async function linkStaffOnSignup(ctx, { store = db() } = {}) {
  if (!ctx.email || !ctx.sub) return;
  const res = await store.query({
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :e',
    ExpressionAttributeValues: { ':e': `STAFFEMAIL#${String(ctx.email).toLowerCase()}` },
  });
  for (const pending of res.items.filter((i) => i.status === 'PENDING_LINK')) {
    await store.transactWrite([
      {
        Put: {
          Item: {
            ...pending,
            PK: keys.orgMeta(pending.orgId).PK,
            SK: `STAFF#${ctx.sub}`,
            GSI2PK: `USER#${ctx.sub}`,
            GSI2SK: `ORG#${pending.orgId}`,
            sub: ctx.sub,
            status: 'ACTIVE',
            linkedAt: nowIso(),
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      { Delete: { Key: { PK: keys.orgMeta(pending.orgId).PK, SK: `STAFF#${pending.sub}` } } },
    ]);
  }
}

export async function listStaff(ctx, orgId, { store = db() } = {}) {
  await requireRole(ctx, ROLES.MANAGER);
  const res = await store.query({
    KeyConditionExpression: 'PK = :o AND begins_with(SK, :s)',
    ExpressionAttributeValues: { ':o': keys.orgMeta(orgId).PK, ':s': 'STAFF#' },
  });
  return res.items.map((s) => ({
    email: s.email,
    role: s.role,
    status: s.status,
    name: s.name ?? null,
  }));
}

export async function updateStaffRole(ctx, orgId, { email, role }, { store = db() } = {}) {
  await requireRole(ctx, ROLES.ORGANIZATION_ADMIN);
  const staffEmail = validEmail(email);
  const newRole = oneOf(role, [ROLES.STAFF, ROLES.MANAGER, ROLES.ORGANIZATION_ADMIN], { name: 'role' });
  const res = await store.query({
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :e',
    ExpressionAttributeValues: { ':e': `STAFFEMAIL#${staffEmail}` },
  });
  const member = res.items.find((i) => i.orgId === orgId);
  if (!member) throw notFound('Staff member not found');
  await store.update({
    Key: { PK: keys.orgMeta(orgId).PK, SK: `STAFF#${member.sub}` },
    UpdateExpression: 'SET #r = :role, updatedAt = :now',
    ExpressionAttributeNames: { '#r': 'role' },
    ExpressionAttributeValues: { ':role': newRole, ':now': nowIso() },
  });
  return { email: staffEmail, role: newRole };
}

export async function listPublicDirectory({ store = db() } = {}) {
  // Only organizations that explicitly opted in appear here.
  const res = await store.query({
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :dir',
    ExpressionAttributeValues: { ':dir': 'DIR#PUBLIC' },
  });
  return res.items.map((o) => ({
    orgId: o.orgId,
    name: o.name,
    location: o.location ?? null,
  }));
}

export async function publishOrganization(ctx, orgId, { publish, location }, { store = db() } = {}) {
  await requireRole(ctx, ROLES.ORGANIZATION_ADMIN);
  const org = await store.get(keys.orgMeta(orgId));
  if (!org) throw notFound('Organization not found');
  const wantsPublish = bool(publish, { def: true });

  if (wantsPublish) {
    await store.put({
      PK: `DIR#${orgId}`,
      SK: 'META',
      GSI1PK: 'DIR#PUBLIC',
      GSI1SK: org.name,
      entityType: 'DirectoryEntry',
      orgId,
      name: org.name,
      ...(location ? { location: sanitizeText(String(location), 120) } : {}),
      updatedAt: nowIso(),
    });
  } else {
    await store.delete({ PK: `DIR#${orgId}`, SK: 'META' });
  }
  return { published: wantsPublish };
}

export async function listOrgBranches(ctx, orgId, { store = db() } = {}) {
  await requireRole(ctx, ROLES.STAFF);
  const res = await store.query({
    KeyConditionExpression: 'PK = :o AND begins_with(SK, :b)',
    ExpressionAttributeValues: { ':o': keys.orgMeta(orgId).PK, ':b': 'BR#' },
  });
  return res.items.map((b) => ({ branchId: b.branchId, name: b.name, address: b.address ?? null }));
}

export async function listOrgServices(ctx, orgId, { store = db() } = {}) {
  await requireRole(ctx, ROLES.STAFF);
  const res = await store.query({
    KeyConditionExpression: 'PK = :o AND begins_with(SK, :s)',
    ExpressionAttributeValues: { ':o': keys.orgMeta(orgId).PK, ':s': 'SVC#' },
  });
  return res.items.map((s) => ({
    serviceId: s.serviceId,
    name: s.name,
    defaultServiceMinutes: Math.round((s.defaultServiceMs ?? 300000) / 60000),
  }));
}
