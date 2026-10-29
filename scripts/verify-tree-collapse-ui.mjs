import fs from 'node:fs/promises'
import path from 'node:path'

const port = process.argv[2] ?? '9345'
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

const sgf = '(;GM[1]FF[4]SZ[13];B[aa](;W[bb](;B[cc])(;B[dd]))(;W[ee]))'
await evaluate(`__figdesk.applySgfText(${JSON.stringify(sgf)}, 'tree-collapse.sgf')`)
await sleep(250)

const expanded = await evaluate(`(() => {
  const paths = [...document.querySelectorAll('.tree-link')].map((path) => path.getAttribute('d') || '');
  return {
    nodes: document.querySelectorAll('.tree-node').length,
    toggles: document.querySelectorAll('.tree-toggle').length,
    allOrthogonal: paths.every((d) => !/[L]/.test(d)),
    pathCount: paths.length,
  };
})()`)
await shot('preview-tree-expanded.png')

// Collapse the first branch (B[aa]) and make the current path point inside it.
await evaluate(`(() => {
  const branch = __figdesk.tree.root.children[0];
  const branchChild = branch.children[0].children[0];
  __figdesk.selectNode(branchChild.id);
  document.querySelector('.tree-toggle').click();
})()`)
await sleep(250)
const collapsed = await evaluate(`(() => ({
  nodes: document.querySelectorAll('.tree-node').length,
  toggles: document.querySelectorAll('.tree-toggle').length,
  toggleText: document.querySelector('.tree-toggle')?.textContent,
  toggleExpanded: document.querySelector('.tree-toggle')?.getAttribute('aria-expanded'),
  current: document.querySelector('.tree-node.is-current')?.dataset.nodeId,
  branchId: String(__figdesk.tree.root.children[0].id),
  meta: document.getElementById('tree-meta').textContent,
}))()`)
await shot('preview-tree-collapsed.png')

await evaluate(`document.querySelector('.tree-toggle').click()`)
await sleep(250)
const reexpanded = await evaluate(`(() => ({
  nodes: document.querySelectorAll('.tree-node').length,
  toggleText: document.querySelector('.tree-toggle')?.textContent,
}))()`)

// Navigating into a collapsed subtree should reveal the selected path.
await evaluate(`document.querySelector('.tree-toggle').click()`)
await sleep(150)
await evaluate(`document.getElementById('tool-next').click()`)
await sleep(250)
const navigatedIntoCollapsed = await evaluate(`(() => ({
  nodes: document.querySelectorAll('.tree-node').length,
  currentVisible: Boolean(document.querySelector('.tree-node.is-current')),
  current: document.querySelector('.tree-node.is-current')?.dataset.nodeId,
}))()`)

console.log(JSON.stringify({ expanded, collapsed, reexpanded, navigatedIntoCollapsed, errors }, null, 2))
await send('Browser.close')
ws.close()
