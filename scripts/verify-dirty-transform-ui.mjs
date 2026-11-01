import fs from 'node:fs/promises'
import path from 'node:path'

const port = process.argv[2] ?? '9348'
const outDir = process.argv[3] ?? 'preview'
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
async function clickAction(action) {
  await evaluate(`document.querySelector('.menu-item[data-action="${action}"]').click()`)
  await sleep(180)
}
async function shot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' })
  await fs.writeFile(path.join(outDir, name), Buffer.from(result.data, 'base64'))
}
async function waitForApp() {
  for (let i = 0; i < 100; i += 1) {
    if (await evaluate('Boolean(window.__figdesk)').catch(() => false)) return
    await sleep(100)
  }
  throw new Error('App did not boot')
}

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
await waitForApp()
await sleep(300)

async function transformCase(setupActions, screenshotName = null) {
  await evaluate(`__figdesk.applySgfText('(;GM[1]FF[4]SZ[5:9])', 'transform.sgf')`)
  await clickAction('reset-board')
  for (const action of setupActions) await clickAction(action)
  const before = await evaluate(`({
    rotation: __figdesk.settings().boardRotation,
    flipH: __figdesk.settings().boardFlipH,
    flipV: __figdesk.settings().boardFlipV,
    source: [__figdesk.boardView.sourceCols, __figdesk.boardView.sourceRows],
    view: [__figdesk.boardView.cols, __figdesk.boardView.rows],
    dirty: __figdesk.dirty,
    point: __figdesk.pointFor(0, 0),
  })`)
  if (screenshotName) await shot(screenshotName)
  await evaluate(`(() => {
    const canvas = document.getElementById('board');
    const rect = canvas.getBoundingClientRect();
    const point = {
      x: rect.left + __figdesk.boardView.originX,
      y: rect.top + __figdesk.boardView.originY,
    };
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, button: 0, clientX: point.x, clientY: point.y,
    }));
  })()`)
  await sleep(180)
  const after = await evaluate(`({ vertex: __figdesk.nodeData().B?.[0] ?? null, dirty: __figdesk.dirty })`)
  return { before, after }
}

const transforms = {
  identity: await transformCase([]),
  rotate90: await transformCase(['rotate-cw'], 'preview-board-rotate.png'),
  rotate180: await transformCase(['rotate-cw', 'rotate-cw']),
  flipH: await transformCase(['flip-h'], 'preview-board-flip.png'),
  flipV: await transformCase(['flip-v']),
}
await clickAction('rotate-cw')
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))`)
await sleep(180)
const resetShortcut = await evaluate(`({
  rotation: __figdesk.settings().boardRotation,
  flipH: __figdesk.settings().boardFlipH,
  flipV: __figdesk.settings().boardFlipV,
})`)

// R1: prominent dirty indicator and an unsaved-loss confirmation.
await evaluate(`__figdesk.applySgfText('(;GM[1]FF[4]SZ[13])', 'dirty.sgf')`)
await evaluate(`__figdesk.playAt(3, 3)`)
await sleep(200)
const dirtyState = await evaluate(`({
  dirty: __figdesk.dirty,
  statusHidden: document.getElementById('status-dirty').hidden,
  statusText: document.getElementById('status-dirty').textContent.trim(),
  fileClass: document.getElementById('file-label').classList.contains('is-dirty'),
  title: document.title,
})`)
await shot('preview-dirty.png')
await clickAction('new-game')
const prompt = await evaluate(`({
  open: document.getElementById('confirm-dialog').open,
  message: document.getElementById('confirm-message').textContent,
})`)
await evaluate(`document.getElementById('confirm-cancel').click()`)
await sleep(100)
const afterCancel = await evaluate(`({ nodes: __figdesk.snapshot().nodes, dirty: __figdesk.dirty })`)
await clickAction('open-sgf')
const openPrompt = await evaluate(`({
  open: document.getElementById('confirm-dialog').open,
  message: document.getElementById('confirm-message').textContent,
})`)
await evaluate(`document.getElementById('confirm-cancel').click()`)
await sleep(100)

// R3: browser fullscreen request is invoked by the menu command.
await evaluate(`(() => {
  window.__fullscreenRequests = 0;
  document.documentElement.requestFullscreen = async () => { window.__fullscreenRequests += 1; };
})()`)
await clickAction('toggle-fullscreen')
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', bubbles: true }))`)
await sleep(180)
const fullscreen = await evaluate(`({ requests: window.__fullscreenRequests })`)

console.log(JSON.stringify({ transforms, resetShortcut, dirtyState, prompt, afterCancel, openPrompt, fullscreen, errors }, null, 2))
await send('Browser.close')
ws.close()
