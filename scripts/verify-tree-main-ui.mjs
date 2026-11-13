// Checks that the first-child main variation is the leftmost tree column and
// that every branch shares the same 1.2x vertical node pitch.
// Usage: node scripts/verify-tree-main-ui.mjs [port] [appUrl] [outDir]
import fs from 'node:fs/promises'
import path from 'node:path'

const port = process.argv[2] ?? '9362'
const appUrl = process.argv[3] ?? `file:///${process.cwd().replaceAll('\\', '/')}/src/index.html?test=1`
const outDir = process.argv[4] ?? 'preview'
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
})
function send(method, params = {}) {
  const id = seq++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}
async function shot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await fs.mkdir(path.join(process.cwd(), outDir), { recursive: true })
  await fs.writeFile(path.join(process.cwd(), outDir, name), Buffer.from(result.data, 'base64'))
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false,
})
await send('Page.navigate', { url: appUrl })
for (let i = 0; i < 100; i += 1) {
  if (await evaluate('window.__figdesk !== undefined').catch(() => false)) break
  await sleep(100)
}
await sleep(250)

const fixture = '(;GM[1]FF[4]SZ[9];B[aa](;W[bb];B[cc];W[dd])(;W[ee];B[ff]))'
await evaluate(`__figdesk.applySgfText(${JSON.stringify(fixture)}, 'tree-main.sgf')`)

const layout = await evaluate(`(() => {
  const nodes = [...__figdesk.tree.listNodes()];
  const find = (prop, value) => nodes.find((node) => node.data[prop]?.[0] === value);
  const main = [];
  let node = __figdesk.tree.root;
  while (node) {
    main.push(node.id);
    node = node.children[0] || null;
  }
  const mainSet = new Set(main);
  const side = nodes.find((entry) => !mainSet.has(entry.id) && entry.parentId === find('B', 'aa').id);
  const read = (id) => {
    const button = document.querySelector('.tree-node[data-node-id="' + id + '"]');
    const rect = button.getBoundingClientRect();
    return { top: Math.round(rect.top), left: Math.round(rect.left) };
  };
  const mainPoints = main.map(read);
  const sideParent = read(find('B', 'aa').id);
  const sidePoint = side ? read(side.id) : null;
  const mainPitch = mainPoints.length > 1 ? mainPoints[1].top - mainPoints[0].top : null;
  return {
    mainIds: main,
    mainPoints,
    mainPitch,
    sidePitch: sidePoint ? sidePoint.top - sideParent.top : null,
    leftmost: Math.min(...nodes.map((entry) => read(entry.id).left)),
    mainLeft: mainPoints[0].left,
  };
})()`)
await shot('preview-tree-main.png')

console.log(JSON.stringify({ layout, errors }, null, 2))
ws.close()
process.exitCode = errors.length === 0
  && layout.mainPitch === layout.sidePitch
  && Math.abs(layout.mainPitch - 28.8) <= 0.6
  && layout.mainLeft === layout.leftmost ? 0 : 1
