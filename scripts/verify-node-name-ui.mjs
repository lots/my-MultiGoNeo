// Verifies SGF N (node name) loading, tree labels and the inline tree editor.
// Usage: node scripts/verify-node-name-ui.mjs [port] [appUrl] [outDir]
import fs from 'node:fs/promises'
import path from 'node:path'

const port = process.argv[2] ?? '9364'
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
    expression, returnByValue: true, awaitPromise: true, userGesture: true,
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

const fixture = '(;GM[1]FF[4]SZ[9]C[Root];B[aa]N[Opening](;W[bb]N[Joseki])(;W[cc]))'
await evaluate(`__figdesk.applySgfText(${JSON.stringify(fixture)}, 'node-name.sgf')`)
await sleep(200)

const loaded = await evaluate(`(() => {
  const labels = [...document.querySelectorAll('.tree-node-name')].map((label) => ({
    text: label.textContent, title: label.title,
  }));
  return {
    labels,
    sgfHasName: __figdesk.sgfText().includes('N[Opening]') && __figdesk.sgfText().includes('N[Joseki]'),
  };
})()`)

const existing = await evaluate(`(() => {
  const node = __figdesk.tree.root.children[0].children[0];
  __figdesk.selectNode(node.id);
  const button = document.querySelector('.tree-node[data-node-id="' + node.id + '"]');
  button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  const form = document.querySelector('.tree-name-editor');
  const input = form?.querySelector('input');
  const value = input?.value;
  input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  return {
    value,
    closed: !document.querySelector('.tree-name-editor'),
    unchanged: node.data.N?.[0] === 'Joseki',
  };
})()`)

const editor = await evaluate(`(() => {
  const node = __figdesk.tree.root.children[0].children[1];
  __figdesk.selectNode(node.id);
  __figdesk.setTab('comment');
  const button = document.querySelector('.tree-node[data-node-id="' + node.id + '"]');
  button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  const form = document.querySelector('.tree-name-editor');
  const input = form?.querySelector('input');
  return {
    open: Boolean(form),
    value: input?.value,
    focused: document.activeElement === input,
    left: form ? Math.round(form.getBoundingClientRect().left) : null,
  };
})()`)

const saved = await evaluate(`(() => {
  const form = document.querySelector('.tree-name-editor');
  const input = form.querySelector('input');
  input.value = 'Pincer';
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const node = __figdesk.tree.root.children[0].children[1];
  return {
    name: node.data.N?.[0] || '',
    label: [...document.querySelectorAll('.tree-node-name')].map((label) => label.textContent),
    sgfHasName: __figdesk.sgfText().includes('N[Pincer]'),
    editorClosed: !document.querySelector('.tree-name-editor'),
  };
})()`)
const f2 = await evaluate(`(() => {
  const node = __figdesk.tree.root.children[0].children[0];
  __figdesk.selectNode(node.id);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }));
  const form = document.querySelector('.tree-name-editor');
  const input = form?.querySelector('input');
  const value = input?.value;
  input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  return { open: Boolean(form), value, closed: !document.querySelector('.tree-name-editor') };
})()`)
await shot('preview-node-name.png')

console.log(JSON.stringify({ loaded, existing, editor, saved, f2, errors }, null, 2))
ws.close()
process.exitCode = errors.length === 0
  && loaded.labels.length === 2
  && loaded.sgfHasName
  && existing.value === 'Joseki' && existing.closed && existing.unchanged
  && editor.open && editor.focused
  && saved.name === 'Pincer'
  && saved.label.includes('Pincer')
  && saved.sgfHasName
  && saved.editorClosed
  && f2.open && f2.value === 'Joseki' && f2.closed ? 0 : 1
