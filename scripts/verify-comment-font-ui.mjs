import fs from 'node:fs/promises'
import path from 'node:path'

const port = process.argv[2] ?? '9353'
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
async function waitForApp() {
  for (let i = 0; i < 100; i += 1) {
    if (await evaluate('window.__figdesk !== undefined').catch(() => false)) return
    await sleep(100)
  }
  throw new Error('App did not boot')
}
async function shot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' })
  await fs.writeFile(path.join(outDir, name), Buffer.from(result.data, 'base64'))
}

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
await waitForApp()
await sleep(250)

const sgf = '(;GM[1]FF[4]SZ[13]C[## Reading notes\n\nThe **upper right** is still open.\n\n- check the ladder\n- compare with the main line])'
await evaluate(`__figdesk.applySgfText(${JSON.stringify(sgf)}, 'comment-font.sgf')`)
await evaluate(`__figdesk.setTab('comment')`)
await sleep(200)
const before = await evaluate(`(() => {
  const preview = document.getElementById('comment-preview');
  return {
    size: __figdesk.settings().commentFontSize,
    css: getComputedStyle(preview).fontSize,
    output: document.getElementById('comment-font-size').textContent,
    dirty: __figdesk.dirty,
    sgf: __figdesk.sgfText(),
  };
})()`)
for (let i = 0; i < 3; i += 1) await evaluate(`document.getElementById('comment-font-inc').click()`)
await sleep(150)
const changed = await evaluate(`(() => {
  const preview = document.getElementById('comment-preview');
  return {
    size: __figdesk.settings().commentFontSize,
    css: getComputedStyle(preview).fontSize,
    output: document.getElementById('comment-font-size').textContent,
    dirty: __figdesk.dirty,
    sgf: __figdesk.sgfText(),
  };
})()`)
await shot('preview-comment-font.png')

await send('Page.reload')
await sleep(400)
await waitForApp()
await sleep(250)
await evaluate(`__figdesk.setTab('comment')`)
await sleep(150)
const reloaded = await evaluate(`(() => ({
  size: __figdesk.settings().commentFontSize,
  css: getComputedStyle(document.getElementById('comment-preview')).fontSize,
  output: document.getElementById('comment-font-size').textContent,
}))()`)

await evaluate(`__figdesk.applySgfText('(;GM[1]FF[4]SZ[19]C[Second game comment])', 'second.sgf')`)
await evaluate(`__figdesk.setTab('comment')`)
await sleep(150)
const secondGame = await evaluate(`(() => ({
  size: __figdesk.settings().commentFontSize,
  css: getComputedStyle(document.getElementById('comment-preview')).fontSize,
  dirty: __figdesk.dirty,
  sgf: __figdesk.sgfText(),
}))()`)

console.log(JSON.stringify({
  before,
  changed,
  sgfUnchanged: before.sgf === changed.sgf,
  reloaded,
  secondGame,
  secondSgfNoFont: !secondGame.sgf.includes('commentFont'),
  errors,
}, null, 2))
await send('Browser.close')
ws.close()
