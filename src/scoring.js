/* Territory and area scoring shared by the editor and the Node tests.
 *
 * The board is a `signMap` (row-major, [y][x], 1 = black, -1 = white, 0 = empty),
 * the same layout @sabaki/go-board produces. Scoring mirrors how MultiGo counts:
 * the player marks dead stones, dead stones are lifted off the board, and the
 * remaining empty regions are flood-filled. A region belongs to a colour when every
 * stone touching it has that colour; a region touching both colours (or none) is
 * dame.
 *
 *   Japanese: territory + prisoners (captures made plus dead stones) + komi
 *   Chinese:  stones on the board + territory + komi (captures are not counted)
 *
 * Seki and life-and-death are the player's judgement: whatever is not marked dead
 * is treated as alive, exactly like pressing "count" in MultiGo.
 */
(function (root) {
  'use strict'

  const EMPTY = 0
  const BLACK = 1
  const WHITE = -1
  const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]]

  const round1 = (value) => Math.round(value * 10) / 10
  const key = (x, y) => `${x},${y}`

  function normaliseDead(dead) {
    const set = new Set()
    if (!dead) return set
    if (dead instanceof Set) {
      for (const entry of dead) {
        if (Array.isArray(entry)) set.add(key(entry[0], entry[1]))
        else set.add(String(entry))
      }
      return set
    }
    if (Array.isArray(dead)) {
      for (const entry of dead) {
        if (Array.isArray(entry)) set.add(key(entry[0], entry[1]))
        else if (typeof entry === 'string') set.add(entry)
      }
    }
    return set
  }

  function groupAt(signMap, x, y) {
    const rows = Array.isArray(signMap) ? signMap.length : 0
    const cols = rows ? signMap[0].length : 0
    if (x < 0 || y < 0 || x >= cols || y >= rows) return []
    const sign = signMap[y]?.[x] ?? 0
    if (!sign) return []
    const seen = new Set([key(x, y)])
    const points = []
    const queue = [[x, y]]
    while (queue.length) {
      const [cx, cy] = queue.pop()
      points.push([cx, cy])
      for (const [dx, dy] of DIRECTIONS) {
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        if ((signMap[ny]?.[nx] ?? 0) !== sign) continue
        const id = key(nx, ny)
        if (seen.has(id)) continue
        seen.add(id)
        queue.push([nx, ny])
      }
    }
    return points
  }

  /**
   * @param {object} options
   * @param {number[][]} options.signMap board matrix, 1 black / -1 white / 0 empty
   * @param {Set<string>|Array} [options.dead] dead stones as "x,y" keys or [x,y] pairs
   * @param {'japanese'|'chinese'} [options.rules]
   * @param {number} [options.komi]
   * @param {number} [options.capturesBlack] stones captured by Black during the game
   * @param {number} [options.capturesWhite] stones captured by White during the game
   */
  function compute(options = {}) {
    const signMap = Array.isArray(options.signMap) ? options.signMap : []
    const rows = signMap.length
    const cols = rows ? signMap[0].length : 0
    const rules = options.rules === 'chinese' ? 'chinese' : 'japanese'
    const komi = Number.isFinite(Number(options.komi)) ? Number(options.komi) : 0
    const dead = normaliseDead(options.dead)

    const grid = signMap.map((row) => row.slice())
    let deadBlack = 0
    let deadWhite = 0
    for (const id of dead) {
      const [x, y] = id.split(',').map(Number)
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue
      const sign = grid[y][x]
      if (sign === BLACK) deadBlack += 1
      else if (sign === WHITE) deadWhite += 1
      else continue
      grid[y][x] = EMPTY
    }

    const ownership = Array.from({ length: rows }, () => new Array(cols).fill(0))
    const visited = Array.from({ length: rows }, () => new Array(cols).fill(false))
    let blackTerritory = 0
    let whiteTerritory = 0
    let dame = 0

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (grid[y][x] !== EMPTY || visited[y][x]) continue
        const points = []
        const border = new Set()
        const queue = [[x, y]]
        visited[y][x] = true
        while (queue.length) {
          const [cx, cy] = queue.pop()
          points.push([cx, cy])
          for (const [dx, dy] of DIRECTIONS) {
            const nx = cx + dx
            const ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
            const sign = grid[ny][nx]
            if (sign === EMPTY) {
              if (!visited[ny][nx]) {
                visited[ny][nx] = true
                queue.push([nx, ny])
              }
            } else {
              border.add(sign)
            }
          }
        }
        let owner = 0
        if (border.size === 1) owner = border.has(BLACK) ? BLACK : WHITE
        if (owner === BLACK) {
          blackTerritory += points.length
          for (const [px, py] of points) ownership[py][px] = BLACK
        } else if (owner === WHITE) {
          whiteTerritory += points.length
          for (const [px, py] of points) ownership[py][px] = WHITE
        } else {
          dame += points.length
        }
      }
    }

    let blackStones = 0
    let whiteStones = 0
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (grid[y][x] === BLACK) blackStones += 1
        else if (grid[y][x] === WHITE) whiteStones += 1
      }
    }

    const blackPrisoners = (Number(options.capturesBlack) || 0) + deadWhite
    const whitePrisoners = (Number(options.capturesWhite) || 0) + deadBlack

    const blackScore = round1(rules === 'chinese'
      ? blackStones + blackTerritory
      : blackTerritory + blackPrisoners)
    const whiteScore = round1((rules === 'chinese'
      ? whiteStones + whiteTerritory
      : whiteTerritory + whitePrisoners) + komi)
    const diff = round1(blackScore - whiteScore)

    return {
      rules,
      komi,
      dead: [...dead],
      ownership,
      blackTerritory,
      whiteTerritory,
      dame,
      blackStones,
      whiteStones,
      blackPrisoners,
      whitePrisoners,
      blackScore,
      whiteScore,
      diff,
      leader: diff > 0 ? BLACK : diff < 0 ? WHITE : 0,
      result: resultLabel(diff),
    }
  }

  function formatPoints(value) {
    const rounded = round1(Number(value) || 0)
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  }

  function resultLabel(diff) {
    const rounded = round1(Number(diff) || 0)
    if (rounded === 0) return 'Jigo'
    return rounded > 0 ? `B+${formatPoints(rounded)}` : `W+${formatPoints(-rounded)}`
  }

  const api = {
    EMPTY,
    BLACK,
    WHITE,
    compute,
    groupAt,
    normaliseDead,
    formatPoints,
    resultLabel,
  }
  root.MultiGoScoring = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
}(typeof globalThis !== 'undefined' ? globalThis : this));
