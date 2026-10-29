import fs from 'node:fs/promises'
import path from 'node:path'

const port = process.argv[2] ?? '9347'
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

await evaluate(`__figdesk.applySgfText('(;GM[1]FF[4]SZ[9]AB[dd][ff]AW[ee][gg])', 'paper-theme.sgf')`)
await sleep(200)
await evaluate(`(() => {
  const select = document.getElementById('options-theme');
  select.value = 'paper';
  select.dispatchEvent(new Event('change', { bubbles: true }));
})()`)
await sleep(350)

const paper = await evaluate(`(() => {
  const canvas = document.getElementById('board');
  const context = canvas.getContext('2d');
  const dpr = canvas.width / canvas.getBoundingClientRect().width;
  const black = __figdesk.pointFor(3, 3);
  const white = __figdesk.pointFor(4, 4);
  const rect = canvas.getBoundingClientRect();
  const sample = (point) => {
    const data = context.getImageData(Math.round((point.x - rect.left) * dpr), Math.round((point.y - rect.top) * dpr), 1, 1).data;
    return [data[0], data[1], data[2], data[3]];
  };
  return {
    theme: __figdesk.settings().theme,
    surface: getComputedStyle(document.documentElement).getPropertyValue('--board-surface').trim(),
    blackCenter: sample(black),
    whiteCenter: sample(white),
  };
})()`)
const shot = await send('Page.captureScreenshot', { format: 'png' })
await fs.writeFile(path.join(outDir, 'preview-theme-paper.png'), Buffer.from(shot.data, 'base64'))

console.log(JSON.stringify({ paper, errors }, null, 2))
await send('Browser.close')
ws.close()
