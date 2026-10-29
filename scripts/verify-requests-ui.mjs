import fs from 'node:fs/promises'
import path from 'node:path'

// R1-R4 verification: FF4 move log, recent files, pass labels, 四4 coordinates.
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
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    if (!message.params.entry.text.includes('favicon')) errors.push(message.params.entry.text)
  }
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
  await waitFor('Boolean(window.__figdesk)', 'renderer')
  await sleep(350)
}
async function action(name) {
  await evaluate(`document.querySelector('[data-action="${name}"]').click()`)
  await sleep(150)
}
async function menuSelect(id, value) {
  await evaluate(`(() => {
    const select = document.getElementById('${id}');
    select.value = '${value}';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`)
  await sleep(180)
}
async function lastMessage() {
  return evaluate(`document.querySelector('#statuslog')?.lastElementChild?.querySelector('.status-text')?.textContent ?? ''`)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false })

await load(`${appUrl}?test=1`)
await evaluate('localStorage.clear()')
await load(`${appUrl}?test=1`)

// R1: successful moves log the FF4 property and value.
await evaluate(`__figdesk.startGame({ width: 9, height: 9 })`)
await evaluate(`__figdesk.playAt(2, 2)`)
await sleep(100)
const move1 = await lastMessage()
await evaluate(`__figdesk.playAt(3, 3)`)
await sleep(100)
const move2 = await lastMessage()
await evaluate(`__figdesk.startGame({ width: 9, height: 9 })`)
await sleep(100)

// R2: recent files cap, labels, menu fit, reopen and clear.
await evaluate(`(() => {
  __figdesk.addRecent('first.sgf', '(;FF[4]GM[1]SZ[9];B[dd])');
  __figdesk.addRecent('second.sgf', '(;FF[4]GM[1]SZ[9];W[ee])');
  for (let i = 1; i <= 8; i += 1) __figdesk.addRecent('game-' + i + '.sgf', '(;FF[4]GM[1]SZ[9];B[cc])');
})()`)
const recentState = await evaluate(`__figdesk.recent()`)
await evaluate(`document.getElementById('menu-file').click()`)
await sleep(200)
const recentMenu = await evaluate(`(() => {
  const popup = document.getElementById('popup-file');
  const rect = popup.getBoundingClientRect();
  return {
    labels: [...document.querySelectorAll('#recent-files .menu-item .menu-label')].map((x) => x.textContent),
    fit: rect.bottom <= window.innerHeight && rect.top >= 0,
    items: document.querySelectorAll('#recent-files .menu-item').length,
    bottom: Math.round(rect.bottom),
  };
})()`)
await shot('preview-recent.png')
await evaluate(`document.querySelector('#recent-files .menu-item').click()`)
await sleep(400)
const reopened = await evaluate(`(() => ({
  childB: __figdesk.tree.root.children[0]?.data.B?.[0] ?? null,
  recentFirst: __figdesk.recent()[0]?.name ?? null,
  menuOpen: !document.getElementById('popup-file').hidden,
}))()`)
await action('clear-recents')
const cleared = await evaluate(`(() => ({
  recent: __figdesk.recent(),
  empty: document.querySelector('#recent-files .menu-item')?.textContent ?? '',
  clearDisabled: document.getElementById('clear-recents').disabled,
  dialog: Boolean(document.querySelector('dialog[open]')),
}))()`)

// R3: SGF pass endings are labelled "pass" in the game tree.
await evaluate(`__figdesk.applySgfText('(;FF[4]GM[1]SZ[9];B[dd];W[ee];B[];W[])', 'test case')`)
await sleep(300)
const treePasses = await evaluate(`(() => ({
  labels: [...document.querySelectorAll('#game-tree .tree-node')].map((node) => ({
    text: node.textContent,
    pass: node.classList.contains('is-pass'),
    title: node.title,
  })),
  passCount: document.querySelectorAll('#game-tree .tree-node.is-pass').length,
}))()`)
await shot('preview-pass-tree.png')

// R4: 四4 coordinate style.
await menuSelect('view-coords', 'CJK')
const cjk = await evaluate(`(() => ({
  style: __figdesk.settings().coordinatesStyle,
  checked: document.getElementById('view-coords').value,
  coordsOn: __figdesk.settings().coords,
}))()`)
await shot('preview-cjk.png')

await evaluate(`document.getElementById('menu-view').click()`)
await sleep(180)
await shot('preview-view-menu.png')
await evaluate(`document.getElementById('menu-view').click()`)

console.log(JSON.stringify({
  move1,
  move2,
  recentState,
  recentMenu,
  reopened,
  cleared,
  treePasses,
  cjk,
  errors,
}, null, 2))

ws.close()
