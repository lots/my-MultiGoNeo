import fs from 'node:fs/promises'
import path from 'node:path'

const port = process.argv[2] ?? '9350'
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
    if (await evaluate('window.__figdesk !== undefined').catch(() => false)) return
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

const reloadSgf = '(;GM[1]FF[4]SZ[13])'
await evaluate(`__figdesk.applySgfText(${JSON.stringify(reloadSgf)}, 'reload.sgf')`)
await evaluate(`__figdesk.addRecent('reload.sgf', ${JSON.stringify(reloadSgf)})`)
await evaluate(`__figdesk.playAt(3, 3)`)
await sleep(150)
const beforeReload = await evaluate(`({ nodes: __figdesk.snapshot().nodes, dirty: __figdesk.dirty })`)
await clickAction('reload-file')
const reloadPrompt = await evaluate(`({ open: document.getElementById('confirm-dialog').open, message: document.getElementById('confirm-message').textContent })`)
await evaluate(`document.getElementById('confirm-ok').click()`)
await sleep(300)
const afterReload = await evaluate(`({ nodes: __figdesk.snapshot().nodes, dirty: __figdesk.dirty })`)

await evaluate(`__figdesk.importSgfDocuments([
  { name: 'first.sgf', content: '(;GM[1]FF[4]SZ[13];B[dd])' },
  { name: 'second.sgf', content: '(;GM[1]FF[4]SZ[13];W[kk])' },
])`)
await sleep(250)
const imported = await evaluate(`({
  nodes: __figdesk.snapshot().nodes,
  rootChildren: __figdesk.tree.root.children.length,
  current: __figdesk.snapshot().nodeId,
  dirty: __figdesk.dirty,
})`)
await shot('preview-import-branch.png')

await evaluate(`(() => {
  window.__picture = { calls: 0, options: null, blobSize: 0 };
  const handle = {
    name: 'saved-board.png',
    createWritable: async () => ({
      write: async (blob) => {
        window.__picture.blobSize = blob.size;
        window.__picture.dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      },
      close: async () => {},
    }),
  };
  Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true,
    writable: true,
    value: async (options) => {
      window.__picture.calls += 1;
      window.__picture.options = options;
      return handle;
    },
  });
})()`)
await clickAction('save-board-picture')
await sleep(350)
const picture = await evaluate(`({
  calls: window.__picture.calls,
  suggestedName: window.__picture.options?.suggestedName,
  blobSize: window.__picture.blobSize,
})`)
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', ctrlKey: true, bubbles: true }))`)
await sleep(350)
const ctrlQ = await evaluate(`({ calls: window.__picture.calls })`)
const pictureData = await evaluate(`window.__picture.dataUrl`)
if (pictureData) {
  await fs.writeFile(path.join(outDir, 'preview-board-picture.png'), Buffer.from(pictureData.split(',')[1], 'base64'))
}

console.log(JSON.stringify({ beforeReload, reloadPrompt, afterReload, imported, picture, ctrlQ, errors }, null, 2))
await send('Browser.close')
ws.close()
