// Ticket numbering: deterministic, collision-safe, human-friendly.
//
// The raw number comes from an atomic DynamoDB counter (ADD lastNumber 1),
// which cannot race. This module only handles presentation + config.
//
// Format: {prefix}-{number zero-padded to width}, e.g. A-001.
// Daily reset (optional per queue): counter key includes the UTC day, so
// numbering restarts at 1 each day. Ticket gaps are possible and normal
// (a failed join after counter increment leaves a gap) — uniqueness is
// never affected.

import { pad } from './keys.js';

export const DEFAULT_PREFIX = 'A';
export const DEFAULT_PAD_WIDTH = 3;
export const MAX_PAD_WIDTH = 6;
export const MAX_NUMBER = 999999;

export function normalizeNumberingConfig(config = {}) {
  const prefix = (config.prefix || DEFAULT_PREFIX).toString().trim().toUpperCase().slice(0, 3)
    .replace(/[^A-Z0-9]/g, '') || DEFAULT_PREFIX;
  let width = Number(config.padWidth ?? DEFAULT_PAD_WIDTH);
  if (!Number.isInteger(width) || width < 1) width = DEFAULT_PAD_WIDTH;
  if (width > MAX_PAD_WIDTH) width = MAX_PAD_WIDTH;
  return { prefix, padWidth: width, resetDaily: Boolean(config.resetDaily) };
}

export function formatTicket(number, config) {
  const cfg = normalizeNumberingConfig(config);
  if (!Number.isInteger(number) || number < 1 || number > MAX_NUMBER) {
    throw new Error(`Invalid ticket number: ${number}`);
  }
  return `${cfg.prefix}-${pad(number, cfg.padWidth)}`;
}

export function ticketSortKey(number, padWidth) {
  return `ENTRY#${pad(number, padWidth)}`;
}
