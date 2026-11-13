'use strict';

const assert = require('node:assert/strict');
const {
  DEFAULT_SGF_BYTES,
  MAX_SGF_BYTES,
  sgfByteLimit,
  megabytes,
} = require('../electron/sgf-limit.js');

let count = 0;
function test(name, callback) {
  callback();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

test('defaults to the historical 5 MB ceiling', () => {
  assert.equal(sgfByteLimit(undefined), DEFAULT_SGF_BYTES);
  assert.equal(sgfByteLimit(null), DEFAULT_SGF_BYTES);
  assert.equal(sgfByteLimit({}), DEFAULT_SGF_BYTES);
  assert.equal(DEFAULT_SGF_BYTES, 5_000_000);
});

test('honours an explicit ceiling from the renderer', () => {
  assert.equal(sgfByteLimit({ maxBytes: 1_000_000 }), 1_000_000);
  assert.equal(sgfByteLimit({ maxBytes: 20_000_000 }), 20_000_000);
  assert.equal(sgfByteLimit({ maxBytes: MAX_SGF_BYTES }), MAX_SGF_BYTES);
});

test('falls back on nonsensical values instead of lifting the gate', () => {
  const bad = [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 'abc', '', null, undefined, {}];
  for (const value of bad) {
    assert.equal(sgfByteLimit({ maxBytes: value }), DEFAULT_SGF_BYTES, `maxBytes=${String(value)}`);
  }
});

test('clamps above the upper bound', () => {
  assert.equal(sgfByteLimit({ maxBytes: MAX_SGF_BYTES * 10 }), MAX_SGF_BYTES);
  assert.equal(sgfByteLimit({ maxBytes: Number.MAX_SAFE_INTEGER }), MAX_SGF_BYTES);
});

test('rounds fractional byte counts', () => {
  assert.equal(sgfByteLimit({ maxBytes: 7_500_000.6 }), 7_500_001);
});

test('formats sizes for the error message', () => {
  assert.equal(megabytes(5_000_000), '5 MB');
  assert.equal(megabytes(12_400_000), '12 MB');
  assert.equal(megabytes(1_500_000), '2 MB');
});

console.log(`\n${count} SGF size-limit tests passed.`);
