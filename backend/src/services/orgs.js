// Tenant lifecycle: organizations, branches, services, queues.
// Multi-tenancy rules:
// - orgId is always a server-generated UUID; never client-chosen.
// - The creator of an organization becomes its ORGANIZATION_ADMIN (server-
//   derived from the verified Cognito sub, never from a client role claim).
// - Every staff-scoped write requires a resolved context with sufficient role.

import { db } from '../shared/dynamo.js';
import { keys } from '../shared/keys.js';
import { uuid } from '../shared/ids.js';
import { notFound, badRequest, forbidden } from '../shared/errors.js';
import { sanitizeText, intIn, bool } from '../shared/validate.js';
import { normalizeNumberingConfig } from '../shared/numbering.js';
import { ROLES, hasAtLeast, requireRole } from '../shared/auth.js';

const nowIso = () => new Date().toISOString();

export async function createOrganization(user, { name }, { store = db() } = {}) {
  const orgName = sanitizeText(String(name ?? ''), 100);
  if (!orgName) throw badRequest('Organization name is required');
  const orgId = uuid();
  const ts = nowIso();

  await store.transactWrite([
    {
      Put: {
        Item: {
          PK: keys.orgMeta(orgId).PK,
          SK: 'META',
          entityType: 'Organization',
          orgId,
          name: orgName,
          createdBy: user.sub,
          createdAt: ts,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
    {
      Put: {
        Item: {
          PK: keys.orgMeta(orgId).PK,
          SK: `STAFF#${user.sub}`,
          GSI2PK: `USER#${user.sub}`,
          GSI2SK: `ORG#${orgId}`,
          entityType: 'Staff',
          orgId,
          sub: user.sub,
          email: user.email,
          role: ROLES.ORGANIZATION_ADMIN,
          status: 'ACTIVE',
          createdAt: ts,
        },
      },
    },
  ]);

  return { orgId, name: orgName, role: ROLES.ORGANIZATION_ADMIN };
}

export async function listOrganizationsForUser(sub, { store = db() } = {}) {
  const res = await store.query({
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :u',
    ExpressionAttributeValues: { ':u': `USER#${sub}` },
  });
  const orgIds = res.items
    .filter((m) => m.status === 'ACTIVE' && m.orgId !== '__platform__')
    .map((m) => ({ orgId: m.orgId, role: m.role }));

  if (orgIds.length === 0) return [];
  const orgs = await store.batchGet(orgIds.map((o) => keys.orgMeta(o.orgId)));
  const byId = new Map(orgs.map((o) => [o.orgId, o]));
  return orgIds
    .filter((o) => byId.has(o.orgId))
    .map((o) => ({ orgId: o.orgId, role: o.role, name: byId.get(o.orgId).name }));
}

export async function assertMembership(sub, orgId, { store = db() } = {}) {
  const staff = await store.get(keys.staff(orgId, sub));
  if (!staff || staff.status !== 'ACTIVE') throw forbidden('Not a member of this organization');
  return staff;
}

export async function createBranch(ctx, orgId, { name, address }, { store = db() } = {}) {
  await requireRole(ctx, ROLES.MANAGER);
  const branchName = sanitizeText(String(name ?? ''), 100);
  if (!branchName) throw badRequest('Branch name is required');
  const branchId = uuid();
  await store.put({
    PK: keys.orgMeta(orgId).PK,
    SK: `BR#${branchId}`,
    entityType: 'Branch',
    orgId,
    branchId,
    name: branchName,
    ...(address ? { address: sanitizeText(String(address), 200) } : {}),
    createdAt: nowIso(),
  });
  return { branchId, name: branchName };
}

export async function createService(ctx, orgId, { name, defaultServiceMinutes }, { store = db() } = {}) {
  await requireRole(ctx, ROLES.MANAGER);
  const serviceName = sanitizeText(String(name ?? ''), 100);
  if (!serviceName) throw badRequest('Service name is required');
  const defaultServiceMs = intIn(defaultServiceMinutes, { name: 'defaultServiceMinutes', min: 1, max: 480, def: 5 }) * 60000;
  const serviceId = uuid();
  await store.put({
    PK: keys.orgMeta(orgId).PK,
    SK: `SVC#${serviceId}`,
    entityType: 'Service',
    orgId,
    serviceId,
    name: serviceName,
    defaultServiceMs,
    createdAt: nowIso(),
  });
  return { serviceId, name: serviceName, defaultServiceMs };
}

function validId(v) {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
}

/**
 * Creates a queue. Also writes the public runtime item (Q#{queueId}/META)
 * with denormalized names, the org index item, and pre-creates the counter
 * with open=true so joins can start immediately.
 */
export async function createQueue(ctx, orgId, body, { store = db() } = {}) {
  await requireRole(ctx, ROLES.MANAGER);
  const name = sanitizeText(String(body?.name ?? ''), 100);
  if (!name) throw badRequest('Queue name is required');
  const branchId = validId(body?.branchId);
  const serviceId = validId(body?.serviceId);
  if (!branchId || !serviceId) throw badRequest('branchId and serviceId are required');

  const org = await store.get(keys.orgMeta(orgId));
  const branch = await store.get(keys.branch(orgId, branchId));
  const service = await store.get(keys.service(orgId, serviceId));
  if (!org) throw notFound('Organization not found');
  if (!branch) throw notFound('Branch not found');
  if (!service) throw notFound('Service not found');

  const numbering = normalizeNumberingConfig({
    prefix: body?.prefix,
    padWidth: body?.padWidth,
    resetDaily: bool(body?.resetDaily, { def: false }),
  });
  const queueId = uuid();
  const ts = nowIso();
  const queueMeta = {
    PK: `Q#${queueId}`,
    SK: 'META',
    entityType: 'Queue',
    queueId,
    orgId,
    branchId,
    serviceId,
    name,
    description: body?.description ? sanitizeText(String(body.description), 300) : undefined,
    orgName: org.name,
    branchName: branch.name,
    serviceName: service.name,
    defaultServiceMs: service.defaultServiceMs,
    avgServiceMs: null,
    staffCount: intIn(body?.staffCount, { name: 'staffCount', min: 1, max: 100, def: 1 }),
    ...numbering,
    status: 'OPEN',
    paused: false,
    nowServing: null,
    lastServedTicket: 0,
    isPublic: true,
    createdAt: ts,
    updatedAt: ts,
  };

  await store.transactWrite([
    { Put: { Item: queueMeta, ConditionExpression: 'attribute_not_exists(PK)' } },
    {
      Put: {
        Item: {
          PK: keys.orgMeta(orgId).PK,
          SK: `QUEUE#${queueId}`,
          entityType: 'QueueIndex',
          queueId,
          orgId,
          branchId,
          serviceId,
          name,
          branchName: branch.name,
          serviceName: service.name,
          status: 'OPEN',
          createdAt: ts,
        },
      },
    },
    {
      Put: {
        Item: {
          PK: `Q#${queueId}`,
          SK: numbering.resetDaily ? `COUNTER#${new Date().toISOString().slice(0, 10)}` : 'COUNTER',
          open: true,
          lastNumber: 0,
        },
      },
    },
  ]);

  return { queueId, name, prefix: numbering.prefix, padWidth: numbering.padWidth };
}

export async function listOrganizationQueues(ctx, orgId, { store = db() } = {}) {
  const member = await assertMembership(ctx.sub, orgId, { store });
  if (!hasAtLeast(member.role, ROLES.STAFF)) throw forbidden('Requires staff role');
  const res = await store.query({
    KeyConditionExpression: 'PK = :o AND begins_with(SK, :q)',
    ExpressionAttributeValues: { ':o': keys.orgMeta(orgId).PK, ':q': 'QUEUE#' },
  });
  return res.items.map((q) => ({
    queueId: q.queueId,
    name: q.name,
    branchName: q.branchName ?? null,
    serviceName: q.serviceName ?? null,
    status: q.status,
    createdAt: q.createdAt,
  }));
}
