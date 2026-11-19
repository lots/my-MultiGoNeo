import fs from 'node:fs/promises'

// Verifies the clickable coordinate gutter:
//   - clicking a label toggles between normal and double label size,
//   - the margin grows for the larger labels and comes back,
//   - clicking an intersection still plays a move,
//   - the choice is persisted in localStorage.
//
//   node scripts/verify-coord-font-ui.mjs [port] [url]

const port = process.argv[2] ?? '9351'
const url = process.argv[3] ?? `file:///${process.cwd().replaceAll('\\', '/')}/src/index.html?test=1`

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
let page = targets.find((item) => item.type === 'page' && item.url.includes('index.html'))
if (!page) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
  const browser = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    browser.addEventListener('open', resolve, { once: true })
    browser.addEventListener('error', reject, { once: true })
  })
  await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const fresh = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  page = fresh.find((item) => item.type === 'page' && item.url.includes('index.html'))
  browser.close()
}
if (!page) throw new Error('No MultiGo Neo page on the debugging port')

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
    message.error ? reject(new Error(message.error.message)) : resolve(message.result)
    return
  }
  if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
  }
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = seq++
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

await send('Runtime.enable')
for (let attempt = 0; attempt < 40; attempt += 1) {
  if (await evaluate('Boolean(window.__figdesk)').catch(() => false)) break
  await sleep(200)
}

const result = await evaluate(`(async () => {
  if (!window.__figdesk) throw new Error('test API missing');
  const canvas = document.getElementById('board');
  const bv = __figdesk.boardView;
  const state = () => {
    const rect = canvas.getBoundingClientRect();
    return {
      large: __figdesk.settings().coordFontLarge,
      margin: Math.round(bv.margin * 10) / 10,
      labelOffset: Math.round(bv.labelOffset * 10) / 10,
      labelPoint: { x: rect.left + Math.max(3, bv.margin - bv.labelOffset), y: rect.top + rect.height / 2 },
      center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      stones: document.getElementById('status-stones').textContent,
    };
  };
  const fire = (point) => canvas.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, clientX: point.x, clientY: point.y,
    button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse',
  }));
  const wait = () => new Promise((resolve) => setTimeout(resolve, 120));

  // Normalise to the compact size first.
  if (__figdesk.settings().coordFontLarge) { fire(state().labelPoint); await wait(); }
  __figdesk.startGame(13);
  await wait();
  const normal = state();
  fire(normal.labelPoint); await wait();
  const enlarged = state();
  fire(enlarged.labelPoint); await wait();
  const restored = state();

  __figdesk.startGame(13);
  await wait();
  const empty = state();
  fire(empty.center); await wait();
  const played = state();

  fire(restored.labelPoint); await wait();
  const persisted = state();
  const stored = JSON.parse(localStorage.getItem('figdesk.settings.v2') || '{}');
  return { normal, enlarged, restored, empty, played, persisted, stored: stored.coordFontLarge };
})()`)

const checks = {
  startsNormal: result.normal.large === false,
  enlarges: result.enlarged.large === true,
  marginGrows: result.enlarged.margin > result.normal.margin,
  offsetMoves: result.enlarged.labelOffset !== result.normal.labelOffset,
  restores: result.restored.large === false && result.restored.margin === result.normal.margin,
  playsMove: result.played.stones !== result.empty.stones && result.played.stones.includes('B 1'),
  persists: result.persisted.large === true && result.stored === true,
  noErrors: errors.length === 0,
}
const ok = Object.values(checks).every(Boolean)
console.log(JSON.stringify({ ok, checks, result, errors }, null, 2))
ws.close()
process.exit(ok ? 0 : 1)
