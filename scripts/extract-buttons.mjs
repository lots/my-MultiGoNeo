#!/usr/bin/env node
// Extracts the current UI buttons into button/<area>/<group>/<button>/.
// Each leaf keeps the exact button HTML, its icon (when one is used), and
// metadata for future editing. Re-run after changing src/index.html:
//   node scripts/extract-buttons.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'src', 'index.html')
const html = fs.readFileSync(sourcePath, 'utf8')
const outDir = path.join(root, 'button')

const GROUPS = {
  'file': 'File actions',
  'history': 'History and modes',
  'navigation': 'Game-tree navigation',
  'game': 'Game actions',
  'display': 'Board display',
  'view': 'Board and window view',
  'stones': 'Stone tools',
  'marks': 'Markup tools',
  'colors': 'Line colours',
  'turn': 'Player to move',
  'tabs': 'Sidebar tabs',
  'messages': 'Messages',
  'menu': 'Menu headers'
}

const SPEC = [
  // Main toolbar.
  ['main-toolbar', 'file', 'new-game', 'action', 'new-game', 'New game', 'Start a new game.'],
  ['main-toolbar', 'file', 'open-sgf', 'action', 'open-sgf', 'Open SGF', 'Open an SGF file.'],
  ['main-toolbar', 'file', 'save-sgf', 'action', 'save-sgf', 'Save SGF', 'Save the current game.'],
  ['main-toolbar', 'history', 'undo', 'action', 'undo', 'Undo', 'Revert the last edit.'],
  ['main-toolbar', 'history', 'redo', 'action', 'redo', 'Redo', 'Reapply the last undone edit.'],
  ['main-toolbar', 'history', 'edit-mode', 'action', 'toggle-edit', 'Edit mode', 'Toggle stone and markup editing.'],
  ['main-toolbar', 'navigation', 'root', 'action', 'first', 'Root node', 'Jump to the root node.'],
  ['main-toolbar', 'navigation', 'fast-rewind', 'action', 'fast-prev', 'Fast rewind', 'Jump back quickly.'],
  ['main-toolbar', 'navigation', 'previous', 'action', 'prev', 'Parent node', 'Go to the parent node.'],
  ['main-toolbar', 'navigation', 'next', 'action', 'next', 'First child', 'Go to the first child node.'],
  ['main-toolbar', 'navigation', 'fast-forward', 'action', 'fast-next', 'Fast forward', 'Jump forward quickly.'],
  ['main-toolbar', 'navigation', 'end', 'action', 'last', 'End of variation', 'Jump to the end of the variation.'],
  ['main-toolbar', 'game', 'auto-play', 'action', 'toggle-autoplay', 'Auto play', 'Automatically replay moves.'],
  ['main-toolbar', 'game', 'pass', 'action', 'pass', 'Pass', 'Play a pass move.'],
  ['main-toolbar', 'game', 'delete-move', 'action', 'delete-node', 'Delete move', 'Delete the current move/node.'],
  ['main-toolbar', 'game', 'estimate', 'action', 'estimate', 'Estimate', 'Estimate territory and score.'],
  ['main-toolbar', 'game', 'score', 'action', 'score', 'Score', 'Toggle scoring mode.'],
  ['main-toolbar', 'display', 'coords', 'action', 'toggle-coords', 'Coords', 'Show or hide board coordinates.'],
  ['main-toolbar', 'display', 'move-numbers', 'action', 'toggle-numbers', 'Nums', 'Show or hide move numbers.'],
  ['main-toolbar', 'view', 'zoom-out', 'action', 'zoom-out', 'Zoom out', 'Make the board smaller.'],
  ['main-toolbar', 'view', 'zoom-in', 'action', 'zoom-in', 'Zoom in', 'Make the board larger.'],
  ['main-toolbar', 'view', 'rotate-cw', 'action', 'rotate-cw', 'Rotate clockwise', 'Rotate the board clockwise.'],
  ['main-toolbar', 'view', 'flip-h', 'action', 'flip-h', 'Flip horizontally', 'Mirror the board horizontally.'],
  ['main-toolbar', 'view', 'flip-v', 'action', 'flip-v', 'Flip vertically', 'Mirror the board vertically.'],
  ['main-toolbar', 'view', 'reset-board', 'action', 'reset-board', 'Reset board', 'Clear board rotation and flips.'],
  ['main-toolbar', 'view', 'fullscreen', 'action', 'toggle-fullscreen', 'Toggle full screen', 'Toggle full-screen mode.'],
  ['main-toolbar', 'view', 'toggle-layout', 'action', 'toggle-hor-ver', 'Hor./Ver.', 'Toggle the workspace between horizontal and vertical layout.'],

  // Edit toolbar.
  ['edit-toolbar', 'stones', 'black-stone', 'tool', 'stone_1', 'Black stone', 'Place a black stone.'],
  ['edit-toolbar', 'stones', 'white-stone', 'tool', 'stone_-1', 'White stone', 'Place a white stone.'],
  ['edit-toolbar', 'stones', 'erase-stone', 'tool', 'erase', 'Erase stone', 'Erase a stone.'],
  ['edit-toolbar', 'marks', 'cross', 'tool', 'cross', 'Cross', 'Draw a cross mark.'],
  ['edit-toolbar', 'marks', 'triangle', 'tool', 'triangle', 'Triangle', 'Draw a triangle mark.'],
  ['edit-toolbar', 'marks', 'square', 'tool', 'square', 'Square', 'Draw a square mark.'],
  ['edit-toolbar', 'marks', 'circle', 'tool', 'circle', 'Circle', 'Draw a circle mark.'],
  ['edit-toolbar', 'marks', 'line', 'tool', 'line', 'Line', 'Draw a line.'],
  ['edit-toolbar', 'marks', 'arrow', 'tool', 'arrow', 'Arrow', 'Draw an arrow.'],
  ['edit-toolbar', 'marks', 'dim', 'tool', 'dim', 'Dim area', 'Dim an area of the board.'],
  ['edit-toolbar', 'marks', 'label', 'tool', 'label', 'Label', 'Place a text label.'],
  ['edit-toolbar', 'marks', 'number', 'tool', 'number', 'Number', 'Place a number.'],
  ['edit-toolbar', 'colors', 'theme', 'class', 'color-default', 'Theme colour', 'Use the theme line colour.'],
  ['edit-toolbar', 'colors', 'black', 'class', 'color-black', 'Black', 'Use a black line.'],
  ['edit-toolbar', 'colors', 'white', 'class', 'color-white', 'White', 'Use a white line.'],
  ['edit-toolbar', 'colors', 'red', 'class', 'color-red', 'Red', 'Use a red line.'],
  ['edit-toolbar', 'colors', 'yellow', 'class', 'color-yellow', 'Yellow', 'Use a yellow line.'],
  ['edit-toolbar', 'colors', 'blue', 'class', 'color-blue', 'Blue', 'Use a blue line.'],
  ['edit-toolbar', 'colors', 'green', 'class', 'color-green', 'Green', 'Use a green line.'],
  ['edit-toolbar', 'turn', 'turn', 'action', 'toggle-turn', 'Turn', 'Switch the player to move.'],

  // Sidebar and menu buttons.
  ['sidebar', 'tabs', 'info', 'id', 'tab-info', 'Info', 'Show game information.'],
  ['sidebar', 'tabs', 'comment', 'id', 'tab-comment', 'Comment', 'Show the node comment.'],
  ['sidebar', 'tabs', 'engine', 'id', 'tab-engine', 'Engine', 'Show engine analysis.'],
  ['sidebar', 'tabs', 'score', 'id', 'tab-score', 'Score', 'Show the score.'],
  ['sidebar', 'messages', 'clear', 'id', 'clear-message-button', 'Clear', 'Clear the message log.'],
  ['menu-bar', 'menu', 'file', 'id', 'menu-file', 'File', 'Open the File menu.'],
  ['menu-bar', 'menu', 'edit', 'id', 'menu-edit', 'Edit', 'Open the Edit menu.'],
  ['menu-bar', 'menu', 'advanced', 'id', 'menu-advanced', 'Advanced', 'Open the Advanced menu.'],
  ['menu-bar', 'menu', 'play', 'id', 'menu-play', 'Play', 'Open the Play menu.'],
  ['menu-bar', 'menu', 'engine', 'id', 'menu-engine', 'Engine', 'Open the Engine menu.'],
  ['menu-bar', 'menu', 'view', 'id', 'menu-view', 'View', 'Open the View menu.'],
  ['menu-bar', 'menu', 'tools', 'id', 'menu-tools', 'Tools', 'Open the Tools menu.'],
  ['menu-bar', 'menu', 'options', 'id', 'menu-options', 'Options', 'Open the Options menu.'],
  ['menu-bar', 'menu', 'help', 'id', 'menu-help', 'Help', 'Open the Help menu.']
]

