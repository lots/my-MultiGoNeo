// Extracts the board geometry of a saved SGF into JSON, for render.ps1.
//
// Run from the repository root (the npm script does that for you), through tsx:
//
//   npx tsx scripts/markup-demo/extract.mjs [input.sgf] [output.json]
//
// Defaults: sgf/ff4_ex_new.sgf -> scripts/markup-demo/.markup-demo.json
import fs from 'fs'
import path from 'path'

import GameTree from '@sabaki/immutable-gametree'
import sgf from '@sabaki/sgf'

import {getBoard, clearBoardCache} from '../../src/modules/gametree.js'

const root = process.cwd()
const input = path.resolve(root, process.argv[2] ?? 'sgf/ff4_ex_new.sgf')
const output = path.resolve(
  root,
  process.argv[3] ?? 'scripts/markup-demo/.markup-demo.json',
)

const parseVertex = (s) => [s.charCodeAt(0) - 97, s.charCodeAt(1) - 97]

clearBoardCache()

let trees = sgf
  .parse(fs.readFileSync(input, 'utf8'))
  .map((rootNode) => new GameTree({root: rootNode}))

// The demo node is the one carrying DD, whichever tree it lives in.
let nodes = []
let walk = (node) => {
  nodes.push(node)
  for (let child of node.children || []) walk(child)
}
walk(trees[0].root)

let ddNode = nodes.find((n) => n.data.DD != null)
if (ddNode == null) throw new Error(`no DD node in ${input}`)

let board = getBoard(trees[0], ddNode.id)

let stones = []
for (let y = 0; y < board.height; y++) {
  for (let x = 0; x < board.width; x++) {
    let sign = board.get([x, y])
    if (sign !== 0) stones.push([x, y, sign])
  }
}

let dims = board.dimmedRanges.map((range) => {
  let [v1, v2] = range.split(':').map(parseVertex)
  return {v1, v2, color: board.dimmedColors[range] ?? null}
})

let marks = board.lines.map((l) => ({
  type: l.type,
  v1: l.v1,
  v2: l.v2,
  color: l.color ?? null,
}))

fs.mkdirSync(path.dirname(output), {recursive: true})

// POSIX separators in the JSON: the figure prints this path, and the same figure
// should come out on any platform.
const relative = (p) => path.relative(root, p).split(path.sep).join('/')

fs.writeFileSync(
  output,
  JSON.stringify(
    {
      width: board.width,
      height: board.height,
      source: relative(input),
      stones,
      dims,
      marks,
    },
    null,
    1,
  ),
)

console.log(
  `${relative(input)}: ${stones.length} stones, ${dims.length} dim areas, ` +
    `${marks.filter((m) => m.type === 'arrow').length} arrows, ` +
    `${marks.filter((m) => m.type === 'line').length} lines -> ${relative(output)}`,
)
