// Route table for authenticated staff/manager/admin surface.
// Auth resolution is centralized in router.js; these handlers receive a
// trusted AuthContext (role derived server-side from DynamoDB membership).

import { ok, created } from '../shared/http.js';
import { ROLES } from '../shared/auth.js';
import {
  createOrganization,
  listOrganizationsForUser,
  createBranch,
  createService,
  createQueue,
  listOrganizationQueues,
} from '../services/orgs.js';
import {
  inviteStaff,
  listStaff,
  updateStaffRole,
  publishOrganization,
  listOrgBranches,
  listOrgServices,
} from '../services/staff.js';
import { getOrganizationAnalytics } from '../services/analytics.js';
import {
  callNext,
  skipCurrent,
  recallCurrent,
  setQueueState,
} from '../services/queue-engine.js';
import { getQueueState } from '../services/queue-reads.js';

export const staffRoutes = [
  {
    method: 'GET',
    pattern: /^\/me$/,
    auth: 'self',
    handler: async (ctx) => {
      const orgs = await listOrganizationsForUser(ctx.auth.sub);
      return ok({ sub: ctx.auth.sub, email: ctx.auth.email, organizations: orgs });
    },
  },
  {
    method: 'POST',
    pattern: /^\/organizations$/,
    auth: 'self',
    handler: async (ctx) => created(await createOrganization(ctx.auth, ctx.body)),
  },
  {
    method: 'GET',
    pattern: /^\/organizations$/,
    auth: 'self',
    handler: async (ctx) => ok({ organizations: await listOrganizationsForUser(ctx.auth.sub) }),
  },
  {
    method: 'POST',
    pattern: /^\/organizations\/(?<orgId>[A-Za-z0-9_-]{1,64})\/branches$/,
    auth: { org: 'path' },
    handler: async (ctx, p) => created(await createBranch(ctx.auth, p.orgId, ctx.body)),
  },
  {
    method: 'GET',
    pattern: /^\/organizations\/(?<orgId>[A-Za-z0-9_-]{1,64})\/branches$/,
    auth: { org: 'path', minRole: ROLES.STAFF },
    handler: async (ctx, p) => ok({ branches: await listOrgBranches(ctx.auth, p.orgId) }),
  },
  {
    method: 'POST',
    pattern: /^\/organizations\/(?<orgId>[A-Za-z0-9_-]{1,64})\/services$/,
    auth: { org: 'path' },
    handler: async (ctx, p) => created(await createService(ctx.auth, p.orgId, ctx.body)),
  },
  {
    method: 'GET',
    pattern: /^\/organizations\/(?<orgId>[A-Za-z0-9_-]{1,64})\/services$/,
    auth: { org: 'path', minRole: ROLES.STAFF },
    handler: async (ctx, p) => ok({ services: await listOrgServices(ctx.auth, p.orgId) }),
  },
  {
    method: 'POST',
    pattern: /^\/organizations\/(?<orgId>[A-Za-z0-9_-]{1,64})\/queues$/,
    auth: { org: 'path' },
    handler: async (ctx, p) => created(await createQueue(ctx.auth, p.orgId, ctx.body)),
  },
  {
    method: 'GET',
    pattern: /^\/organizations\/(?<orgId>[A-Za-z0-9_-]{1,64})\/queues$/,
    auth: { org: 'path', minRole: ROLES.STAFF },
    handler: async (ctx, p) => ok({ queues: await listOrganizationQueues(ctx.auth, p.orgId) }),
  },
  {
    method: 'POST',
    pattern: /^\/organizations\/(?<orgId>[A-Za-z0-9_-]{1,64})\/staff$/,
    auth: { org: 'path' },
    handler: async (ctx, p) => created(await inviteStaff(ctx.auth, p.orgId, ctx.body, { cognitoAdmin: ctx.deps?.cognitoAdmin })),
  },
  {
    method: 'GET',
    pattern: /^\/organizations\/(?<orgId>[A-Za-z0-9_-]{1,64})\/staff$/,
    auth: { org: 'path' },
    handler: async (ctx, p) => ok({ staff: await listStaff(ctx.auth, p.orgId) }),
  },
  {
    method: 'PATCH',
    pattern: /^\/organizations\/(?<orgId>[A-Za-z0-9_-]{1,64})\/staff$/,
    auth: { org: 'path' },
    handler: async (ctx, p) => ok(await updateStaffRole(ctx.auth, p.orgId, ctx.body)),
  },
  {
    method: 'POST',
    pattern: /^\/organizations\/(?<orgId>[A-Za-z0-9_-]{1,64})\/publish$/,
    auth: { org: 'path' },
    handler: async (ctx, p) => ok(await publishOrganization(ctx.auth, p.orgId, ctx.body)),
  },
  {
    method: 'GET',
    pattern: /^\/organizations\/(?<orgId>[A-Za-z0-9_-]{1,64})\/analytics$/,
    auth: { org: 'path' },
    handler: async (ctx, p) => ok(await getOrganizationAnalytics(ctx.auth, p.orgId)),
  },
  {
    method: 'GET',
    pattern: /^\/queues\/(?<queueId>[A-Za-z0-9_-]{1,64})\/state$/,
    auth: 'queue',
    handler: async (ctx, p) => ok(await getQueueState(p.queueId)),
  },
  {
    method: 'POST',
    pattern: /^\/queues\/(?<queueId>[A-Za-z0-9_-]{1,64})\/(?<action>next|skip|recall)$/,
    auth: 'queue',
    handler: async (ctx, p) => {
      const fn = { next: callNext, skip: skipCurrent, recall: recallCurrent }[p.action];
      return ok(await fn({ queueId: p.queueId }));
    },
  },
  {
    method: 'POST',
    pattern: /^\/queues\/(?<queueId>[A-Za-z0-9_-]{1,64})\/(?<action>pause|resume|close|reopen)$/,
    auth: 'queue-manager',
    handler: async (ctx, p) => ok(await setQueueState(p.queueId, p.action)),
  },
];
