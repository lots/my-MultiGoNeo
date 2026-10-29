import fs from 'node:fs/promises'
import path from 'node:path'

const port = process.argv[2] ?? '9339'
const outDir = process.argv[3] ?? '.'
const url = process.argv[4] ?? `file:///${process.cwd().replaceAll('\\', '/')}/src/index.html?test=1`
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
async function clickAction(action) {
  await evaluate(`document.querySelector('.menu-item[data-action="${action}"]').click()`)
  await sleep(100)
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
await send('Page.navigate', { url })
for (let i = 0; i < 100; i += 1) {
  const ready = await evaluate(`Boolean(window.__figdesk)`).catch(() => false)
  if (ready) break
  await sleep(100)
}
await sleep(500)

const initial = await evaluate(`(() => ({
  menus: [...document.querySelectorAll('.menu-trigger')].map((x) => x.textContent.trim()),
  autoplayIcon: document.querySelector('#tool-autoplay use').getAttribute('href'),
  nextIcon: document.querySelector('#tool-next use').getAttribute('href'),
  statusBorder: getComputedStyle(document.querySelector('.statusbar')).borderTopWidth,
  cellsBorder: getComputedStyle(document.querySelector('.statuscells')).borderTopWidth,
  options: [...document.getElementById('board-size').options].map((x) => ({ value: x.value, text: x.textContent })),
  snapshot: __figdesk.snapshot(),
}))()`)

// Custom 5*9 through the board-size dropdown.
await evaluate(`(() => {
  const select = document.getElementById('board-size');
  select.value = 'custom';
  select.dispatchEvent(new Event('change', { bubbles: true }));
})()`)
await sleep(200)
const customPrompt = await evaluate(`({
  open: document.getElementById('custom-size-dialog').open,
  title: document.getElementById('custom-size-title').textContent,
  value: document.getElementById('custom-size-input').value,
  defaultValue: document.getElementById('custom-size-input').value,
})`)
await evaluate(`(() => {
  document.getElementById('custom-size-input').value = '5*9';
  document.getElementById('custom-size-apply').click();
})()`)
await sleep(250)
const confirmOpen = await evaluate(`({
  open: document.getElementById('confirm-dialog').open,
  message: document.getElementById('confirm-message').textContent,
})`)
await evaluate(`document.getElementById('confirm-ok').click()`)
await sleep(350)
const custom5x9 = await evaluate(`(() => {
  const r = document.getElementById('board').getBoundingClientRect();
  return {
    snapshot: __figdesk.snapshot(),
    boardView: { cols: __figdesk.boardView.cols, rows: __figdesk.boardView.rows },
    select: document.getElementById('board-size').value,
    customChecked: document.getElementById('view-board-size').value === 'custom',
    customLabel: document.querySelector('#view-board-size option[value="custom"]').textContent,
    canvas: { width: Math.round(r.width), height: Math.round(r.height) },
    status: document.getElementById('status-move').textContent,
  };
})()`)

// Add a couple of stones and enable the new View features.
await evaluate(`__figdesk.playAt(2, 4); __figdesk.playAt(1, 6)`)
await menuSelect('view-coords', '1-1')
await menuSelect('view-numbering', 'variation')
await clickAction('toggle-next-moves')
const viewSettings = await evaluate(`(() => ({
  settings: __figdesk.settings(),
  info: {
    client: document.getElementById('game-info').clientHeight,
    scroll: document.getElementById('game-info').scrollHeight,
  },
  canvasWidth: Math.round(document.getElementById('board').getBoundingClientRect().width),
}))()`)
await shot('preview-custom.png')

await evaluate(`document.getElementById('menu-view').click()`)
await sleep(150)
const viewMenu = await evaluate(`(() => {
  const popup = document.getElementById('popup-view');
  const rect = popup.getBoundingClientRect();
  return {
    expanded: document.getElementById('menu-view').getAttribute('aria-expanded'),
    hidden: popup.hidden,
    items: popup.querySelectorAll('.menu-item').length,
    top: Math.round(rect.top),
    bottom: Math.round(rect.bottom),
    viewport: window.innerHeight,
  };
})()`)
await shot('preview-view-menu.png')
await evaluate(`document.getElementById('menu-view').click()`)

// Zoom in, then reset.
await clickAction('zoom-in')
const zoomed = await evaluate(`({
  zoom: __figdesk.settings().zoom,
  canvasWidth: Math.round(document.getElementById('board').getBoundingClientRect().width),
  zoomedClass: document.getElementById('pane-board').classList.contains('is-zoomed'),
})`)
await clickAction('zoom-reset')

// Hide/show the game tree.
await clickAction('toggle-tree')
const treeHidden = await evaluate(`({
  showTree: __figdesk.settings().showTree,
  paneHidden: document.getElementById('pane-moves').hidden,
  splitterHidden: document.getElementById('splitter-h').hidden,
  infoHeight: Math.round(document.getElementById('pane-info').getBoundingClientRect().height),
})`)
await clickAction('toggle-tree')
const treeShown = await evaluate(`({
  showTree: __figdesk.settings().showTree,
  paneHidden: document.getElementById('pane-moves').hidden,
  splitterHidden: document.getElementById('splitter-h').hidden,
})`)

// 52x52 upper limit.
await evaluate(`__figdesk.startGame({ width: 52, height: 52 })`)
await sleep(350)
const maxBoard = await evaluate(`(() => ({
  snapshot: __figdesk.snapshot(),
  boardView: { cols: __figdesk.boardView.cols, rows: __figdesk.boardView.rows },
  canvas: (() => { const r = document.getElementById('board').getBoundingClientRect(); return { width: Math.round(r.width) }; })(),
}))()`)

// 2x52 minimum-side rectangular board.
await evaluate(`__figdesk.startGame({ width: 2, height: 52 })`)
await sleep(300)
const minBoard = await evaluate(`__figdesk.snapshot()`)

console.log(JSON.stringify({
  initial,
  customPrompt,
  confirmOpen,
  custom5x9,
  viewSettings,
  viewMenu,
  zoomed,
  treeHidden,
  treeShown,
  maxBoard,
  minBoard,
  errors,
}, null, 2))

await send('Browser.close')
ws.close()
