import assert from 'assert'

import GameTree from '@sabaki/immutable-gametree'
import sgf from '@sabaki/sgf'

import {
  DIM_PAINT_DEFAULT,
  toDimRange,
  normalizeDimValue,
  parseDimColors,
  toDimEntries,
  findDimRangeAt,
  applyDimRectangle,
  dimPaintValue,
  dimPaintColorName,
} from '../src/modules/dim.js'
import {getBoard, clearBoardCache} from '../src/modules/gametree.js'

// SGF FF[4] "DD" dims board points and is an inherited property. DD itself stays
// a standard point list; a rectangle's colour lives in the private SBKDD
// companion ("colour:range"), which we ignore when it names a missing range.
const points = (entries) => entries.map((x) => x.vertex.join(',')).sort()
const colorOf = (entries, vertex) =>
  entries.find((x) => x.vertex.join(',') === vertex)?.color ?? null

const boardFor = (text, index = -1) => {
  clearBoardCache()

  let root = sgf.parse(text)[0]
  let tree = new GameTree({root})
  let node = [...tree.listNodesVertically(tree.root.id, 1, {})].at(index)

  return getBoard(tree, node.id)
}

describe('dim', () => {
  it('canonicalises ranges regardless of drag direction', () => {
    assert.strictEqual(toDimRange([2, 2], [0, 0]), 'aa:cc')
    assert.strictEqual(toDimRange([0, 0], [2, 2]), 'aa:cc')
    assert.strictEqual(normalizeDimValue('cc:aa'), 'aa:cc')
  })

  it('treats an empty value as "cleared"', () => {
    assert.strictEqual(normalizeDimValue(''), '')
    assert.strictEqual(normalizeDimValue(null), '')
  })

  it('expands ranges into unique points, carrying colours', () => {
    let entries = toDimEntries(['aa:bb', 'bb:cc'], {'bb:cc': 'red'})

    assert.strictEqual(entries.length, 7)
    assert.strictEqual(colorOf(entries, '1,1'), 'red')
    assert.strictEqual(colorOf(entries, '0,0'), null)
  })

  it('draws the newer rectangle over the older one where they overlap', () => {
    // 'aa:cc' then 'bb:dd': the shared points belong to the second range.
    let entries = toDimEntries(['aa:cc', 'bb:dd'], {
      'aa:cc': 'red',
      'bb:dd': 'blue',
    })

    assert.strictEqual(entries.length, 14) // 3x3 + 3x3, 4 points shared
    assert.strictEqual(colorOf(entries, '0,0'), 'red')
    assert.strictEqual(colorOf(entries, '1,1'), 'blue')
    assert.strictEqual(colorOf(entries, '2,2'), 'blue')
  })

  it('finds the newest range containing a point', () => {
    let ranges = ['aa:cc', 'bb:dd', 'pp:qq']

    assert.strictEqual(findDimRangeAt(ranges, [0, 0]), 0)
    // overlap of the first two: the newer one is on top, so it is the hit
    assert.strictEqual(findDimRangeAt(ranges, [2, 2]), 1)
    assert.strictEqual(findDimRangeAt(ranges, [15, 15]), 2)
    assert.strictEqual(findDimRangeAt(ranges, [9, 9]), -1)
  })

  it('handles single-point dim ranges when locating a hit', () => {
    assert.strictEqual(findDimRangeAt(['cc'], [2, 2]), 0)
    assert.strictEqual(findDimRangeAt(['cc'], [2, 3]), -1)
  })

  it('parses the colour companion, discarding junk', () => {
    assert.deepStrictEqual(parseDimColors(['red:aa:bb'], ['aa:bb']), {
      'aa:bb': 'red',
    })

    // unknown colour name
    assert.deepStrictEqual(parseDimColors(['chartreuse:aa:bb'], ['aa:bb']), {})
    // colour for a range DD no longer has
    assert.deepStrictEqual(parseDimColors(['red:cc:dd'], ['aa:bb']), {})
    // single point form
    assert.deepStrictEqual(parseDimColors(['blue:cc'], ['cc']), {cc: 'blue'})
  })

  it('maps colours to distinct paint values and back', () => {
    assert.strictEqual(dimPaintValue(null), DIM_PAINT_DEFAULT)
    assert.strictEqual(dimPaintValue('red'), 5)
    assert.strictEqual(dimPaintColorName(5), 'red')
    assert.strictEqual(dimPaintColorName(DIM_PAINT_DEFAULT), null)
    assert.strictEqual(dimPaintColorName(-1), null)
    assert.strictEqual(dimPaintColorName(99), null)

    for (let color of ['black', 'white', 'red', 'yellow', 'blue', 'green']) {
      assert.strictEqual(dimPaintColorName(dimPaintValue(color)), color)
    }
  })
})

