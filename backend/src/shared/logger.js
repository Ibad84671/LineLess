// Structured JSON logging with correlation IDs.
// Never log tokens, passwords, authorization headers, or customer PII.

let correlationId = null;

export function setCorrelationId(id) {
  correlationId = id;
}

export function log(level, message, fields = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(correlationId ? { correlationId } : {}),
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg, fields) => log('debug', msg, fields),
  info: (msg, fields) => log('info', msg, fields),
  warn: (msg, fields) => log('warn', msg, fields),
  error: (msg, fields) => log('error', msg, fields),
};
