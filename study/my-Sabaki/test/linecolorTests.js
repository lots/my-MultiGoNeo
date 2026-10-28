import assert from 'assert'

import {
  LINE_COLORS,
  normalizeLineColor,
  parseLineValue,
  formatLineValue,
} from '../src/modules/linecolor.js'

// The edit "Line"/"Arrow" tools store a colour as an optional third field on the
// otherwise standard SGF point pair, e.g. `AR[dd:pq:red]`. These helpers are the
// single place that encoding is defined, so both the SGF reader (gametree.js)
// and the writer (sabaki.js) stay in sync.
describe('linecolor', () => {
  it('exposes exactly the six supported colours', () => {
    assert.deepStrictEqual(LINE_COLORS, [
      'black',
      'white',
      'red',
      'yellow',
      'blue',
      'green',
    ])
  })

  it('normalizes known colours and rejects everything else', () => {
    for (let color of LINE_COLORS) {
      assert.strictEqual(normalizeLineColor(color), color)
    }

    assert.strictEqual(normalizeLineColor(' Red '), 'red')
    assert.strictEqual(normalizeLineColor('purple'), null)
    assert.strictEqual(normalizeLineColor(''), null)
    assert.strictEqual(normalizeLineColor(undefined), null)
    assert.strictEqual(normalizeLineColor(null), null)
    assert.strictEqual(normalizeLineColor(42), null)
  })

  it('parses plain and coloured point pairs', () => {
    assert.deepStrictEqual(parseLineValue('dd:pq'), {
      points: ['dd', 'pq'],
      color: null,
    })

    assert.deepStrictEqual(parseLineValue('dd:pq:blue'), {
      points: ['dd', 'pq'],
      color: 'blue',
    })
  })

  it('treats an unknown third field as no colour', () => {
    assert.deepStrictEqual(parseLineValue('dd:pq:chartreuse'), {
      points: ['dd', 'pq'],
      color: null,
    })
  })

  it('only appends the colour when there is one', () => {
    assert.strictEqual(formatLineValue('dd', 'pq'), 'dd:pq')
    assert.strictEqual(formatLineValue('dd', 'pq', null), 'dd:pq')
    assert.strictEqual(formatLineValue('dd', 'pq', 'green'), 'dd:pq:green')
  })

  it('round-trips every colour', () => {
    for (let color of LINE_COLORS) {
      assert.strictEqual(
        parseLineValue(formatLineValue('aa', 'bb', color)).color,
        color,
      )
    }
  })
})
