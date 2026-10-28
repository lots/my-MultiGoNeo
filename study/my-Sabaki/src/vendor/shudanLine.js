// Patched copy of @sabaki/shudan's Line component (src/Line.js).
//
// Shudan hardcodes the stroke through `.shudan-line` / `.shudan-arrow` and does
// not forward any extra prop to the rendered <path>, so per-line colors cannot
// be expressed from the outside. We swap this file in for Shudan's original via
// webpack's NormalModuleReplacementPlugin (see webpack.config.js).
//
// The only behavioural additions:
//   * `type` may carry a color suffix, e.g. "line:red" / "arrow:yellow"
//   * that color becomes an extra class (`shudan-line-color-red`) instead of an
//     inline style, so themes can restyle it
// Everything else mirrors upstream Shudan 1.8.0 exactly, including the
// arrowhead geometry.
import {createElement as h} from 'preact'

const vertexEquals = (a, b) => a[0] === b[0] && a[1] === b[1]

export default function Line(props) {
  let {v1, v2, type = 'line', vertexSize} = props
  let [baseType, color] = String(type).split(':')

  if (vertexEquals(v1, v2)) return

  let [pos1, pos2] = [v1, v2].map((v) => v.map((x) => x * vertexSize))
  let [dx, dy] = pos1.map((x, i) => pos2[i] - x)
  let [left, top] = pos1.map((x, i) => (x + pos2[i] + vertexSize) / 2)

  let angle = (Math.atan2(dy, dx) * 180) / Math.PI
  let length = Math.sqrt(dx * dx + dy * dy)
  let right = left + length

  let className = `shudan-${baseType}`
  if (color) className += ` shudan-line-color-${color}`

  return h('path', {
    className,
    d: `M ${left} ${top} h ${length} ${
      baseType === 'arrow'
        ? (() => {
            let [x1, y1] = [right - vertexSize / 2, top - vertexSize / 4]
            let [x2, y2] = [right - vertexSize / 2, top + vertexSize / 4]

            return `L ${x1} ${y1} M ${right} ${top} L ${x2} ${y2}`
          })()
        : ''
    }`,
    transform: `rotate(${angle} ${left} ${top}) translate(${-length / 2} 0)`,
  })
}
