// Analytics computed on demand from queue entry data.
//
// Scaling note: for very high-volume tenants this would move to a
// pre-aggregated table fed by EventBridge; at LineLess's target scale
// (single-queue up to thousands of entries/day) on-demand aggregation is
// the simpler, cheaper choice.

import { db } from '../shared/dynamo.js';
import { keys } from '../shared/keys.js';
import { forbidden } from '../shared/errors.js';
import { ROLES, hasAtLeast } from '../shared/auth.js';
import { assertMembership } from './orgs.js';

export async function getOrganizationAnalytics(ctx, orgId, { store = db(), days = 7 } = {}) {
  const member = await assertMembership(ctx.sub, orgId, { store });
  if (!hasAtLeast(member.role, ROLES.MANAGER)) throw forbidden('Requires manager role');

  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const queues = await store.query({
    KeyConditionExpression: 'PK = :o AND begins_with(SK, :q)',
    ExpressionAttributeValues: { ':o': keys.orgMeta(orgId).PK, ':q': 'QUEUE#' },
  });

  const perQueue = [];
  const totals = { joined: 0, served: 0, skipped: 0, left: 0, noShowRate: 0, avgWaitMinutes: null, avgServiceMinutes: null };
  let waitSum = 0;
  let waitCount = 0;
  let serviceSum = 0;
  let serviceCount = 0;

  for (const q of queues.items) {
    let cursor;
    const agg = { queueId: q.queueId, name: q.name, joined: 0, served: 0, skipped: 0, left: 0, waitMs: 0, serviceMs: 0, waitN: 0, serviceN: 0 };
    do {
      const res = await store.query({
        KeyConditionExpression: 'PK = :p',
        FilterExpression: 'joinedAt >= :since',
        ExpressionAttributeValues: { ':p': `Q#${q.queueId}`, ':since': since },
        ExclusiveStartKey: cursor,
      });
      for (const e of res.items) {
        if (e.entityType !== 'QueueEntry') continue;
        agg.joined += 1;
        if (e.state === 'SERVED') {
          agg.served += 1;
          if (e.calledAt && e.joinedAt) {
            agg.waitMs += Math.max(0, Date.parse(e.calledAt) - Date.parse(e.joinedAt));
            agg.waitN += 1;
          }
          if (e.serviceMs != null) {
            agg.serviceMs += e.serviceMs;
            agg.serviceN += 1;
          }
        } else if (e.state === 'SKIPPED') agg.skipped += 1;
        else if (e.state === 'LEFT') agg.left += 1;
      }
      cursor = res.nextCursor;
    } while (cursor);

    perQueue.push({
      queueId: agg.queueId,
      name: agg.name,
      joined: agg.joined,
      served: agg.served,
      skipped: agg.skipped,
      left: agg.left,
      avgWaitMinutes: agg.waitN ? Math.round(agg.waitMs / agg.waitN / 60000) : null,
      avgServiceMinutes: agg.serviceN ? Math.round((agg.serviceMs / agg.serviceN / 60000) * 10) / 10 : null,
    });

    totals.joined += agg.joined;
    totals.served += agg.served;
    totals.skipped += agg.skipped;
    totals.left += agg.left;
    waitSum += agg.waitMs;
    waitCount += agg.waitN;
    serviceSum += agg.serviceMs;
    serviceCount += agg.serviceN;
  }

  totals.avgWaitMinutes = waitCount ? Math.round(waitSum / waitCount / 60000) : null;
  totals.avgServiceMinutes = serviceCount ? Math.round((serviceSum / serviceCount / 60000) * 10) / 10 : null;
  totals.noShowRate = totals.served + totals.skipped > 0
    ? Math.round((totals.skipped / (totals.served + totals.skipped)) * 100)
    : 0;

  return { orgId, periodDays: days, totals, perQueue };
}
