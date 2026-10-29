'use strict';

const assert = require('node:assert/strict');
const pathSpec = require('../src/path-spec.js');

let count = 0;
function test(name, callback) {
  callback();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

// Minimal GameTree-shaped fixture: get(id), root, parentId, children.
function makeTree() {
  const root = { id: 1, parentId: null, children: [] };
  const b = { id: 2, parentId: 1, children: [] };
  const w = { id: 3, parentId: 2, children: [] };
  const wAlt = { id: 4, parentId: 2, children: [] };
  const deep = { id: 5, parentId: 3, children: [] };
  root.children = [b];
  b.children = [w, wAlt];
  w.children = [deep];
  const nodes = new Map([root, b, w, wAlt, deep].map((node) => [node.id, node]));
  return { root, get: (id) => nodes.get(id) };
}

test('parses next and branch tokens with separators', () => {
  assert.deepEqual(pathSpec.parse('20'), [{ mode: 'next', value: 20 }]);
  assert.deepEqual(pathSpec.parse('n5b1b1-1z1-1n10'), [
    { mode: 'next', value: 5 },
    { mode: 'branch', value: 1 },
    { mode: 'branch', value: 1 },
    { mode: 'branch', value: 1 },
    { mode: 'branch', value: 1 },
    { mode: 'branch', value: 1 },
    { mode: 'next', value: 10 },
  ]);
  assert.deepEqual(pathSpec.parse('b2,3,0,1'), [
    { mode: 'branch', value: 2 },
    { mode: 'branch', value: 3 },
    { mode: 'branch', value: 0 },
    { mode: 'branch', value: 1 },
  ]);
  assert.deepEqual(pathSpec.parse(''), []);
  assert.deepEqual(pathSpec.parse('xyz'), []);
});

test('resolves next mode along first children and clamps at a leaf', () => {
  const tree = makeTree();
  assert.equal(pathSpec.resolve('1', tree, tree.root.id), 2);
  assert.equal(pathSpec.resolve('2', tree, tree.root.id), 3);
  assert.equal(pathSpec.resolve('99', tree, tree.root.id), 5);
  assert.equal(pathSpec.resolve('3', tree, 2), 5);
});

test('resolves branch mode with 1-based and 0=last indexing', () => {
  const tree = makeTree();
  assert.equal(pathSpec.resolve('B1', tree, tree.root.id), 2);
  assert.equal(pathSpec.resolve('B1B2', tree, tree.root.id), 4);
  assert.equal(pathSpec.resolve('B1B0', tree, tree.root.id), 4);
  assert.equal(pathSpec.resolve('B1B1B1', tree, tree.root.id), 5);
  // Out-of-range branch index clamps to the last child.
  assert.equal(pathSpec.resolve('B1B9', tree, tree.root.id), 4);
});

test('build/resolve round-trips every node including variations', () => {
  const tree = makeTree();
  for (const node of tree.get(1).children) {
    for (const candidate of [node, ...node.children, ...node.children.flatMap((child) => child.children)]) {
      const spec = pathSpec.build(tree, candidate.id);
      assert.equal(pathSpec.resolve(spec, tree, tree.root.id), candidate.id, `${candidate.id} via ${spec}`);
    }
  }
  assert.equal(pathSpec.build(tree, tree.root.id), '');
});

test('ignores a missing tree and unknown ids', () => {
  assert.equal(pathSpec.resolve('20', null), null);
  assert.equal(pathSpec.build(null, 1), '');
  assert.equal(pathSpec.resolve('2', makeTree(), 999), 999);
});

console.log(`\n${count} path-spec tests passed.`);
