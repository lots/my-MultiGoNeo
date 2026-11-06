import path from 'node:path'

const port = process.argv[2] ?? '9356'
const url = process.argv[3] ?? `file:///${process.cwd().replaceAll('\\', '/')}/src/index.html?test=1`
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

await send('Page.enable')
await send('Runtime.enable')
await sleep(100)
await send('Page.navigate', { url })
await waitForApp()
await sleep(200)
await evaluate(`(() => {
  const settings = __figdesk.settings();
  settings.soundEnabled = true;
  localStorage.setItem('figdesk.settings.v2', JSON.stringify(settings));
})()`)
await send('Page.reload')
await sleep(400)
await waitForApp()
await sleep(200)

const result = await evaluate(`(() => {
  window.__audio = { oscillators: 0, resumes: 0 };
  const param = () => ({
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  class FakeContext {
    constructor() {
      this.currentTime = 0;
      this.state = 'running';
      this.destination = {};
    }
    createOscillator() {
      window.__audio.oscillators += 1;
      return {
        type: '',
        frequency: param(),
        connect() { return this; },
        start() {},
        stop() {},
      };
    }
    createGain() {
      return { gain: param(), connect() { return this; } };
    }
    resume() { window.__audio.resumes += 1; }
  }
  window.AudioContext = FakeContext;
  window.webkitAudioContext = FakeContext;
  __figdesk.applySgfText('(;GM[1]FF[4]SZ[5]AB[ba][ab][cb]AW[bb])', 'capture-sound.sgf');
  const before = window.__audio.oscillators;
  __figdesk.playAt(1, 2);
  return {
    before,
    after: window.__audio.oscillators,
    captures: __figdesk.tree.root.children[0]?.data?.B?.[0] ?? null,
    status: document.getElementById('status-captures').textContent,
    dead: [...__figdesk.tree.listNodes()].length,
  };
})()`)

console.log(JSON.stringify({ result, errors }, null, 2))
ws.close()
process.exitCode = errors.length === 0 ? 0 : 1