const COLOR_VALUES = {
  'color-default': 'repeating-linear-gradient(135deg,#fff 0 3px,#bbb 3px 5px)',
  'color-black': '#111111',
  'color-white': '#ffffff',
  'color-red': '#d92b2b',
  'color-yellow': '#e6b800',
  'color-blue': '#2f6fed',
  'color-green': '#1a7f37'
}

function scopeHtml(area) {
  const markers = {
    'main-toolbar': ['id="main-toolbar"', '<div class="editbar"'],
    'edit-toolbar': ['id="editbar"', '<main class="workspace"'],
    'sidebar': ['id="right-column"', '</main>'],
    'menu-bar': ['<header class="menubar"', '</header>']
  }
  const [startMarker, endMarker] = markers[area]
  const start = html.indexOf(startMarker)
  const end = html.indexOf(endMarker, start)
  if (start < 0 || end < 0) throw new Error(`Missing scope for ${area}`)
  return html.slice(start, end)
}

function buttonHtml(area, attr, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const attributePattern = attr === 'class'
    ? `class="[^"]*\\b${escaped}\\b[^"]*"`
    : `${attr}="${escaped}"`
  const pattern = new RegExp(
    `<button\\b[^>]*\\b${attributePattern}[^>]*>[\\s\\S]*?<\\/button>`
  )
  const match = scopeHtml(area).match(pattern)
  if (!match) throw new Error(`Button not found in ${area}: ${attr}="${value}"`)
  return match[0].trim()
}

