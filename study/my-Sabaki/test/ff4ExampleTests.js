import assert from 'assert'
import fs from 'fs'
import path from 'path'

import GameTree from '@sabaki/immutable-gametree'
import sgf from '@sabaki/sgf'

import {getBoard, clearBoardCache} from '../src/modules/gametree.js'

// Two fixtures, deliberately kept side by side in sgf/:
//
//   ff4_ex.sgf      the SGF FF[4] conformance example by Arno Hollosi, untouched
//   ff4_ex_new.sgf  the same file saved back through this fork, so it carries the
//                   AR/LN colour field and the DD/SBKDD pair the edit tools write
//
// Together they cover both directions: reading plain FF[4], and round-tripping
// our own extensions.
const fixture = (name) => path.join(__dirname, '..', 'sgf', name)

const load = (name) => {
  clearBoardCache()

  let trees = sgf
    .parse(fs.readFileSync(fixture(name), 'utf8'))
    .map((root) => new GameTree({root}))

  let nodes = []
  let walk = (node) => {
    nodes.push(node)
    for (let child of node.children || []) walk(child)
  }
  walk(trees[0].root)

  let boards = new Map(nodes.map((n) => [n.id, getBoard(trees[0], n.id)]))
  let ddNode = nodes.find((n) => n.data.DD != null)

  return {trees, nodes, boards, ddNode, board: boards.get(ddNode.id)}
}

const colourAt = (board, vertex) =>
  board.dimmed.find((d) => d.vertex.join(',') === vertex)?.color ?? null

describe('sgf FF[4] example', () => {
  describe('pristine ff4_ex.sgf', () => {
    it('parses as a two-tree collection', () => {
      let {trees, nodes} = load('ff4_ex.sgf')

      assert.strictEqual(trees.length, 2)
      assert.strictEqual(nodes.length, 54)
    })

    it('expands both DD rectangles to their 30 points', () => {
      let {ddNode, board} = load('ff4_ex.sgf')

      assert.deepStrictEqual(ddNode.data.DD, ['kq:os', 'dq:hs'])
      assert.deepStrictEqual(board.dimmedRanges, ['kq:os', 'dq:hs'])
      assert.strictEqual(board.dimmed.length, 30)
    })

    it('leaves every mark colourless', () => {
      let {board} = load('ff4_ex.sgf')

      assert.deepStrictEqual(board.dimmedColors, {})
      assert.strictEqual(board.dimmed.filter((d) => d.color != null).length, 0)
      assert.strictEqual(board.lines.filter((l) => l.color != null).length, 0)
    })

    it('reads the multi-line AR and LN lists', () => {
      let {board} = load('ff4_ex.sgf')

      assert.strictEqual(
        board.lines.filter((l) => l.type === 'arrow').length,
        8,
      )
      assert.strictEqual(board.lines.filter((l) => l.type === 'line').length, 4)
    })

    it('gives every mark in-bounds coordinates', () => {
      let {board} = load('ff4_ex.sgf')

      for (let {v1, v2} of board.lines) {
        for (let v of [v1, v2]) {
          assert.ok(Number.isFinite(v[0]) && Number.isFinite(v[1]), `bad ${v}`)
          assert.ok(
            v[0] >= 0 && v[0] < 19 && v[1] >= 0 && v[1] < 19,
            `oob ${v}`,
          )
        }
      }
    })
  })

  describe('ff4_ex_new.sgf (saved by my-Sabaki)', () => {
    it('records the writing application', () => {
      let {trees} = load('ff4_ex_new.sgf')

      assert.match(trees[0].root.data.AP[0], /^my-Sabaki:/)
      assert.deepStrictEqual(trees[0].root.data.CA, ['UTF-8'])
    })

    it('keeps DD a standard point list and tints it via SBKDD', () => {
      let {ddNode, board} = load('ff4_ex_new.sgf')

      assert.deepStrictEqual(board.dimmedRanges, [
        'kq:os',
        'dq:hs',
        'ad:cj',
        'qd:sj',
      ])
      for (let value of ddNode.data.DD)
        assert.match(value, /^[a-z]{2}:[a-z]{2}$/)

      assert.deepStrictEqual(board.dimmedColors, {
        'ad:cj': 'blue',
        'qd:sj': 'red',
      })
    })

    it('expands all four rectangles to 72 points', () => {
      let {board} = load('ff4_ex_new.sgf')

      assert.strictEqual(board.dimmed.length, 72)
    })

    it('resolves a colour per rectangle', () => {
      let {board} = load('ff4_ex_new.sgf')

      assert.strictEqual(colourAt(board, '0,3'), 'blue') // inside ad:cj
      assert.strictEqual(colourAt(board, '16,3'), 'red') // inside qd:sj
      assert.strictEqual(colourAt(board, '3,16'), null) // kq:os, uncoloured
    })

    it('round-trips two coloured arrows on top of the original eight', () => {
      let {board} = load('ff4_ex_new.sgf')
      let arrows = board.lines.filter((l) => l.type === 'arrow')

      assert.strictEqual(arrows.length, 10)
      assert.deepStrictEqual(
        arrows
          .filter((l) => l.color != null)
          .map((l) => l.color)
          .sort(),
        ['blue', 'red'],
      )
    })

    it('round-trips six coloured lines on top of the original four', () => {
      let {board} = load('ff4_ex_new.sgf')
      let lines = board.lines.filter((l) => l.type === 'line')

      assert.strictEqual(lines.length, 10)
      assert.strictEqual(lines.filter((l) => l.color === 'blue').length, 3)
      assert.strictEqual(lines.filter((l) => l.color === 'red').length, 3)
      assert.strictEqual(lines.filter((l) => l.color == null).length, 4)
    })

    it('does not leak dimming into the other game tree', () => {
      let {trees} = load('ff4_ex_new.sgf')
      let other = trees[1]

      let board = getBoard(other, other.root.id)
      assert.deepStrictEqual(board.dimmed, [])
      assert.deepStrictEqual(board.dimmedRanges, [])
    })
  })
})
