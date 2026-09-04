// Central HTTP router. Responsibilities:
// - match method + path
// - normalize body/query/params into a request context
// - enforce authentication centrally (handlers receive a trusted AuthContext;
//   role is always resolved server-side from DynamoDB membership)
// - map every thrown error through the uniform error model

import { publicRoutes } from './public.js';
import { staffRoutes } from './staff.js';
import { resolveContext, ROLES, authorizeQueueAccess } from '../shared/auth.js';
import { db } from '../shared/dynamo.js';
import { keys } from '../shared/keys.js';
import { notFound } from '../shared/errors.js';
import { errorResponse, parseJsonBody, corsPreflight, requestId } from '../shared/http.js';
import { setCorrelationId } from '../shared/logger.js';

const allRoutes = [...publicRoutes, ...staffRoutes];

/** Queue-scoped authorization: load the queue's owning org, resolve the
 * caller's role within it, then verify access. Runs before any handler. */
async function authorizeQueueRoute(event, queueId, minRole) {
  const meta = await db().get(keys.queueMeta(queueId));
  const ctx = await resolveContext(event, { orgId: meta?.orgId });
  authorizeQueueAccess(meta, ctx, minRole);
  return ctx;
}

async function buildAuth(event, spec, groups) {
  if (spec === 'self') return resolveContext(event, {});
  if (spec === 'queue') return authorizeQueueRoute(event, groups.queueId, ROLES.STAFF);
  if (spec === 'queue-manager') return authorizeQueueRoute(event, groups.queueId, ROLES.MANAGER);
  if (spec?.org === 'path') {
    return resolveContext(event, { orgId: groups.orgId, minRole: spec.minRole });
  }
  throw notFound('Route misconfigured');
}

export async function route(event, deps = {}) {
  const rid = requestId(event);
  setCorrelationId(rid);
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  const path = event.requestContext?.http?.path || event.path || '/';
  const origin = event.headers?.Origin || event.headers?.origin;

  if (method === 'OPTIONS') return corsPreflight(event);

  for (const r of allRoutes) {
    if (r.method !== method) continue;
    const match = r.pattern.exec(path);
    if (!match) continue;

    try {
      const ctx = {
        event,
        body: method === 'GET' || method === 'DELETE' ? {} : parseJsonBody(event),
        query: event.queryStringParameters || {},
        origin,
        requestId: rid,
        deps,
      };
      if (r.auth) {
        ctx.auth = await buildAuth(event, r.auth, match.groups ?? {});
      }
      return await r.handler(ctx, match.groups ?? {});
    } catch (err) {
      return errorResponse(err, origin);
    }
  }
  return errorResponse(notFound('Route not found'), origin);
}
