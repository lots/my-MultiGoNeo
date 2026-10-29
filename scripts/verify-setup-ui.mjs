import fs from 'node:fs/promises'
import path from 'node:path'

const port = process.argv[2] ?? '9343'
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

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
for (let i = 0; i < 100; i += 1) {
  if (await evaluate(`Boolean(window.__figdesk)`).catch(() => false)) break
  await sleep(100)
}
await sleep(400)

await evaluate(`document.querySelector('.menu-item[data-action="preferences"]').click()`)
await sleep(180)
const opened = await evaluate(`({
  open: document.getElementById('setup-dialog').open,
  tabs: document.querySelectorAll('.setup-tab').length,
  panels: document.querySelectorAll('.setup-panel').length,
  active: document.querySelector('.setup-tab.is-active').dataset.setupTab,
  brightness: document.getElementById('setup-brightness').value,
})`)
await shot('preview-preferences.png')

await evaluate(`(() => {
  const set = (id, value) => { const el = document.getElementById(id); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  set('setup-theme', 'dark');
  set('setup-brightness', '80');
  document.getElementById('setup-coords').checked = true;
  set('setup-coord-style', '1-1');
  document.getElementById('setup-stone-texture').checked = false;
  set('setup-focus-marker', 'dot');
  set('setup-focus-color', 'blue');
  document.getElementById('setup-hide-markers').checked = true;
  document.getElementById('setup-next-moves').checked = true;
  document.getElementById('setup-siblings').checked = true;
  set('setup-numbers', '10');
  set('setup-numbering', 'variation');
  set('setup-label-char', 'Z');
  document.getElementById('setup-result-title').checked = false;
  document.getElementById('setup-sound').checked = true;
  set('setup-delay', '500');
  document.getElementById('setup-prefer-variation').checked = true;
  set('setup-komi', '7.5');
  document.getElementById('setup-white-first').checked = true;
  document.getElementById('setup-right-click-undo').checked = true;
  document.getElementById('setup-open-readonly').checked = false;
})()`)
await evaluate(`document.getElementById('setup-ok').click()`)
await sleep(300)
const applied = await evaluate(`(() => ({
  settings: __figdesk.settings(),
  dialogOpen: document.getElementById('setup-dialog').open,
  filter: document.getElementById('board').style.filter,
  themeClass: document.documentElement.classList.contains('theme-dark'),
}))()`)

// Re-open and cancel must not mutate settings.
await evaluate(`document.querySelector('.menu-item[data-action="preferences"]').click()`)
await sleep(120)
await evaluate(`(() => { const el = document.getElementById('setup-brightness'); el.value = '130'; el.dispatchEvent(new Event('input', { bubbles: true })); })()`)
await evaluate(`document.querySelector('#setup-dialog [data-close-dialog]').click()`)
await sleep(120)
const cancelled = await evaluate(`__figdesk.settings()`)

// Reset Defaults only changes the dialog controls until OK.
await evaluate(`document.querySelector('.menu-item[data-action="preferences"]').click()`)
await sleep(120)
await evaluate(`document.getElementById('setup-reset').click()`)
const resetPreview = await evaluate(`({
  theme: document.getElementById('setup-theme').value,
  brightness: document.getElementById('setup-brightness').value,
  focus: document.getElementById('setup-focus-marker').value,
})`)
await evaluate(`document.getElementById('setup-ok').click()`)
await sleep(250)
const resetApplied = await evaluate(`__figdesk.settings()`)

// New-game defaults and auto read-only are behaviour, not just stored values.
await evaluate(`document.querySelector('.menu-item[data-action="preferences"]').click()`)
await sleep(120)
await evaluate(`(() => {
  const komi = document.getElementById('setup-komi');
  komi.value = '7.5';
  komi.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('setup-white-first').checked = true;
  document.getElementById('setup-open-readonly').checked = true;
  document.getElementById('setup-ok').click();
})()`)
await sleep(200)
await evaluate(`__figdesk.startGame({ width: 13, height: 13 })`)
await sleep(200)
const newGameDefaults = await evaluate(`({
  komi: __figdesk.tree.root.data.KM?.[0],
  player: __figdesk.tree.root.data.PL?.[0],
})`)
await evaluate(`__figdesk.applySgfText('(;GM[1]FF[4]SZ[13])', 'readonly-open.sgf')`)
await sleep(250)
const openedReadOnly = await evaluate(`({
  readOnly: __figdesk.readOnly(),
  saveDisabled: document.querySelector('.menu-item[data-action="save-sgf"]').disabled,
  statusVisible: !document.getElementById('status-readonly').hidden,
})`)
await evaluate(`document.querySelector('.menu-item[data-action="toggle-readonly"]').click()`)
await sleep(150)

console.log(JSON.stringify({ opened, applied, cancelled, resetPreview, resetApplied, newGameDefaults, openedReadOnly, errors }, null, 2))
await send('Browser.close')
ws.close()
