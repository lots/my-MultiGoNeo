// SGF FF[4] "DD" — dim (grey out) points.
//
// DD is an *inherited* property: it applies to the node that sets it and to all
// its descendants, until a descendant sets DD again. An empty value (DD[])
// clears it, i.e. nothing is dimmed any more.
//
// The value is an elist of points, and like every SGF point list it may use the
// compressed "corner:corner" form, which is exactly what the Dim tool produces
// when you drag out a rectangle: DD[dd:ff].
//
// DD itself carries no colour, and we keep it that way so other viewers still
// dim the right area. A rectangle drawn in one of the palette colours stores its
// colour in the private companion property SBKDD, as "colour:range" — e.g.
//
//     DD[dd:ff] SBKDD[red:dd:ff]
//
// The companion is ignored by other software and by us when it names a range
// that DD no longer has.

import {
  parseCompressedVertices,
  parseVertex,
  stringifyVertex,
} from '@sabaki/sgf'
import {LINE_COLORS, normalizeLineColor} from './linecolor.js'

// Numeric paint values handed to the board renderer: 1 is "no colour" (the
// theme's default dim), 2..7 are the LINE_COLORS palette.
export const DIM_PAINT_DEFAULT = 1

// Two board vertices -> canonical "p1:p2" range ("aa:cc", never "cc:aa").
export function toDimRange(v1, v2) {
  let [p1, p2] = [v1, v2].sort((a, b) => a[0] - b[0] || a[1] - b[1])

  return [p1, p2].map(stringifyVertex).join(':')
}

// Canonicalise a single DD value. `''` (from DD[]) normalises to `''` so
// callers can tell "cleared" apart from "not set".
export function normalizeDimValue(value) {
  if (value == null || value === '') return ''

  let [p1, p2] = String(value).split(':')

  if (p2 == null) return stringifyVertex(parseVertex(p1))

  return toDimRange(parseVertex(p1), parseVertex(p2))
}

// SBKDD values -> {range: colour}, discarding anything that no longer matches a
// DD range on the same node.
export function parseDimColors(values = [], ranges = []) {
  let known = new Set(ranges)
  let colors = {}

  for (let value of values) {
    let [color, ...rest] = String(value).split(':')
    let normalized = normalizeLineColor(color)
    let range = normalizeDimValue(rest.join(':'))

    if (normalized == null || !known.has(range)) continue

    colors[range] = normalized
  }

  return colors
}

const vertexEquals = (a, b) => a[0] === b[0] && a[1] === b[1]

// DD ranges -> [{vertex, color}], the shape the board renderer consumes.
// Later ranges are drawn over earlier ones, so when two rectangles overlap the
// newer rectangle's colour is the one that wins on the shared points.
export function toDimEntries(ranges, colors = {}) {
  let byVertex = new Map()

  for (let range of ranges) {
    if (!range) continue

    for (let vertex of parseCompressedVertices(range)) {
      byVertex.set(vertex.join(','), {
        vertex,
        color: colors[range] ?? null,
      })
    }
  }

  return [...byVertex.values()]
}

// Index of the newest range containing `vertex`, or -1. Used by the erase
// gesture: the rectangle you can see on top is the one that goes away.
export function findDimRangeAt(ranges, vertex) {
  for (let i = ranges.length - 1; i >= 0; i--) {
    if (
      parseCompressedVertices(ranges[i]).some((v) => vertexEquals(v, vertex))
    ) {
      return i
    }
  }

  return -1
}

// Applies one dragged rectangle to the set of ranges in effect:
//   * same rectangle, same colour  -> remove it
//   * same rectangle, other colour -> recolour it
//   * new rectangle                -> add it in the current colour
export function applyDimRectangle(ranges, colors, range, color) {
  let nextRanges = [...ranges]
  let nextColors = {...colors}
  let exists = nextRanges.includes(range)

  if (exists && (nextColors[range] ?? null) === color) {
    nextRanges = nextRanges.filter((x) => x !== range)
    delete nextColors[range]
  } else if (exists) {
    if (color == null) delete nextColors[range]
    else nextColors[range] = color
  } else {
    nextRanges.push(range)
    if (color != null) nextColors[range] = color
  }

  return {ranges: nextRanges, colors: nextColors}
}

export function dimPaintValue(color) {
  let index = LINE_COLORS.indexOf(normalizeLineColor(color))

  return index === -1 ? DIM_PAINT_DEFAULT : DIM_PAINT_DEFAULT + index + 1
}

export function dimPaintColorName(value) {
  if (typeof value !== 'number' || value <= DIM_PAINT_DEFAULT) return null

  return LINE_COLORS[value - DIM_PAINT_DEFAULT - 1] ?? null
}