describe('gametree.getBoard with DD', () => {
  it('dims the points of a rectangle', () => {
    let board = boardFor('(;GM[1]FF[4]SZ[19];B[dd]DD[aa:bb])')

    assert.deepStrictEqual(board.dimmedRanges, ['aa:bb'])
    assert.strictEqual(board.dimmed.length, 4)
    assert.deepStrictEqual(board.dimmedColors, {})
  })

  it('applies a colour from SBKDD', () => {
    let board = boardFor('(;GM[1]FF[4]SZ[19];B[dd]DD[aa:bb]SBKDD[red:aa:bb])')

    assert.deepStrictEqual(board.dimmedColors, {'aa:bb': 'red'})
    assert.strictEqual(colorOf(board.dimmed, '0,0'), 'red')
    assert.strictEqual(colorOf(board.dimmed, '1,1'), 'red')
  })

  it('keeps undrawn rectangles in the default colour', () => {
    let board = boardFor(
      '(;GM[1]FF[4]SZ[19];B[dd]DD[aa:bb][cc:dd]SBKDD[blue:aa:bb])',
    )

    assert.strictEqual(colorOf(board.dimmed, '0,0'), 'blue')
    assert.strictEqual(colorOf(board.dimmed, '2,2'), null)
  })

  it('inherits DD and its colours', () => {
    let board = boardFor(
      '(;GM[1]FF[4]SZ[19];DD[aa:bb]SBKDD[green:aa:bb];B[dd];W[pp])',
    )

    assert.deepStrictEqual(board.dimmedRanges, ['aa:bb'])
    assert.deepStrictEqual(board.dimmedColors, {'aa:bb': 'green'})
    assert.strictEqual(colorOf(board.dimmed, '0,0'), 'green')
  })

  it('lets a descendant replace both the ranges and the colours', () => {
    let board = boardFor(
      '(;GM[1]FF[4]SZ[19];DD[aa:bb]SBKDD[green:aa:bb];B[dd]DD[cc:dd])',
    )

    assert.deepStrictEqual(board.dimmedRanges, ['cc:dd'])
    assert.deepStrictEqual(board.dimmedColors, {})
    assert.strictEqual(colorOf(board.dimmed, '2,2'), null)
  })

  it('clears inherited dimming with DD[]', () => {
    let board = boardFor('(;GM[1]FF[4]SZ[19];DD[aa:bb];B[dd]DD[])')

    assert.deepStrictEqual(board.dimmedRanges, [])
    assert.deepStrictEqual(board.dimmed, [])
  })

  it('keeps later nodes clear once cleared', () => {
    let board = boardFor('(;GM[1]FF[4]SZ[19];DD[aa:bb];B[dd]DD[];W[pp])')

    assert.deepStrictEqual(board.dimmed, [])
  })

  it('starts undimmed without DD', () => {
    let board = boardFor('(;GM[1]FF[4]SZ[19];B[dd])')

    assert.deepStrictEqual(board.dimmedRanges, [])
    assert.deepStrictEqual(board.dimmed, [])
  })
})
