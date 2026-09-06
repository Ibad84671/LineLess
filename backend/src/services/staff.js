// Staff management and public directory publishing.

import { db } from '../shared/dynamo.js';
import { keys } from '../shared/keys.js';
import { opaqueId } from '../shared/ids.js';
import { notFound, conflict } from '../shared/errors.js';
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
    const res = await cognitoAdmin(staffEmail);
    sub = res.sub;
  } else {
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

/** On first authenticated request, links PENDING_LINK staff records to the real Cognito sub. */
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
  return res.items.map((s) => ({ email: s.email, role: s.role, status: s.status, name: s.name ?? null }));
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

/**
 * Public directory data is deliberately limited to discoverable organization
 * and queue metadata. Customer/contact records and operational staff data
 * never leave the authenticated API surface.
 */
export async function listPublicDirectory({ store = db() } = {}) {
  const res = await store.query({
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :dir',
    ExpressionAttributeValues: { ':dir': 'DIR#PUBLIC' },
  });

  const organizations = [];
  for (const o of res.items) {
    const queueIndex = await store.query({
      KeyConditionExpression: 'PK = :o AND begins_with(SK, :q)',
      ExpressionAttributeValues: { ':o': keys.orgMeta(o.orgId).PK, ':q': 'QUEUE#' },
    });
    const queueMeta = queueIndex.items.length
      ? await store.batchGet(queueIndex.items.map((q) => keys.queueMeta(q.queueId)))
      : [];
    const byId = new Map(queueMeta.map((q) => [q.queueId, q]));
    const queues = queueIndex.items
      .map((q) => byId.get(q.queueId))
      .filter((q) => q?.isPublic !== false)
      .map((q) => ({
        queueId: q.queueId,
        name: q.name,
        description: q.description ?? null,
        branchName: q.branchName ?? null,
        serviceName: q.serviceName ?? null,
        status: q.status,
        paused: Boolean(q.paused),
        waitingCount: Number(q.waitingCount ?? 0),
      }));

    organizations.push({ orgId: o.orgId, name: o.name, location: o.location ?? null, queues });
  }
  return organizations;
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
