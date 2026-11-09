// Verifies comment-focused tree navigation and focus retention.
// Usage: node scripts/verify-comment-nav-ui.mjs [port] [appUrl]
const port = process.argv[2] ?? '9361'
const appUrl = process.argv[3] ?? `file:///${process.cwd().replaceAll('\\', '/')}/src/index.html?test=1`
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
async function waitForApp() {
  for (let i = 0; i < 100; i += 1) {
    if (await evaluate('window.__figdesk !== undefined').catch(() => false)) return
    await sleep(100)
  }
  throw new Error('App did not boot')
}

await send('Page.enable')
await send('Runtime.enable')
await sleep(100)
await send('Page.navigate', { url: appUrl })
await waitForApp()
await sleep(250)

const fixture = '(;GM[1]FF[4]SZ[9];B[aa](;W[bb]C[main comment];B[cc])(;W[dd]))'
await evaluate(`__figdesk.applySgfText(${JSON.stringify(fixture)}, 'comment-nav.sgf')`)

const setup = await evaluate(`(() => {
  const nodes = [...__figdesk.tree.listNodes()];
  const find = (prop, value) => nodes.find((node) => node.data[prop]?.[0] === value);
  window.__navIds = {
    aa: find('B', 'aa').id,
    bb: find('W', 'bb').id,
    cc: find('B', 'cc').id,
    dd: find('W', 'dd').id,
  };
  __figdesk.selectNode(window.__navIds.bb);
  __figdesk.setTab('comment');
  const input = document.getElementById('comment-input');
  input.focus();
  input.value = 'first node note';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return { active: document.activeElement?.id, value: input.value };
})()`)

function keyExpression(key) {
  return `(() => {
    const input = document.getElementById('comment-input');
    input.focus();
    const event = new KeyboardEvent('keydown', {
      key: ${JSON.stringify(key)}, code: ${JSON.stringify(key === 'ArrowLeft' ? 'ArrowLeft' : key === 'ArrowRight' ? 'ArrowRight' : key === 'ArrowUp' ? 'ArrowUp' : 'ArrowDown')},
      ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
    });
    input.dispatchEvent(event);
    return { prevented: event.defaultPrevented, active: document.activeElement?.id };
  })()`
}

const down = await evaluate(keyExpression('ArrowDown'))
await sleep(80)
const afterDown = await evaluate(`({
  node: __figdesk.nodeId,
  expected: window.__navIds.cc,
  comment: document.getElementById('comment-input').value,
  focus: document.activeElement?.id,
  saved: window.__figdesk.tree.get(window.__navIds.bb).data.C?.[0] || '',
})`)

const up = await evaluate(keyExpression('ArrowUp'))
await sleep(80)
const afterUp = await evaluate(`({
  node: __figdesk.nodeId,
  expected: window.__navIds.bb,
  focus: document.activeElement?.id,
})`)

const right = await evaluate(keyExpression('ArrowRight'))
await sleep(80)
const afterRight = await evaluate(`({
  node: __figdesk.nodeId,
  expected: window.__navIds.dd,
  focus: document.activeElement?.id,
})`)

const left = await evaluate(keyExpression('ArrowLeft'))
await sleep(80)
const afterLeft = await evaluate(`({
  node: __figdesk.nodeId,
  expected: window.__navIds.bb,
  focus: document.activeElement?.id,
})`)

await evaluate(`__figdesk.selectNode(window.__navIds.cc); document.getElementById('comment-input').focus()`)
const shortBranch = await evaluate(keyExpression('ArrowRight'))
await sleep(80)
const afterShortBranch = await evaluate(`({
  node: __figdesk.nodeId,
  expected: window.__navIds.dd,
  focus: document.activeElement?.id,
})`)

const saveShortcut = await evaluate(`(async () => {
  const input = document.getElementById('comment-input');
  input.focus();
  input.value = 'save from comment';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  window.showSaveFilePicker = async () => { throw new DOMException('cancel', 'AbortError'); };
  const event = new KeyboardEvent('keydown', {
    key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true,
  });
  input.dispatchEvent(event);
  await new Promise((resolve) => setTimeout(resolve, 80));
  return {
    prevented: event.defaultPrevented,
    focus: document.activeElement?.id,
    saved: window.__figdesk.tree.get(window.__navIds.dd).data.C?.[0] || '',
  };
})()`)

console.log(JSON.stringify({ setup, down, afterDown, up, afterUp, right, afterRight, left, afterLeft, shortBranch, afterShortBranch, saveShortcut, errors }, null, 2))
ws.close()
process.exitCode = errors.length === 0 ? 0 : 1
