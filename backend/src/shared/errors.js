// Consistent application error model.
// Every thrown error in the backend is an AppError subclass (or maps to one).

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details) this.details = details;
    this.expected = true; // safe to surface to clients
  }
}

export const badRequest = (msg, details) => new AppError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'Not permitted') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Not found') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (msg, code = 'CONFLICT') => new AppError(409, code, msg);
export const tooMany = (msg = 'Too many requests') => new AppError(429, 'RATE_LIMITED', msg);
export const internal = (msg = 'Internal error') => new AppError(500, 'INTERNAL', msg);

/** Maps AWS error names for conditional/transaction failures to stable codes. */
export function mapDynamoError(err) {
  const names = err?.name ? [err.name] : [];
  const cancelled = (err?.CancellationReasons || []).filter((r) => r && r.Code !== 'None');
  if (names.includes('TransactionCanceledException') || names.includes('TransactionInProgressException')) {
    if (cancelled.some((r) => r.Code === 'ConditionalCheckFailed')) {
      return conflict('The queue state changed, please retry', 'STALE_STATE');
    }
    return conflict('Operation could not complete, please retry', 'TRANSACTION_CONFLICT');
  }
  if (names.includes('ConditionalCheckFailedException')) {
    return conflict('The queue state changed, please retry', 'STALE_STATE');
  }
  if (names.includes('ProvisionedThroughputExceededException') || names.includes('ThrottlingException')) {
    return tooMany('System busy, please retry shortly');
  }
  return null;
}
