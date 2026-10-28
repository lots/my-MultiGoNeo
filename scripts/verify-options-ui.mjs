import fs from 'node:fs/promises'
import path from 'node:path'

const port = process.argv[2] ?? '9340'
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
  for (let i = 0; i < 120; i += 1) {
    const ready = await evaluate(`Boolean(window.__figdesk)`).catch(() => false)
    if (ready) return
    await sleep(100)
  }
  throw new Error('App did not boot')
}
async function clickAction(action) {
  await evaluate(`document.querySelector('.menu-item[data-action="${action}"]').click()`)
  await sleep(120)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
await waitForApp()
await sleep(500)

const initial = await evaluate(`(() => {
  const status = document.querySelector('.statusbar');
  const cells = document.querySelector('.statuscells');
  const log = document.getElementById('statuslog');
  const msg = document.getElementById('pane-message');
  return {
    snapshot: __figdesk.snapshot(),
    statusHeight: getComputedStyle(status).height,
    statusBorder: getComputedStyle(status).borderTopWidth,
    cellsBorder: getComputedStyle(cells).borderTopWidth,
    logInMessagePanel: log.parentElement.id,
    logInStatusbar: status.contains(log),
    messageHeight: Math.round(msg.getBoundingClientRect().height),
    splitter: Boolean(document.getElementById('splitter-m')),
    options: [...document.querySelectorAll('#popup-options .menu-item')].map((x) => x.dataset.action),
    language: __figdesk.settings().language,
  };
})()`)

// Invalid custom size must keep the dialog open and show an inline error.
await evaluate(`(() => {
  const select = document.getElementById('board-size');
  select.value = 'custom';
  select.dispatchEvent(new Event('change', { bubbles: true }));
})()`)
await sleep(150)
const customDialog = await evaluate(`({
  open: document.getElementById('custom-size-dialog').open,
  value: document.getElementById('custom-size-input').value,
})`)
await evaluate(`(() => {
  document.getElementById('custom-size-input').value = '60*2';
  document.getElementById('custom-size-apply').click();
})()`)
await sleep(180)
const invalidCustom = await evaluate(`({
  open: document.getElementById('custom-size-dialog').open,
  error: document.getElementById('custom-size-error').textContent,
  errorVisible: !document.getElementById('custom-size-error').hidden,
  snapshot: __figdesk.snapshot(),
})`)
await evaluate(`(() => {
  document.getElementById('custom-size-input').value = '5*9';
  document.getElementById('custom-size-apply').click();
})()`)
await sleep(250)
await evaluate(`document.getElementById('confirm-ok').click()`)
await sleep(350)
const custom5x9 = await evaluate(`({
  snapshot: __figdesk.snapshot(),
  boardView: { cols: __figdesk.boardView.cols, rows: __figdesk.boardView.rows },
  select: document.getElementById('board-size').value,
  savedSize: { width: __figdesk.settings().boardWidth, height: __figdesk.settings().boardHeight },
})`)

// Persistence across a full reload.
await send('Page.reload')
await waitForApp()
await sleep(600)
const afterReload = await evaluate(`({
  snapshot: __figdesk.snapshot(),
  select: document.getElementById('board-size').value,
  settings: { width: __figdesk.settings().boardWidth, height: __figdesk.settings().boardHeight, language: __figdesk.settings().language },
})`)

// Resize the message panel with the keyboard.
const messageBefore = await evaluate(`Math.round(document.getElementById('pane-message').getBoundingClientRect().height)`)
await evaluate(`document.getElementById('splitter-m').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))`)
await sleep(150)
const messageAfter = await evaluate(`({
  height: Math.round(document.getElementById('pane-message').getBoundingClientRect().height),
  aria: document.getElementById('splitter-m').getAttribute('aria-valuenow'),
})`)

// Switch to Chinese and verify the shell.
await clickAction('language-zh')
await sleep(250)
const chinese = await evaluate(`({
  language: __figdesk.settings().language,
  htmlLang: document.documentElement.lang,
  fileMenu: document.getElementById('menu-file').textContent.trim(),
  optionsMenu: document.getElementById('menu-options').textContent.trim(),
  infoTab: document.getElementById('tab-info').textContent.trim(),
  commentTab: document.getElementById('tab-comment').textContent.trim(),
  treeTitle: document.querySelector('#pane-moves .panel-head span').textContent.trim(),
  messageTitle: document.querySelector('#pane-message .panel-head span').textContent.trim(),
  pass: document.getElementById('tool-pass').textContent.trim(),
  status: document.getElementById('status-next').textContent.trim(),
  zhChecked: document.querySelector('.menu-item[data-action="language-zh"]').getAttribute('aria-checked'),
})`)
await shot('preview-chinese.png')

// Language and board size also survive a reload.
await send('Page.reload')
await waitForApp()
await sleep(600)
const bilingualReload = await evaluate(`({
  language: __figdesk.settings().language,
  fileMenu: document.getElementById('menu-file').textContent.trim(),
  snapshot: __figdesk.snapshot(),
})`)

// Return to English for the final screenshots.
await clickAction('language-en')
await sleep(200)

await evaluate(`document.getElementById('menu-options').click()`)
await sleep(120)
const optionsMenu = await evaluate(`(() => {
  const popup = document.getElementById('popup-options');
  const rect = popup.getBoundingClientRect();
  return {
    expanded: document.getElementById('menu-options').getAttribute('aria-expanded'),
    items: popup.querySelectorAll('.menu-item').length,
    bottom: Math.round(rect.bottom),
    viewport: window.innerHeight,
    delayChecked: [...popup.querySelectorAll('.menu-item[data-delay]')].filter((x) => x.getAttribute('aria-checked') === 'true').map((x) => x.dataset.action),
    rememberChecked: document.querySelector('.menu-item[data-action="toggle-remember-size"]').getAttribute('aria-checked'),
  };
})()`)
await shot('preview-options-menu.png')
await evaluate(`document.getElementById('menu-options').click()`)
await clickAction('delay-500')
const delay = await evaluate(`__figdesk.settings().autoPlayDelay`)

console.log(JSON.stringify({
  initial,
  customDialog,
  invalidCustom,
  custom5x9,
  afterReload,
  messageBefore,
  messageAfter,
  chinese,
  bilingualReload,
  optionsMenu,
  delay,
  errors,
}, null, 2))

await send('Browser.close')
ws.close()
