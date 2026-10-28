'use strict';

const assert = require('node:assert/strict');
const sgf = require('@sabaki/sgf');
const GameTree = require('@sabaki/immutable-gametree');
const Board = require('@sabaki/go-board');

let nextId = 1;
const getId = () => nextId++;
let count = 0;

function test(name, callback) {
  callback();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

test('parses variations and preserves unknown properties', () => {
  const text = '(;GM[1]FF[4]SZ[13]PB[Alice]ZZ[keep];B[dd](;W[mm]C[one])(;W[dm]))';
  const roots = sgf.parse(text, { getId });
  assert.equal(roots.length, 1);
  const tree = new GameTree({ root: roots[0], getId });
  assert.equal(tree.root.data.ZZ[0], 'keep');
  assert.equal(tree.root.children.length, 1);
  assert.equal(tree.root.children[0].children.length, 2);

  const out = sgf.stringify([tree.root], { linebreak: '\n', indent: '  ' });
  assert.match(out, /ZZ\[keep\]/);
  assert.match(out, /C\[one\]/);
  const again = sgf.parse(out, { getId });
  assert.equal(again[0].children[0].children.length, 2);
});

test('mutates the game tree without changing the old tree', () => {
  const root = { id: getId(), data: { GM: ['1'], SZ: ['13'] }, parentId: null, children: [] };
  let tree = new GameTree({ root, getId });
  let firstId = null;
  const next = tree.mutate((draft) => {
    firstId = draft.appendNode(tree.root.id, { B: ['dd'] });
  });
  assert.notEqual(next, tree);
  assert.equal(tree.root.children.length, 0);
  assert.equal(next.root.children.length, 1);
  const removed = next.mutate((draft) => draft.removeNode(firstId));
  assert.equal(removed.root.children.length, 0);
});

test('go-board captures stones and tracks captures', () => {
  const board = Board.fromDimensions(5);
  board.set([2, 2], -1);
  board.set([1, 2], 1);
  board.set([2, 1], 1);
  board.set([3, 2], 1);
  const moved = board.makeMove(1, [2, 3], { preventOverwrite: true, preventSuicide: true });
  assert.equal(moved.get([2, 2]), 0);
  assert.equal(moved.getCaptures(1), 1);
});

test('custom rectangular sizes and the 52-point alphabet round-trip', () => {
  const roots = sgf.parse('(;GM[1]FF[4]SZ[5:9]AB[aa][ee][ie])', { getId });
  assert.equal(roots[0].data.SZ[0], '5:9');
  assert.deepEqual(roots[0].data.AB, ['aa', 'ee', 'ie']);

  const large = sgf.parse('(;GM[1]FF[4]SZ[52]AB[AA][ZZ])', { getId });
  assert.equal(large[0].data.SZ[0], '52');
  assert.deepEqual(large[0].data.AB, ['AA', 'ZZ']);
  assert.match(sgf.stringify(large), /AB\[AA\]\[ZZ\]/);
});

test('markup and dim properties survive a stringify/parse round trip', () => {
  const text = '(;GM[1]FF[4]SZ[13]AB[dd]CR[mm]LB[cc:A]'
    + 'LN[aa:ae:red]AR[ha:he:blue]DD[kk:mm]SBKDD[blue:kk:mm]C[**bold** comment])';
  const roots = sgf.parse(text, { getId });
  const node = roots[0];
  assert.deepEqual(node.data.CR, ['mm']);
  assert.deepEqual(node.data.LB, ['cc:A']);
  assert.deepEqual(node.data.LN, ['aa:ae:red']);
  assert.deepEqual(node.data.AR, ['ha:he:blue']);
  assert.deepEqual(node.data.DD, ['kk:mm']);
  assert.deepEqual(node.data.SBKDD, ['blue:kk:mm']);
  assert.match(sgf.stringify(roots), /SBKDD\[blue:kk:mm\]/);
});

console.log(`\n${count} tree/SGF tests passed.`);
