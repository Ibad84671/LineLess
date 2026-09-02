// Test world builder: full tenant + queue provisioned in the in-memory store.

import { installMemStore, resetEvents } from './setup.mjs';
import { createOrganization, createBranch, createService, createQueue } from '../../backend/src/services/orgs.js';

export const ADMIN = { sub: 'sub-admin-1', email: 'admin@test.example', role: 'ORGANIZATION_ADMIN', orgId: null };
export const STAFF_CTX = { sub: 'sub-staff-1', email: 'staff@test.example', role: 'STAFF', orgId: null };
export const OUTSIDER = { sub: 'sub-outsider', email: 'out@test.example', role: null, orgId: null };

export async function createWorld(store = installMemStore()) {
  resetEvents();
  const user = { sub: ADMIN.sub, email: ADMIN.email };
  const org = await createOrganization(user, { name: 'Test Clinic' }, { store });
  const ctx = { ...ADMIN, orgId: org.orgId };
  const branch = await createBranch(ctx, org.orgId, { name: 'Main' }, { store });
  const service = await createService(ctx, org.orgId, { name: 'Checkup', defaultServiceMinutes: 5 }, { store });
  const queue = await createQueue(ctx, org.orgId, {
    name: 'Walk-in',
    branchId: branch.branchId,
    serviceId: service.serviceId,
    prefix: 'A',
    padWidth: 3,
    staffCount: 1,
  }, { store });
  return { store, org, branch, service, queue, ctx };
}
