import fs from 'node:fs/promises'
import path from 'node:path'

// Verifies the seven BesoGo-inspired ports: variation overlay, hover ghosts,
// deterministic textures, CSS themes, responsive layout, position paths and
// the data-attribute embed viewer.
const port = process.argv[2] ?? '9444'
const outDir = process.argv[3] ?? '.'
const appUrl = process.argv[4] ?? `file:///${process.cwd().replaceAll('\\', '/')}/src/index.html`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function findTarget() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
      if (page) return page
    } catch {}
    await sleep(150)
  }
  throw new Error('No DevTools target')
}

const page = await findTarget()
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})
let seq = 1
const pending = new Map()
const errors = []
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
    return
  }
  if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text)
})
function send(method, params = {}) {
  const id = seq++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}
async function shot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' })
  await fs.writeFile(path.join(outDir, name), Buffer.from(result.data, 'base64'))
}
async function waitFor(expression, label) {
  for (let i = 0; i < 120; i += 1) {
    if (await evaluate(expression).catch(() => false)) return
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${label}`)
}
async function load(url) {
  await send('Page.navigate', { url })
  await waitFor('Boolean(window.__figdesk || window.MultiGoEmbed?.instances?.length)', 'page scripts')
  await sleep(350)
}
async function action(name) {
  await evaluate(`document.querySelector('[data-action="${name}"]').click()`)
  await sleep(120)
}
async function menuSelect(id, value) {
  await evaluate(`(() => {
    const select = document.getElementById('${id}');
    select.value = '${value}';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`)
  await sleep(180)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false })

await load(`${appUrl}?test=1`)
await evaluate('localStorage.clear()')
await load(`${appUrl}?test=1`)

const initial = await evaluate(`(() => ({
  theme: __figdesk.settings().theme,
  themeClass: document.documentElement.classList.contains('theme-classic'),
  boardSurface: getComputedStyle(document.documentElement).getPropertyValue('--board-surface').trim(),
  portrait: document.getElementById('workspace').classList.contains('is-portrait'),
  errors: 0,
}))()`)

// 1+2: branch, variation badges, last-move plus, hover ghost.
await evaluate(`(() => {
  __figdesk.applySgfText('(;FF[4]GM[1]SZ[9];B[dd](;W[ee])(;W[cc]))', 'test case');
  __figdesk.selectNode(__figdesk.tree.root.children[0].id);
  return true;
})()`)
await shot('preview-last-move.png')
await action('toggle-next-moves')
const overlay = await evaluate(`__figdesk.overlay()`)
const hoverPoint = await evaluate(`__figdesk.pointFor(5, 5)`)
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hoverPoint.x, y: hoverPoint.y })
await sleep(180)
const hover = await evaluate(`__figdesk.hover()`)

// 2b: tool-specific hover ghost (triangle at an empty point in edit mode).
await evaluate(`__figdesk.selectTool('triangle')`)
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hoverPoint.x, y: hoverPoint.y })
await sleep(180)
const hoverTool = await evaluate(`({ mode: __figdesk.mode, tool: __figdesk.snapshot().selectedTool, hover: __figdesk.hover() })`)
await shot('preview-hover-tool.png')
await evaluate(`__figdesk.toggleEditMode()`)
await sleep(120)

// 2c: setup tool toggles a same-colour stone (BesoGo +/× semantics).
await evaluate(`(() => {
  __figdesk.startGame({ width: 9, height: 9 });
  __figdesk.selectTool('stone_1');
  __figdesk.playAt(2, 2);
})()`)
const setupPlaced = await evaluate(`__figdesk.nodeData()`)
await evaluate(`__figdesk.playAt(2, 2)`)
const setupRemoved = await evaluate(`__figdesk.nodeData()`)
await evaluate(`(() => {
  __figdesk.toggleEditMode();
  __figdesk.applySgfText('(;FF[4]GM[1]SZ[9];B[dd](;W[ee])(;W[cc]))', 'test case');
  __figdesk.selectNode(__figdesk.tree.root.children[0].id);
})()`)

// 4: theme swap through the Options dropdown.
await menuSelect('options-theme', 'dark')
const darkTheme = await evaluate(`(() => ({
  theme: __figdesk.settings().theme,
  classOnHtml: document.documentElement.classList.contains('theme-dark'),
  surface: getComputedStyle(document.documentElement).getPropertyValue('--board-surface').trim(),
  line: getComputedStyle(document.documentElement).getPropertyValue('--board-line').trim(),
  selectValue: document.getElementById('options-theme').value,
}))()`)
await shot('preview-theme-dark.png')
await menuSelect('options-theme', 'classic')

await evaluate(`document.getElementById('menu-view').click()`)
await sleep(160)
const viewMenu = await evaluate(`(() => {
  const popup = document.getElementById('popup-view');
  const rect = popup.getBoundingClientRect();
  return {
    items: popup.querySelectorAll('.menu-item').length,
    top: Math.round(rect.top),
    bottom: Math.round(rect.bottom),
    viewport: window.innerHeight,
    fits: rect.bottom <= window.innerHeight && rect.top >= 0,
  };
})()`)
await shot('preview-view-menu.png')
await evaluate(`document.getElementById('menu-view').click()`)

await evaluate(`document.getElementById('menu-options').click()`)
await sleep(150)
await shot('preview-options-menu.png')
await evaluate(`document.getElementById('menu-options').click()`)

// 5: responsive portrait layout.
await send('Emulation.setDeviceMetricsOverride', { width: 980, height: 900, deviceScaleFactor: 1, mobile: false })
await sleep(500)
const portrait = await evaluate(`(() => {
  const workspace = document.getElementById('workspace');
  const board = document.getElementById('pane-board');
  return {
    portrait: workspace.classList.contains('is-portrait'),
    boardHeight: Math.round(board.getBoundingClientRect().height),
    splitterHidden: document.getElementById('splitter-v').hidden,
    boardWidth: Math.round(document.getElementById('board').getBoundingClientRect().width),
  };
})()`)
await shot('preview-portrait.png')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false })
await sleep(450)
const restored = await evaluate(`(() => ({
  portrait: document.getElementById('workspace').classList.contains('is-portrait'),
  splitterHidden: document.getElementById('splitter-v').hidden,
}))()`)

// 6: position-path deeplink via ?sgf=...&path=...
const sgf = '(;FF[4]GM[1]SZ[9];B[dd](;W[ee])(;W[cc]))'
const link = `${appUrl}?test=1&sgf=${encodeURIComponent(sgf)}&path=${encodeURIComponent('B1B2')}`
await load(link)
const deeplink = await evaluate(`(() => ({
  node: __figdesk.nodeData(),
  moveNumber: __figdesk.snapshot().moveNumber,
  spec: __figdesk.positionLink().split('path=')[1],
}))()`)

// 7: zero-JS embed page.
await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 1700, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `file:///${process.cwd().replaceAll('\\', '/')}/src/embed.html` })
await waitFor('window.MultiGoEmbed?.instances?.length === 3', 'three embed widgets')
await sleep(500)
const embed = await evaluate(`(() => ({
  count: MultiGoEmbed.instances.length,
  snapshots: MultiGoEmbed.instances.map((widget) => widget.snapshot()),
  themes: [...document.querySelectorAll('[data-multigo]')].map((element) => element.className),
  canvases: [...document.querySelectorAll('[data-multigo] canvas')].map((canvas) => ({
    width: Math.round(canvas.getBoundingClientRect().width),
    height: Math.round(canvas.getBoundingClientRect().height),
  })),
  dataCoords: document.querySelectorAll('[data-multigo][data-coords]').length,
}))()`)
await shot('preview-embed.png')

console.log(JSON.stringify({
  initial,
  overlay,
  hover,
  hoverTool,
  setupPlaced,
  setupRemoved,
  darkTheme,
  viewMenu,
  portrait,
  restored,
  deeplink,
  embed,
  errors,
}, null, 2))

ws.close()
