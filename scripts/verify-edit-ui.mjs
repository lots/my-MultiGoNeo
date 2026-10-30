import fs from 'node:fs/promises'
import path from 'node:path'

const port = process.argv[2] ?? '9341'
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
async function clickAction(action) {
  await evaluate(`document.querySelector('.menu-item[data-action="${action}"]').click()`)
  await sleep(160)
}
async function waitForApp() {
  for (let i = 0; i < 100; i += 1) {
    if (await evaluate(`Boolean(window.__figdesk)`).catch(() => false)) return
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
await sleep(500)

const sgf = '(;GM[1]FF[4]SZ[13]PB[Black]PW[White];B[dd];W[pp];B[dp];W[pd];B[jj];W[jd];B[dj];W[pj];B[qq];W[cc];B[mm];W[kk](;B[ef])(;B[fe]))'
await evaluate(`(() => {
  __figdesk.applySgfText(${JSON.stringify(sgf)}, 'edit-test.sgf');
  let leaf = __figdesk.tree.root;
  while (leaf.children.length) leaf = leaf.children[0];
  __figdesk.selectNode(leaf.id);
})()`)
await sleep(300)

const initial = await evaluate(`({
  lineWidths: __figdesk.lineWidths(),
  snapshot: __figdesk.snapshot(),
  settings: __figdesk.settings(),
  paneHeights: {
    info: Math.round(document.getElementById('pane-info').getBoundingClientRect().height),
    tree: Math.round(document.getElementById('pane-moves').getBoundingClientRect().height),
    message: Math.round(document.getElementById('pane-message').getBoundingClientRect().height),
  },
})`)
await shot('preview-last-move.png')

// Edit Game Info should maximize the right info panel and focus the first field.
await clickAction('focus-info')
await sleep(350)
const infoFocus = await evaluate(`(() => {
  const info = document.getElementById('pane-info').getBoundingClientRect();
  const board = document.getElementById('pane-board').getBoundingClientRect();
  const tree = document.getElementById('pane-moves').getBoundingClientRect();
  const message = document.getElementById('pane-message').getBoundingClientRect();
  const right = document.getElementById('right-column').getBoundingClientRect();
  return {
    infoWidth: Math.round(info.width),
    boardWidth: Math.round(board.width),
    rightWidth: Math.round(right.width),
    infoHeight: Math.round(info.height),
    treeHeight: Math.round(tree.height),
    messageHeight: Math.round(message.height),
    infoTab: document.getElementById('tab-info').getAttribute('aria-selected'),
    activeElement: document.activeElement?.id,
    doneVisible: !document.getElementById('info-done').hidden,
  };
})()`)
await shot('preview-info-focus.png')
await evaluate(`document.getElementById('info-done').click()`)
await sleep(350)
const infoRestored = await evaluate(`(() => {
  const info = document.getElementById('pane-info').getBoundingClientRect();
  const board = document.getElementById('pane-board').getBoundingClientRect();
  const tree = document.getElementById('pane-moves').getBoundingClientRect();
  const message = document.getElementById('pane-message').getBoundingClientRect();
  return {
    infoWidth: Math.round(info.width),
    boardWidth: Math.round(board.width),
    infoHeight: Math.round(info.height),
    treeHeight: Math.round(tree.height),
    messageHeight: Math.round(message.height),
    doneHidden: document.getElementById('info-done').hidden,
  };
})()`)
await shot('preview-info-restored.png')

// R5: number counts.
await evaluate(`document.getElementById('menu-view').click()`)
await sleep(120)
const viewMenu = await evaluate(`(() => {
  const popup = document.getElementById('popup-view');
  const rect = popup.getBoundingClientRect();
  return {
    items: popup.querySelectorAll('.menu-item').length,
    labels: [...popup.querySelectorAll('.menu-label')].map((x) => x.textContent.trim()),
    bottom: Math.round(rect.bottom),
    viewport: window.innerHeight,
  };
})()`)
await shot('preview-view-menu.png')
await evaluate(`document.getElementById('menu-view').click()`)
async function setNumberSelect(value) {
  await evaluate(`(() => {
    const select = document.getElementById('view-numbers');
    select.value = '${value}';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`)
  await sleep(160)
}
await setNumberSelect('all')
const allNumbers = await evaluate(`({ limit: __figdesk.settings().moveNumberLimit, select: document.getElementById('view-numbers').value })`)
await setNumberSelect('10')
const tenNumbers = await evaluate(`({ limit: __figdesk.settings().moveNumberLimit, select: document.getElementById('view-numbers').value })`)
await setNumberSelect('none')
const noNumbers = await evaluate(`({ limit: __figdesk.settings().moveNumberLimit, select: document.getElementById('view-numbers').value })`)
await setNumberSelect('10')
await shot('preview-move-numbers.png')

// R2: each right-hand pane can be squeezed.
await clickAction('reset-layout')
const resetHeights = await evaluate(`(() => ({
  info: Math.round(document.getElementById('pane-info').getBoundingClientRect().height),
  tree: Math.round(document.getElementById('pane-moves').getBoundingClientRect().height),
  message: Math.round(document.getElementById('pane-message').getBoundingClientRect().height),
}))()`)
async function nudge(splitter, key, count) {
  await evaluate(`(() => {
    const el = document.getElementById('${splitter}');
    for (let i = 0; i < ${count}; i += 1) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true }));
    }
  })()`)
  await sleep(250)
}
await nudge('splitter-h', 'ArrowUp', 50)
const infoSmall = await evaluate(`(() => ({
  info: Math.round(document.getElementById('pane-info').getBoundingClientRect().height),
  tree: Math.round(document.getElementById('pane-moves').getBoundingClientRect().height),
  message: Math.round(document.getElementById('pane-message').getBoundingClientRect().height),
}))()`)
await clickAction('reset-layout')
await nudge('splitter-m', 'ArrowDown', 50)
const messageSmall = await evaluate(`(() => ({
  info: Math.round(document.getElementById('pane-info').getBoundingClientRect().height),
  tree: Math.round(document.getElementById('pane-moves').getBoundingClientRect().height),
  message: Math.round(document.getElementById('pane-message').getBoundingClientRect().height),
}))()`)
await clickAction('reset-layout')
await nudge('splitter-h', 'ArrowDown', 60)
const treeSmall = await evaluate(`(() => ({
  info: Math.round(document.getElementById('pane-info').getBoundingClientRect().height),
  tree: Math.round(document.getElementById('pane-moves').getBoundingClientRect().height),
  message: Math.round(document.getElementById('pane-message').getBoundingClientRect().height),
}))()`)
await clickAction('reset-layout')

// R3: Edit menu and tree operations.
await evaluate(`document.getElementById('menu-edit').click()`)
await sleep(120)
const editMenu = await evaluate(`(() => {
  const popup = document.getElementById('popup-edit');
  return {
    items: popup.querySelectorAll('.menu-item').length,
    actions: [...popup.querySelectorAll('.menu-item')].map((x) => x.dataset.action),
    labels: [...popup.querySelectorAll('.menu-label')].map((x) => x.textContent.trim()),
    deleteCount: popup.querySelectorAll('.menu-item[data-action="delete-node"]').length,
    cutAfterCount: popup.querySelectorAll('.menu-item[data-action="cut-after"]').length,
    cutCurrentCount: popup.querySelectorAll('.menu-item[data-action="cut-variation"]').length,
    bottom: Math.round(popup.getBoundingClientRect().bottom),
  };
})()`)
await shot('preview-edit-menu.png')
await evaluate(`document.getElementById('menu-edit').click()`)

const nodesBeforeInsert = await evaluate(`__figdesk.snapshot().nodes`)
await clickAction('insert-node')
const afterInsert = await evaluate(`__figdesk.snapshot()`)
await evaluate(`document.querySelector('#tool-undo').click()`)
await sleep(120)

const nodesBeforeDuplicate = await evaluate(`__figdesk.snapshot().nodes`)
await clickAction('duplicate-node')
const afterDuplicate = await evaluate(`__figdesk.snapshot()`)
await evaluate(`document.querySelector('#tool-undo').click()`)
await sleep(120)

const copySource = await evaluate(`(() => {
  let leaf = __figdesk.tree.root;
  while (leaf.children.length) leaf = leaf.children[0];
  __figdesk.selectNode(leaf.id);
  return __figdesk.snapshot();
})()`)
await clickAction('copy-variation')
await sleep(150)
await clickAction('paste-variation')
await sleep(250)
const afterPaste = await evaluate(`__figdesk.snapshot()`)
await evaluate(`document.querySelector('#tool-undo').click()`)
await sleep(120)

const flattenBefore = await evaluate(`__figdesk.snapshot()`)
await clickAction('flatten-variation')
const flattenAfter = await evaluate(`__figdesk.snapshot()`)
await evaluate(`document.querySelector('#tool-undo').click()`)
await sleep(120)

const cutBefore = await evaluate(`__figdesk.snapshot()`)
await clickAction('cut-variation')
const cutAfter = await evaluate(`__figdesk.snapshot()`)
await evaluate(`document.querySelector('#tool-undo').click()`)
await sleep(120)

const cutAfterBefore = await evaluate(`(() => {
  const branch = [...__figdesk.tree.listNodes()].find((item) => item.children.length > 1);
  __figdesk.selectNode(branch.id);
  return { branchId: branch.id, snapshot: __figdesk.snapshot(), children: __figdesk.childCount() };
})()`)
await clickAction('cut-after')
await sleep(200)
const cutAfterResult = await evaluate(`({ snapshot: __figdesk.snapshot(), children: __figdesk.childCount() })`)
await clickAction('paste-variation')
await sleep(250)
const cutAfterPasted = await evaluate(`(() => {
  const branch = __figdesk.tree.get(${cutAfterBefore.branchId});
  return { snapshot: __figdesk.snapshot(), branchChildren: branch?.children.length ?? 0 };
})()`)
await evaluate(`document.querySelector('#tool-undo').click()`)
await sleep(100)
await evaluate(`document.querySelector('#tool-undo').click()`)
await sleep(100)

console.log(JSON.stringify({
  initial,
  infoFocus,
  infoRestored,
  viewMenu,
  allNumbers,
  tenNumbers,
  noNumbers,
  resetHeights,
  infoSmall,
  messageSmall,
  treeSmall,
  editMenu,
  nodesBeforeInsert,
  afterInsert,
  nodesBeforeDuplicate,
  afterDuplicate,
  copySource,
  afterPaste,
  flattenBefore,
  flattenAfter,
  cutBefore,
  cutAfter,
  cutAfterBefore,
  cutAfterResult,
  cutAfterPasted,
  errors,
}, null, 2))

await send('Browser.close')
ws.close()
