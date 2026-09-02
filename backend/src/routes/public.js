// Route table for the public API (customer + public display surface).
// Handlers receive a normalized context and return via http helpers.

import { ok, created, response } from '../shared/http.js';
import { badRequest } from '../shared/errors.js';
import { joinQueue, leaveQueue } from '../services/queue-engine.js';
import { getPublicQueue, getDisplayState, getCustomerSession } from '../services/queue-reads.js';
import { listPublicDirectory } from '../services/staff.js';

function requireToken(value) {
  if (!value || typeof value !== 'string' || value.length > 160) {
    throw badRequest('Missing or invalid session token');
  }
  return value;
}

export const publicRoutes = [
  {
    method: 'GET',
    pattern: /^\/health$/,
    handler: () => ok({ status: 'ok', service: 'lineless-api' }),
  },
  {
    method: 'GET',
    pattern: /^\/directory$/,
    handler: async () => ok({ organizations: await listPublicDirectory() }),
  },
  {
    method: 'GET',
    pattern: /^\/queues\/(?<queueId>[A-Za-z0-9_-]{1,64})\/public$/,
    handler: async (_ctx, p) => ok(await getPublicQueue(p.queueId)),
  },
  {
    method: 'GET',
    pattern: /^\/queues\/(?<queueId>[A-Za-z0-9_-]{1,64})\/display$/,
    handler: async (_ctx, p) => ok(await getDisplayState(p.queueId)),
  },
  {
    method: 'GET',
    pattern: /^\/queues\/(?<queueId>[A-Za-z0-9_-]{1,64})\/qr\.svg$/,
    handler: async (ctx, p) => {
      const QRCode = (await import('qrcode')).default;
      const joinUrl = `${ctx.deps.publicUrl ?? ''}/join/${p.queueId}`;
      const svg = await QRCode.toString(joinUrl, {
        type: 'svg',
        margin: 1,
        width: 512,
        color: { dark: '#0b0e14', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
      return response(200, svg, {
        origin: ctx.origin,
        extraHeaders: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
      });
    },
  },
  {
    method: 'POST',
    pattern: /^\/queues\/(?<queueId>[A-Za-z0-9_-]{1,64})\/join$/,
    handler: async (ctx, p) => {
      const idempotencyKey = ctx.event.headers?.['Idempotency-Key'] || ctx.event.headers?.['idempotency-key'] || ctx.body?.idempotencyKey;
      if (idempotencyKey && (typeof idempotencyKey !== 'string' || idempotencyKey.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey))) {
        throw badRequest('Invalid Idempotency-Key');
      }
      const result = await joinQueue({
        queueId: p.queueId,
        contact: {
          name: ctx.body?.name,
          email: ctx.body?.email,
          phone: ctx.body?.phone,
        },
        ...(idempotencyKey ? { idempotencyKey } : {}),
      });
      return created(result);
    },
  },
  {
    method: 'GET',
    pattern: /^\/session\/(?<token>[A-Za-z0-9_-]{20,160})$/,
    handler: async (_ctx, p) => ok(await getCustomerSession(p.token)),
  },
  {
    method: 'POST',
    pattern: /^\/session\/(?<token>[A-Za-z0-9_-]{20,160})\/leave$/,
    handler: async (_ctx, p) => ok(await leaveQueue({ token: requireToken(p.token) })),
  },
];