function attribute(source, name) {
  const match = source.match(new RegExp(`\\b${name}="([^"]*)"`))
  return match ? match[1] : null
}

function shortcutFromTitle(title) {
  if (!title) return null
  const match = title.match(/\(([^)]+)\)\s*$/)
  return match ? match[1] : null
}

function writeButton(spec) {
  const [area, group, slug, attr, value, label, purpose] = spec
  const selector = attr === 'class'
    ? `class~="${value}"`
    : attr === 'id'
      ? `#${value}`
      : `[data-${attr}="${value}"]`
  const source = buttonHtml(area, attr, value)
  const title = attribute(source, 'title')
  const ariaLabel = attribute(source, 'aria-label')
  const className = attribute(source, 'class')
  const action = attribute(source, 'data-action')
  const tool = attribute(source, 'data-tool')
  const iconMatch = source.match(/href="#i-([\w-]+)"/)
  const iconName = iconMatch ? iconMatch[1] : null
  const dir = path.join(outDir, area, group, slug)
  fs.mkdirSync(dir, { recursive: true })

  let icon = null
  if (iconName) {
    const iconSource = path.join(root, 'src', 'assets', 'icons', `${iconName}.svg`)
    if (!fs.existsSync(iconSource)) throw new Error(`Missing icon: ${iconSource}`)
    icon = 'icon.svg'
    fs.copyFileSync(iconSource, path.join(dir, icon))
  }

  const kind = className?.includes('color-swatch')
    ? 'swatch'
    : icon
      ? 'icon'
      : 'text'
  const metadata = {
    area,
    group,
    groupTitle: GROUPS[group] || group,
    slug,
    label,
    purpose,
    kind,
    selector,
    title,
    ariaLabel,
    className,
    action,
    tool,
    shortcut: shortcutFromTitle(title),
    icon,
    color: kind === 'swatch' && COLOR_VALUES[value] ? COLOR_VALUES[value] : null,
    source: `src/index.html ${selector}`
  }
  fs.writeFileSync(path.join(dir, 'button.json'), `${JSON.stringify(metadata, null, 2)}\n`)
  fs.writeFileSync(path.join(dir, 'button.html'), `${source}\n`)
  return { ...metadata, directory: path.relative(outDir, dir).replaceAll(path.sep, '/') }
}

