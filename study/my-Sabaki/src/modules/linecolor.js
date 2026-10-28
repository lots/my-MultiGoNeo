// Colours the "Line" and "Arrow" edit tools can paint with.
//
// Plain SGF has no notion of a coloured AR/LN: both are plain `point:point`
// pairs and every viewer picks the stroke colour itself. To stay readable by
// other software we keep that standard two-field value and append the colour as
// an optional third field, e.g. `dd:pq:red`. Sabaki understands both forms;
// software that doesn't just draws the arrow in its own default colour.

export const LINE_COLORS = ['black', 'white', 'red', 'yellow', 'blue', 'green']

// Anything that is not one of the six known colours means "use the theme's
// default line colour", which we represent as null in the board model.
export function normalizeLineColor(value) {
  if (typeof value !== 'string') return null

  let color = value.trim().toLowerCase()
  return LINE_COLORS.includes(color) ? color : null
}

// `dd:pq`      -> {points: ['dd', 'pq'], color: null}
// `dd:pq:red`  -> {points: ['dd', 'pq'], color: 'red'}
export function parseLineValue(value) {
  let parts = String(value).split(':')

  return {
    points: [parts[0], parts[1]],
    color: normalizeLineColor(parts[2]),
  }
}

export function formatLineValue(p1, p2, color) {
  let normalized = normalizeLineColor(color)

  return normalized == null ? `${p1}:${p2}` : `${p1}:${p2}:${normalized}`
}
