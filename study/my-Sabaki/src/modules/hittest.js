// Hit-testing for board marks that one click cannot address unambiguously.
//
// A click gives us a vertex, not a segment: several lines may radiate from the
// same point. But Shudan also hands us the raw mouse event, so we know where
// inside the clicked cell the pointer was (a fraction of the cell, measured from
// its centre). That direction is enough to tell "the line going up-right" from
// "the one going down-left", which is what the erase gesture needs.

// Below this distance from the cell centre the direction is just click jitter.
const MIN_OFFSET = 0.12

// cos(72deg): reject picks that are not plausibly along the segment.
const MIN_ALIGNMENT = 0.3

const unit = (dx, dy) => {
  let length = Math.hypot(dx, dy)

  return length < 1e-6 ? null : {dx: dx / length, dy: dy / length}
}

const vertexEquals = (a, b) => a[0] === b[0] && a[1] === b[1]

// `segments` are {v1, v2, ...} in board coordinates; `offset` is {dx, dy} in
// cell fractions, +x right and +y down. Returns the index of the best candidate,
// or -1 when the click carries no usable direction.
export function pickSegmentAt(segments, vertex, offset = null) {
  if (segments.length === 0) return -1

  // A single candidate needs no disambiguation.
  if (segments.length === 1) return 0

  if (offset == null) return -1

  let direction = unit(offset.dx, offset.dy)

  if (direction == null) return -1
  if (Math.hypot(offset.dx, offset.dy) < MIN_OFFSET) return -1

  let best = -1
  let bestScore = -Infinity

  segments.forEach((segment, index) => {
    let other = vertexEquals(segment.v1, vertex) ? segment.v2 : segment.v1
    let axis = unit(other[0] - vertex[0], other[1] - vertex[1])

    if (axis == null) return

    let score = direction.dx * axis.dx + direction.dy * axis.dy

    if (score > bestScore) {
      bestScore = score
      best = index
    }
  })

  return bestScore >= MIN_ALIGNMENT ? best : -1
}
