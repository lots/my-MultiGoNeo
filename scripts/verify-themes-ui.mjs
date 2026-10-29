import fs from 'node:fs/promises'
import path from 'node:path'

// Captures one 13x13 board screenshot per theme (classic, flat, dark, paper).
// Expects a Chromium instance already listening on the DevTools port and showing the app.
//
//   node scripts/verify-themes-ui.mjs 9346 . "file:///.../src/index.html?test=1"

const port = process.argv[2] ?? '9346'
const outDir = process.argv[3] ?? '.'
const url = process.argv[4] ?? `file:///${process.cwd().replaceAll('\\', '/')}/src/index.html?test=1`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const THEMES = ['classic', 'flat', 'dark', 'paper']

// A calm 13x13 opening so every theme shows stones, coordinates and a populated tree.
const SGF = [
  '(;GM[1]FF[4]CA[UTF-8]AP[MultiGo Neo:1.0]SZ[13]PB[Black]PW[White]KM[6.5]',
  'RE[B+R]GN[Theme preview]C[13x13 board shown in the four built-in themes.]',
  ';B[dd];W[jd];B[dj];W[jj];B[gg];W[gc];B[cg];W[cc];B[cd];W[dc];B[ee];W[ff]',
  ';B[ef];W[fe];B[de];W[fd];B[hf];W[ig];B[hj];W[ji];B[kk];W[ik];B[ij];W[gi])',
].join('')

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
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  }
  return result.result.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1024,
  deviceScaleFactor: 1,
  mobile: false,
})

await send('Page.navigate', { url })
await sleep(400)

let ready = false
for (let i = 0; i < 100; i += 1) {
  ready = await evaluate('Boolean(window.__figdesk)').catch(() => false)
  if (ready) break
  await sleep(150)
}
if (!ready) throw new Error('MultiGo Neo did not initialise')

await evaluate(`(() => {
  __figdesk.applySgfText(${JSON.stringify(SGF)}, 'themes.sgf');
  let leaf = __figdesk.tree.root;
  while (leaf.children.length) leaf = leaf.children[0];
  __figdesk.selectNode(leaf.id);
})()`)
await sleep(500)

const results = {}
for (const theme of THEMES) {
  await evaluate(`(() => {
    const select = document.getElementById('options-theme');
    select.value = ${JSON.stringify(theme)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`)
  await sleep(450)

  const state = await evaluate(`({
    theme: document.documentElement.dataset.boardTheme,
    width: __figdesk.settings().boardWidth,
    height: __figdesk.settings().boardHeight,
    stones: __figdesk.snapshot().stones,
  })`)
  if (state.theme !== theme) throw new Error(`theme ${theme} was not applied (got ${state.theme})`)
  if (state.width !== 13 || state.height !== 13) {
    throw new Error(`expected a 13x13 board, got ${state.width}x${state.height}`)
  }

  // Drop the "Board theme: …" log lines so the gallery images stay clean.
  await evaluate(`document.getElementById('statuslog')?.replaceChildren()`)
  await sleep(120)

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const file = path.join(outDir, `preview-theme-${theme}.png`)
  await fs.writeFile(file, Buffer.from(shot.data, 'base64'))
  results[theme] = { ...state, file }
  console.log(`${theme}: ${state.width}x${state.height}, ${state.stones} stones -> ${file}`)
}

console.log(JSON.stringify({ results, errors }, null, 2))
ws.close()
process.exit(errors.length === 0 ? 0 : 1)
