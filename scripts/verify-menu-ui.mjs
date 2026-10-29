import fs from 'node:fs/promises'
import path from 'node:path'

// Verifies the compact View/Options menus, branch-local next-move hints,
// toolbar pressed styling and FF[4] logging while navigating.
const port = process.argv[2] ?? '9444'
const outDir = process.argv[3] ?? '.'
const appUrl = process.argv[4] ?? `file:///${process.cwd().replaceAll('\\', '/')}/src/index.html`
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
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    if (!message.params.entry.text.includes('favicon')) errors.push(message.params.entry.text)
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
async function shot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' })
  await fs.writeFile(path.join(outDir, name), Buffer.from(result.data, 'base64'))
}
async function waitFor(expression, label) {
  for (let i = 0; i < 120; i += 1) {
    if (await evaluate(expression).catch(() => false)) return
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${label}`)
}
async function load(url) {
  await send('Page.navigate', { url })
  await waitFor('Boolean(window.__figdesk)', 'renderer')
  await sleep(350)
}
async function action(name) {
  await evaluate(`document.querySelector('[data-action="${name}"]').click()`)
  await sleep(120)
}
async function menuSelect(id, value) {
  await evaluate(`(() => {
    const select = document.getElementById('${id}');
    select.value = '${value}';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`)
  await sleep(200)
}
async function lastMessage() {
  return evaluate(`document.querySelector('#statuslog')?.lastElementChild?.querySelector('.status-text')?.textContent ?? ''`)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false })

await load(`${appUrl}?test=1`)
await evaluate('localStorage.clear()')
await load(`${appUrl}?test=1`)

// Branch fixture: B dd has two continuations, each with a child.
await evaluate(`(() => {
  __figdesk.applySgfText('(;FF[4]GM[1]SZ[9];B[dd](;W[ee];B[ff])(;W[cc];B[gg]))', 'test case');
  __figdesk.selectNode(__figdesk.tree.root.children[0].id);
})()`)
await sleep(200)

const removed = await evaluate(`(() => ({
  colorizeItem: Boolean(document.querySelector('[data-action="toggle-colorize"]')),
  siblingItem: Boolean(document.querySelector('[data-action="toggle-siblings"]')),
  colorizeSetting: 'colorizeMoves' in __figdesk.settings(),
  siblingSetting: 'showSiblings' in __figdesk.settings(),
  viewSelects: [...document.querySelectorAll('#popup-view [data-menu-select]')].map((x) => x.dataset.menuSelect),
  optionSelects: [...document.querySelectorAll('#popup-options [data-menu-select]')].map((x) => x.dataset.menuSelect),
}))()`)

// R6: next move follows the current branch; siblings are optional and dimmer.
await action('toggle-next-moves')
await action('toggle-siblings')
const overlayFirst = await evaluate(`__figdesk.overlay()`)
await evaluate(`__figdesk.selectNode(__figdesk.tree.root.children[0].children[1].id)`)
await sleep(200)
const overlaySibling = await evaluate(`__figdesk.overlay()`)
await shot('preview-overlay.png')
await action('toggle-next-moves')
await action('toggle-siblings')

// R7: navigating with Next logs the target node's FF[4] code.
await evaluate(`__figdesk.selectNode(__figdesk.rootId())`)
await action('clear-messages')
await action('next')
const nav1 = await lastMessage()
await action('next')
const nav2 = await lastMessage()

// R6b: pressed toolbar text is white/bold, unpressed is dimmed.
await menuSelect('view-coords', 'A1')
await menuSelect('view-numbers', 'all')
const pressed = await evaluate(`(() => {
  const read = (id) => {
    const style = getComputedStyle(document.getElementById(id));
    return { color: style.color, weight: style.fontWeight, pressed: document.getElementById(id).getAttribute('aria-pressed') };
  };
  return { coords: read('toggle-coords'), numbers: read('toggle-numbers') };
})()`)
await evaluate(`document.getElementById('toggle-coords').click(); document.getElementById('toggle-numbers').click()`)
await sleep(150)
const unpressed = await evaluate(`(() => {
  const read = (id) => {
    const style = getComputedStyle(document.getElementById(id));
    return { color: style.color, weight: style.fontWeight, pressed: document.getElementById(id).getAttribute('aria-pressed') };
  };
  return { coords: read('toggle-coords'), numbers: read('toggle-numbers') };
})()`)

// R3/R4: coordinate and move-number dropdowns.
await menuSelect('view-coords', 'CJK')
const cjk = await evaluate(`({ style: __figdesk.settings().coordinatesStyle, value: document.getElementById('view-coords').value })`)
await shot('preview-cjk.png')
await menuSelect('view-numbering', 'variation')
await menuSelect('view-numbers', '10')
const numberState = await evaluate(`({
  limit: __figdesk.settings().moveNumberLimit,
  mode: __figdesk.settings().moveNumbersMode,
  numberValue: document.getElementById('view-numbers').value,
  numberingValue: document.getElementById('view-numbering').value,
})`)

// View menu fit and screenshot.
await evaluate(`document.getElementById('menu-view').click()`)
await sleep(180)
const viewMenu = await evaluate(`(() => {
  const popup = document.getElementById('popup-view');
  const rect = popup.getBoundingClientRect();
  return {
    fit: rect.bottom <= window.innerHeight && rect.top >= 0,
    bottom: Math.round(rect.bottom),
    selects: popup.querySelectorAll('[data-menu-select]').length,
    items: popup.querySelectorAll('.menu-item').length,
  };
})()`)
await shot('preview-view-menu.png')
await evaluate(`document.getElementById('menu-view').click()`)

// R2: board-size dropdown via the confirmation dialog.
await menuSelect('view-board-size', '13')
await sleep(250)
const sizePrompt = await evaluate(`({ open: document.getElementById('confirm-dialog').open, message: document.getElementById('confirm-message').textContent })`)
if (sizePrompt.open) await evaluate(`document.getElementById('confirm-ok').click()`)
await sleep(350)
const boardSize = await evaluate(`({ size: __figdesk.snapshot(), value: document.getElementById('view-board-size').value, toolbar: document.getElementById('board-size').value })`)

// R5: Options dropdowns.
await evaluate(`document.getElementById('menu-options').click()`)
await sleep(160)
const optionsMenu = await evaluate(`(() => {
  const popup = document.getElementById('popup-options');
  const rect = popup.getBoundingClientRect();
  return {
    fit: rect.bottom <= window.innerHeight && rect.top >= 0,
    bottom: Math.round(rect.bottom),
    selects: popup.querySelectorAll('[data-menu-select]').length,
  };
})()`)
await shot('preview-options-menu.png')
await evaluate(`document.getElementById('menu-options').click()`)
await menuSelect('options-theme', 'dark')
const theme = await evaluate(`({ theme: __figdesk.settings().theme, classOnHtml: document.documentElement.classList.contains('theme-dark'), value: document.getElementById('options-theme').value })`)
await menuSelect('options-theme', 'classic')
await menuSelect('options-language', 'zh')
const language = await evaluate(`({ language: __figdesk.settings().language, lang: document.documentElement.lang, label: document.querySelector('label[for="options-language"]').textContent })`)
await menuSelect('options-language', 'en')
await menuSelect('options-delay', '500')
const delay = await evaluate(`({ delay: __figdesk.settings().autoPlayDelay, value: document.getElementById('options-delay').value })`)

console.log(JSON.stringify({
  removed,
  overlayFirst,
  overlaySibling,
  nav1,
  nav2,
  pressed,
  unpressed,
  cjk,
  numberState,
  viewMenu,
  sizePrompt,
  boardSize,
  optionsMenu,
  theme,
  language,
  delay,
  errors,
}, null, 2))

ws.close()
