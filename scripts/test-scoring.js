'use strict';

const assert = require('node:assert/strict');
const scoring = require('../src/scoring.js');

let count = 0;
function test(name, callback) {
  callback();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

function board(rows, cols, stones = {}) {
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (const [id, sign] of Object.entries(stones)) {
    const [x, y] = id.split(',').map(Number);
    grid[y][x] = sign;
  }
  return grid;
}

// 5x5: a black wall in column 1 and a white wall in column 3.
// Column 0 is black territory, column 2 is dame, column 4 is white territory.
const walls = board(5, 5, {
  '1,0': 1, '1,1': 1, '1,2': 1, '1,3': 1, '1,4': 1,
  '3,0': -1, '3,1': -1, '3,2': -1, '3,3': -1, '3,4': -1,
});

test('splits territory and dame between two walls', () => {
  const japanese = scoring.compute({ signMap: walls, rules: 'japanese', komi: 0 });
  assert.equal(japanese.blackTerritory, 5);
  assert.equal(japanese.whiteTerritory, 5);
  assert.equal(japanese.dame, 5);
  assert.equal(japanese.blackScore, 5);
  assert.equal(japanese.whiteScore, 5);
  assert.equal(japanese.result, 'Jigo');

  const chinese = scoring.compute({ signMap: walls, rules: 'chinese', komi: 0 });
  assert.equal(chinese.blackScore, 10);
  assert.equal(chinese.whiteScore, 10);
  assert.equal(chinese.result, 'Jigo');
});

test('a live stone inside territory makes the region dame', () => {
  const withIntruder = board(5, 5, {
    '1,0': 1, '1,1': 1, '1,2': 1, '1,3': 1, '1,4': 1,
    '3,0': -1, '3,1': -1, '3,2': -1, '3,3': -1, '3,4': -1,
    '0,0': -1,
  });
  const result = scoring.compute({ signMap: withIntruder, rules: 'japanese', komi: 0 });
  assert.equal(result.blackTerritory, 0);
  assert.equal(result.whiteTerritory, 5);
  assert.equal(result.result, 'W+5');
});

test('marked dead stones are lifted, counted as prisoners and turn their points into territory', () => {
  const withIntruder = board(5, 5, {
    '1,0': 1, '1,1': 1, '1,2': 1, '1,3': 1, '1,4': 1,
    '3,0': -1, '3,1': -1, '3,2': -1, '3,3': -1, '3,4': -1,
    '0,0': -1,
  });
  const japanese = scoring.compute({
    signMap: withIntruder,
    dead: ['0,0'],
    rules: 'japanese',
    komi: 0,
  });
  assert.equal(japanese.blackTerritory, 5);
  assert.equal(japanese.blackPrisoners, 1);
  assert.equal(japanese.blackScore, 6);
  assert.equal(japanese.whiteScore, 5);
  assert.equal(japanese.result, 'B+1');
  assert.equal(japanese.ownership[0][0], scoring.BLACK);

  const chinese = scoring.compute({
    signMap: withIntruder,
    dead: ['0,0'],
    rules: 'chinese',
    komi: 0,
  });
  assert.equal(chinese.blackStones, 5);
  assert.equal(chinese.whiteStones, 5);
  assert.equal(chinese.blackScore, 10);
  assert.equal(chinese.whiteScore, 10);
  assert.equal(chinese.result, 'Jigo');
});

test('komi and game captures feed the Japanese total but not the Chinese one', () => {
  const withIntruder = board(5, 5, {
    '1,0': 1, '1,1': 1, '1,2': 1, '1,3': 1, '1,4': 1,
    '3,0': -1, '3,1': -1, '3,2': -1, '3,3': -1, '3,4': -1,
    '0,0': -1,
  });
  const japanese = scoring.compute({
    signMap: withIntruder,
    dead: ['0,0'],
    rules: 'japanese',
    komi: 6.5,
    capturesBlack: 2,
    capturesWhite: 1,
  });
  assert.equal(japanese.blackPrisoners, 3);
  assert.equal(japanese.whitePrisoners, 1);
  assert.equal(japanese.blackScore, 8);
  assert.equal(japanese.whiteScore, 12.5);
  assert.equal(japanese.result, 'W+4.5');

  const chinese = scoring.compute({
    signMap: withIntruder,
    dead: ['0,0'],
    rules: 'chinese',
    komi: 6.5,
    capturesBlack: 2,
    capturesWhite: 1,
  });
  assert.equal(chinese.blackScore, 10);
  assert.equal(chinese.whiteScore, 16.5);
  assert.equal(chinese.result, 'W+6.5');
});

test('an empty board is all dame', () => {
  const result = scoring.compute({
    signMap: board(3, 3),
    rules: 'japanese',
    komi: 0,
  });
  assert.equal(result.dame, 9);
  assert.equal(result.blackTerritory, 0);
  assert.equal(result.whiteTerritory, 0);
  assert.equal(result.result, 'Jigo');
});

test('groupAt returns the whole connected chain', () => {
  const points = scoring.groupAt(walls, 1, 2);
  assert.equal(points.length, 5);
  assert.deepEqual(points.map(([x, y]) => `${x},${y}`).sort(), [
    '1,0', '1,1', '1,2', '1,3', '1,4',
  ]);
  assert.deepEqual(scoring.groupAt(walls, 0, 0), []);
});

test('labels and rounding', () => {
  assert.equal(scoring.resultLabel(0), 'Jigo');
  assert.equal(scoring.resultLabel(1), 'B+1');
  assert.equal(scoring.resultLabel(-1.5), 'W+1.5');
  assert.equal(scoring.formatPoints(3), '3');
  assert.equal(scoring.formatPoints(3.25), '3.3');
});

test('out-of-range dead keys are ignored', () => {
  const result = scoring.compute({
    signMap: walls,
    dead: ['99,99', [-1, -1]],
    rules: 'japanese',
    komi: 0,
  });
  assert.equal(result.blackPrisoners, 0);
  assert.equal(result.result, 'Jigo');
});

test('estimateDead finds a lone stone sealed inside enemy territory', () => {
  const grid = board(5, 5);
  for (let i = 0; i < 5; i += 1) {
    grid[0][i] = 1;
    grid[4][i] = 1;
    grid[i][0] = 1;
    grid[i][4] = 1;
  }
  grid[2][2] = -1;
  assert.deepEqual(scoring.estimateDead(grid), ['2,2']);
});

test('estimateDead leaves a group with an eye alive', () => {
  const grid = board(5, 5);
  for (let i = 0; i < 5; i += 1) {
    grid[0][i] = 1;
    grid[4][i] = 1;
    grid[i][0] = 1;
    grid[i][4] = 1;
  }
  // White ring with a single eye at (2,2).
  for (let x = 1; x <= 3; x += 1) {
    for (let y = 1; y <= 3; y += 1) {
      if (x === 2 && y === 2) continue;
      grid[y][x] = -1;
    }
  }
  assert.deepEqual(scoring.estimateDead(grid), []);
});

test('estimateDead returns nothing on an empty board', () => {
  assert.deepEqual(scoring.estimateDead(board(5, 5)), []);
});

console.log(`\n${count} scoring tests passed.`);
