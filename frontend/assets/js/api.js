// API client: uniform fetch wrapper with auth token injection and typed
// error propagation. Errors surface as { status, code, message }.

import { auth } from './auth.js';

const config = window.LINELESS_CONFIG ?? {};

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(method, path, { body, headers = {}, retry = true } = {}) {
  const token = auth.getAccessToken();
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  // One silent token refresh + retry on expiry.
  if (res.status === 401 && retry && token) {
    const refreshed = await auth.refreshSession();
    if (refreshed) return request(method, path, { body, headers, retry: false });
  }

  if (res.status === 204) return null;
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    if (!res.ok) throw new ApiError(res.status, 'HTTP_ERROR', `Request failed (${res.status})`);
    return res.text();
  }
  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? 'HTTP_ERROR', data.message ?? 'Request failed', data.details);
  }
  return data;
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { body, ...opts }),
  patch: (path, body, opts) => request('PATCH', path, { body, ...opts }),
};
