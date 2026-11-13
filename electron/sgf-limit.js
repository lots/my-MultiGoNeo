'use strict';

// The renderer owns the "largest SGF" preference and passes it with each
// request; the main process only enforces it. A missing or nonsensical value
// keeps the historical 5 MB ceiling, and the upper bound stops a buggy or
// hostile renderer from asking this process to read gigabytes into memory.
const DEFAULT_SGF_BYTES = 5_000_000;
const MAX_SGF_BYTES = 500_000_000;

function sgfByteLimit(payload) {
  const requested = Number(payload && payload.maxBytes);
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_SGF_BYTES;
  return Math.min(Math.round(requested), MAX_SGF_BYTES);
}

function megabytes(bytes) {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

module.exports = { DEFAULT_SGF_BYTES, MAX_SGF_BYTES, sgfByteLimit, megabytes };
