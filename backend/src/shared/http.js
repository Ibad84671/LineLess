// HTTP helpers: uniform responses, CORS allow-list, security headers,
// request parsing, and error mapping. Every Lambda HTTP response leaves
// through one of these functions.

import { env } from './env.js';
import { AppError, mapDynamoError, internal } from './errors.js';
import { logger } from './logger.js';

const SECURITY_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

function resolveCors(origin) {
  if (!origin) return null;
  if (env.allowedOrigins.includes(origin)) return origin;
  // Local development origins are only allowed when explicitly configured.
  return null;
}

export function response(statusCode, body, { origin, extraHeaders = {} } = {}) {
  const headers = { ...SECURITY_HEADERS, ...extraHeaders };
  const cors = resolveCors(origin);
  if (cors) {
    headers['Access-Control-Allow-Origin'] = cors;
    headers['Vary'] = 'Origin';
    headers['Access-Control-Allow-Credentials'] = 'false';
  }
  return {
    statusCode,
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  };
}

export function ok(body, opts) {
  return response(200, body, opts);
}

export function created(body, opts) {
  return response(201, body, opts);
}

export function errorResponse(err, origin) {
  if (err instanceof AppError) {
    return response(err.status, { error: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) }, { origin });
  }
  const mapped = mapDynamoError(err);
  if (mapped) return errorResponse(mapped, origin);
  logger.error('Unhandled error', { message: err?.message, stack: err?.stack, name: err?.name });
  const fallback = internal();
  return response(500, { error: fallback.code, message: fallback.message }, { origin });
}

export function parseJsonBody(event) {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const e = new AppError(400, 'BAD_REQUEST', 'Body must be a JSON object');
      throw e;
    }
    return parsed;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(400, 'BAD_REQUEST', 'Invalid JSON body');
  }
}

export function queryParams(event) {
  return event.queryStringParameters || {};
}

export function corsPreflight(event) {
  const origin = (event.headers || {}).Origin || (event.headers || {}).origin;
  const allowed = resolveCors(origin);
  if (!allowed) return { statusCode: 204, headers: {}, body: '' };
  return {
    statusCode: 204,
    headers: {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type,Idempotency-Key',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    },
    body: '',
  };
}

export function requestId(event) {
  return event.requestContext?.requestId || `local-${Date.now()}`;
}
