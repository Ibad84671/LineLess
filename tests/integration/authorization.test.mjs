import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/setup.mjs';
import { createWorld, ADMIN, STAFF_CTX, OUTSIDER } from '../helpers/world.mjs';
import { createOrganization, createBranch, createService, createQueue } from '../../backend/src/services/orgs.js';
import { hasAtLeast, ROLES } from '../../backend/src/shared/auth.js';
import { installMemStore } from '../helpers/setup.mjs';

let world;
beforeEach(async () => {
  world = await createWorld();
});

test('hasAtLeast respects the role hierarchy', () => {
  assert.equal(hasAtLeast(ROLES.PLATFORM_ADMIN, ROLES.CUSTOMER), true);
  assert.equal(hasAtLeast(ROLES.ORGANIZATION_ADMIN, ROLES.MANAGER), true);
  assert.equal(hasAtLeast(ROLES.MANAGER, ROLES.MANAGER), true);
  assert.equal(hasAtLeast(ROLES.MANAGER, ROLES.STAFF), true);
  assert.equal(hasAtLeast(ROLES.STAFF, ROLES.MANAGER), false);
  assert.equal(hasAtLeast(ROLES.CUSTOMER, ROLES.STAFF), false);
});

test('unknown role fails all hierarchy checks', () => {
  assert.equal(hasAtLeast('UNKNOWN_ROLE', ROLES.CUSTOMER), false);
  assert.equal(hasAtLeast(undefined, ROLES.CUSTOMER), false);
});

test('outsider cannot create branches', async () => {
  const { org } = world;
  await assert.rejects(
    () => createBranch(OUTSIDER, org.orgId, { name: 'Hack' }, { store: world.store }),
    (e) => e.code === 'FORBIDDEN' || e.status === 403,
  );
});

test('outsider cannot create queues', async () => {
  const { org } = world;
  await assert.rejects(
    () => createQueue(OUTSIDER, org.orgId, { name: 'Hack' }, { store: world.store }),
    (e) => e.code === 'FORBIDDEN' || e.status === 403,
  );
});

test('two organizations have independent queue partitions', async () => {
  const store = installMemStore();
  const user1 = { sub: 'user-1', email: 'u1@x.example' };
  const user2 = { sub: 'user-2', email: 'u2@x.example' };
  const org1 = await createOrganization(user1, { name: 'Org One' }, { store });
  const org2 = await createOrganization(user2, { name: 'Org Two' }, { store });
  const ctx1 = { ...ADMIN, orgId: org1.orgId, sub: user1.sub };
  const ctx2 = { ...ADMIN, orgId: org2.orgId, sub: user2.sub };
  const branch1 = await createBranch(ctx1, org1.orgId, { name: 'B1' }, { store });
  const svc1 = await createService(ctx1, org1.orgId, { name: 'S1' }, { store });
  const q1 = await createQueue(ctx1, org1.orgId, { name: 'Q1', branchId: branch1.branchId, serviceId: svc1.serviceId }, { store });
  const branch2 = await createBranch(ctx2, org2.orgId, { name: 'B2' }, { store });
  const svc2 = await createService(ctx2, org2.orgId, { name: 'S2' }, { store });
  const q2 = await createQueue(ctx2, org2.orgId, { name: 'Q2', branchId: branch2.branchId, serviceId: svc2.serviceId }, { store });
  const { joinQueue } = await import('../../backend/src/services/queue-engine.js');
  const r = await joinQueue({ queueId: q1.queueId, contact: { name: 'In Org1' } }, { store });
  assert.ok(r.token, 'join should succeed');
  const { getPublicQueue } = await import('../../backend/src/services/queue-reads.js');
  const pub2 = await getPublicQueue(q2.queueId, { store });
  assert.equal(pub2.waitingCount, 0, 'org2 queue should be unaffected');
});

test('queue lookup for nonexistent queue returns 404', async () => {
  const { getPublicQueue } = await import('../../backend/src/services/queue-reads.js');
  await assert.rejects(
    () => getPublicQueue('totally-fake-queue'),
    (e) => e.status === 404,
  );
});

test('empty organization name is rejected', async () => {
  const store = installMemStore();
  const user = { sub: 'u-empty', email: 'empty@x.example' };
  await assert.rejects(
    () => createOrganization(user, { name: '' }, { store }),
    (e) => e.code === 'BAD_REQUEST',
  );
});
