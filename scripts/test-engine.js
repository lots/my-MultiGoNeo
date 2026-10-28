'use strict';

const assert = require('node:assert/strict');
const Go = require('../src/go-engine.js');

let count = 0;

function test(name, callback) {
  callback();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

function emptyBoard(size) {
  return Go.createBoard(size);
}

function setStones(board, size, stones) {
  for (const [x, y, color] of stones) {
    board[Go.pointIndex(size, x, y)] = color;
  }
  return board;
}

function hasStone(board, size, x, y, color) {
  return board[Go.pointIndex(size, x, y)] === color;
}

test('creates boards and rejects bad sizes', () => {
  assert.equal(Go.createBoard(13).length, 169);
  assert.throws(() => Go.createBoard(30), /between 2 and 25/);
});

test('13x13 star points match the screenshot layout', () => {
  const stars = Go.starPoints(13).map((point) => `${point.x},${point.y}`).sort();
  assert.deepEqual(stars, ['3,3', '3,9', '6,6', '9,3', '9,9']);
});

test('coordinates skip I and count from the bottom', () => {
  assert.equal(Go.coordinateLabel(0, 12, 13), 'A1');
  assert.equal(Go.coordinateLabel(8, 0, 13), 'J13');
  assert.equal(Go.coordinateLabel(12, 12, 13), 'N1');
  assert.equal(Go.coordinateLabel(18, 0, 19), 'T19');
});

test('captures a single stone', () => {
  const size = 5;
  const board = emptyBoard(size);
  setStones(board, size, [
    [2, 2, Go.WHITE],
    [1, 2, Go.BLACK],
    [2, 1, Go.BLACK],
    [3, 2, Go.BLACK],
  ]);

  const result = Go.tryMove(board, size, 2, 3, Go.BLACK, null);
  assert.equal(result.ok, true);
  assert.equal(result.captured.length, 1);
  assert.deepEqual(result.captured[0], { x: 2, y: 2, color: Go.WHITE });
  assert.equal(hasStone(result.board, size, 2, 2, Go.EMPTY), true);
  assert.deepEqual(result.ko, { x: 2, y: 2 });
});

test('captures a multi-stone group', () => {
  const size = 5;
  const board = emptyBoard(size);
  setStones(board, size, [
    [1, 1, Go.WHITE],
    [2, 1, Go.WHITE],
    [0, 1, Go.BLACK],
    [1, 0, Go.BLACK],
    [2, 0, Go.BLACK],
    [3, 1, Go.BLACK],
    [2, 2, Go.BLACK],
  ]);

  const result = Go.tryMove(board, size, 1, 2, Go.BLACK, null);
  assert.equal(result.ok, true);
  assert.equal(result.captured.length, 2);
  assert.equal(hasStone(result.board, size, 1, 1, Go.EMPTY), true);
  assert.equal(hasStone(result.board, size, 2, 1, Go.EMPTY), true);
});

test('forbids suicide', () => {
  const size = 5;
  const board = emptyBoard(size);
  setStones(board, size, [
    [2, 1, Go.BLACK],
    [1, 2, Go.BLACK],
    [3, 2, Go.BLACK],
    [2, 3, Go.BLACK],
  ]);

  const result = Go.tryMove(board, size, 2, 2, Go.WHITE, null);
  assert.equal(result.ok, false);
  assert.match(result.error, /Suicide/);
});

test('forbids playing on an occupied point or ko point', () => {
  const size = 5;
  const board = emptyBoard(size);
  setStones(board, size, [[2, 2, Go.BLACK]]);

  const occupied = Go.tryMove(board, size, 2, 2, Go.WHITE, null);
  assert.equal(occupied.ok, false);

  const ko = Go.tryMove(emptyBoard(size), size, 2, 2, Go.WHITE, { x: 2, y: 2 });
  assert.equal(ko.ok, false);
  assert.match(ko.error, /Ko/);
});

test('SGF parses a main line and ignores variations', () => {
  const parsed = Go.parseSgf('(;GM[1]FF[4]SZ[9]PB[Black]PW[White]C[root];B[dd];W[ee](;B[ff])(;B[gg]))');
  assert.equal(parsed.size, 9);
  assert.equal(parsed.info.black, 'Black');
  assert.equal(parsed.info.white, 'White');
  assert.equal(parsed.info.comment, 'root');
  assert.deepEqual(parsed.moves.map((move) => `${move.color === Go.BLACK ? 'B' : 'W'}${Go.coordinateLabel(move.x, move.y, 9)}`), ['BD6', 'WE5', 'BF4']);
  assert.match(parsed.warnings.join(' '), /variation/);
});

test('SGF parses setup stones and the player to move', () => {
  const parsed = Go.parseSgf('(;GM[1]FF[4]SZ[13]AB[dd][kd][gg][dj][kj]AW[cc]PL[W])');
  assert.equal(parsed.size, 13);
  assert.equal(parsed.rootTurn, Go.WHITE);
  assert.equal(hasStone(parsed.setupBoard, 13, 3, 3, Go.BLACK), true);
  assert.equal(hasStone(parsed.setupBoard, 13, 10, 9, Go.BLACK), true);
  assert.equal(hasStone(parsed.setupBoard, 13, 6, 6, Go.BLACK), true);
  assert.equal(hasStone(parsed.setupBoard, 13, 2, 2, Go.WHITE), true);
});

test('SGF round-trips setup, info, comments, and passes', () => {
  const size = 13;
  const setupBoard = emptyBoard(size);
  setStones(setupBoard, size, [
    [3, 3, Go.BLACK],
    [3, 9, Go.BLACK],
    [6, 6, Go.BLACK],
    [2, 2, Go.WHITE],
  ]);

  const game = {
    size,
    setupBoard,
    rootTurn: Go.WHITE,
    info: {
      black: 'Alice',
      blackRank: '3d',
      white: 'Bob',
      whiteRank: '2k',
      result: 'B+2.5',
      komi: '6.5',
      handicap: '0',
      rules: 'Japanese',
      date: '2026-10-26',
      event: 'Test',
      place: 'Kuala Lumpur',
      comment: 'Root comment with ] and \\',
    },
    moves: [
      { color: Go.WHITE, x: 9, y: 9, pass: false, comment: 'A move' },
      { color: Go.BLACK, pass: true, comment: '' },
    ],
  };

  const text = Go.writeSgf(game);
  const parsed = Go.parseSgf(text);

  assert.equal(parsed.size, 13);
  assert.equal(parsed.rootTurn, Go.WHITE);
  assert.equal(parsed.info.black, 'Alice');
  assert.equal(parsed.info.comment, 'Root comment with ] and \\');
  assert.equal(parsed.moves.length, 2);
  assert.equal(parsed.moves[0].comment, 'A move');
  assert.equal(parsed.moves[1].pass, true);
  assert.equal(hasStone(parsed.setupBoard, 13, 3, 3, Go.BLACK), true);
  assert.equal(hasStone(parsed.setupBoard, 13, 2, 2, Go.WHITE), true);
});

test('SGF survives escaped values and CRLF', () => {
  const parsed = Go.parseSgf('(;GM[1]SZ[9]PB[A\\]B]PW[C\\\\D]\r\n;B[aa])');
  assert.equal(parsed.info.black, 'A]B');
  assert.equal(parsed.info.white, 'C\\D');
  assert.equal(parsed.moves.length, 1);
});

test('SGF reports illegal moves without throwing', () => {
  const parsed = Go.parseSgf('(;GM[1]SZ[5]AB[bb];W[aa];B[aa])');
  assert.equal(parsed.moves.length, 1);
  assert.match(parsed.warnings.join(' '), /illegal/);
});

test('empty SGF and non-SGF input throw', () => {
  assert.throws(() => Go.parseSgf('hello'), /SGF/);
  assert.throws(() => Go.parseSgf('()'), /no nodes/);
});

console.log(`\n${count} engine tests passed.`);