// Hand-maintained source-only folders (marked with `.source-only`) survive
// regeneration; generated folders are rebuilt from src/index.html.
function collectSourceOnly(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (fs.existsSync(path.join(full, '.source-only'))) {
        collectFiles(full, files)
      } else {
        collectSourceOnly(full, files)
      }
    }
  }
}

function collectFiles(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectFiles(full, files)
    } else {
      files.set(path.relative(outDir, full).replaceAll(path.sep, '/'), fs.readFileSync(full))
    }
  }
}

const preserved = new Map()
if (fs.existsSync(outDir)) collectSourceOnly(outDir, preserved)
const sourceOnlyDirs = [...new Set([...preserved.keys()].map((file) => path.dirname(file)))]
  .filter((dir) => preserved.has(`${dir}/.source-only`))
  .sort()

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })
const buttons = SPEC.map(writeButton)
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify({
  generatedFrom: 'src/index.html',
  total: buttons.length,
  sourceOnly: sourceOnlyDirs,
  areas: [...new Set(buttons.map((button) => button.area))],
  groups: [...new Set(buttons.map((button) => `${button.area}/${button.group}`))],
  buttons
}, null, 2)}\n`)

const groups = [...new Set(buttons.map((button) => `${button.area}/${button.group}`))]
const lines = [
  '# MultiGo Neo button library',
  '',
  `Extracted from \`src/index.html\`. **${buttons.length} buttons** in ${groups.length} groups.`,
  '',
  'Each leaf folder contains:',
  '',
  '- `button.html` — the exact current button markup.',
  '- `button.json` — label, purpose, selector, action/tool, shortcut, styling class and icon reference.',
  '- `icon.svg` — present only when the button uses an SVG icon.',
  '',
  'Regenerate after UI changes:',
  '',
  '```powershell',
  'node scripts/extract-buttons.mjs',
  '```',
  '',
  'Production styling still comes from `src/styles.css` (`.tool`, `.editbar`, `.tabs .tab`,',
  '`.menu-trigger`, `.message-clear` and `.color-swatch`); this folder stores the button',
  'markup and icon sources, not a second copy of the stylesheet.',
  '',
  'Folders marked with `.source-only` are hand-maintained and are preserved when this script',
  'runs; every other folder is regenerated from `src/index.html`.',
  '',
  '## Hierarchy',
  ''
]
for (const group of groups) {
  const list = buttons.filter((button) => `${button.area}/${button.group}` === group)
  lines.push(`- **${group}** (${list.length}): ${list.map((button) => button.label).join(', ')}`)
}
if (sourceOnlyDirs.length > 0) {
  lines.push('', '## Source-only icons', '')
  for (const dir of sourceOnlyDirs) lines.push(`- \`${dir}\` — hand-maintained source artwork preserved across regeneration.`)
}
lines.push('', '## Index', '', '| Area | Group | Button | Kind | Action/tool | Icon |', '|---|---|---|---|---|---|')
for (const button of buttons) {
  lines.push(`| ${button.area} | ${button.group} | ${button.label} | ${button.kind} | ${button.action || button.tool || '—'} | ${button.icon || '—'} |`)
}
fs.writeFileSync(path.join(outDir, 'README.md'), `${lines.join('\n')}\n`)

for (const [file, data] of preserved) {
  const target = path.join(outDir, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, data)
}

console.log(`Wrote ${buttons.length} buttons in ${groups.length} groups to ${path.relative(root, outDir)}/`)
console.log(`Preserved ${sourceOnlyDirs.length} source-only folder(s).`)
