import fs from 'node:fs/promises'
import path from 'node:path'

// Verifies FF[4] logging for non-move properties (setup, markup, lines, dims, PL).
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
  await sleep(120)
}
async function lastMessage() {
  return evaluate(`document.querySelector('#statuslog')?.lastElementChild?.querySelector('.status-text')?.textContent ?? ''`)
}
async function messages() {
  return evaluate(`[...document.querySelectorAll('#statuslog .status-text')].map((x) => x.textContent)`)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false })

await load(`${appUrl}?test=1`)
await evaluate('localStorage.clear()')
await load(`${appUrl}?test=1`)

// Navigation to a move node with several non-move properties.
await evaluate(`(() => {
  __figdesk.applySgfText('(;FF[4]GM[1]SZ[9];B[dd]CR[ee]AR[aa:ae:red]LN[cc:gg]DD[ff:hh]SBKDD[blue:ff:hh])', 'test case');
})()`)
await sleep(200)
await action('clear-messages')
await evaluate(`__figdesk.selectNode(__figdesk.tree.root.children[0].id)`)
await sleep(200)
const moveNodeLog = await messages()
await shot('preview-property-log.png')

// Navigation to a non-move-only node.
await evaluate(`__figdesk.applySgfText('(;FF[4]GM[1]SZ[9];B[dd];CR[ee]DD[ff:hh])', 'test case')`)
await sleep(200)
await action('clear-messages')
await evaluate(`__figdesk.selectNode(__figdesk.tree.root.children[0].children[0].id)`)
await sleep(200)
const annotationNodeLog = await messages()

// Immediate edit actions should print the property code, not a prose message.
await evaluate(`__figdesk.startGame({ width: 9, height: 9 })`)
await sleep(150)
await evaluate(`__figdesk.selectTool('circle'); __figdesk.playAt(2, 2)`)
const markLog = await lastMessage()
await evaluate(`__figdesk.selectTool('stone_1'); __figdesk.playAt(3, 3)`)
const setupLog = await lastMessage()
await evaluate(`__figdesk.selectTool('line'); __figdesk.playAt(1, 1); __figdesk.playAt(1, 3)`)
const lineLog = await lastMessage()
await evaluate(`__figdesk.selectTool('dim'); __figdesk.playAt(4, 4); __figdesk.playAt(6, 6)`)
const dimLogs = (await messages()).slice(-2)
await evaluate(`document.getElementById('turn-button').click()`)
const turnLog = await lastMessage()
await shot('preview-property-edit.png')

console.log(JSON.stringify({
  moveNodeLog,
  annotationNodeLog,
  markLog,
  setupLog,
  lineLog,
  dimLogs,
  turnLog,
  errors,
}, null, 2))

ws.close()
