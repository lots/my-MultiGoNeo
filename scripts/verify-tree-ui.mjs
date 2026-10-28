import fs from 'node:fs/promises'
import path from 'node:path'

const port = process.argv[2] ?? '9338'
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
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    errors.push(message.params.entry.text)
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

async function clickAt(x, y, button = 'left') {
  const buttons = button === 'left' ? 1 : 2
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons, clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1 })
  await sleep(100)
}

async function clickBoard(x, y, button = 'left') {
  const point = await evaluate(`__figdesk.pointFor(${x}, ${y})`)
  await clickAt(point.x, point.y, button)
}

async function key(key, code, vk) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  await sleep(80)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
for (let i = 0; i < 100; i += 1) {
  const ready = await evaluate(`Boolean(window.__figdesk)`).catch(() => false)
  if (ready) break
  await sleep(100)
}
await sleep(500)

const initial = await evaluate(`({
  snapshot: __figdesk.snapshot(),
  treeNodes: document.querySelectorAll('.tree-node').length,
  infoScroll: { client: document.querySelector('#game-info').clientHeight, scroll: document.querySelector('#game-info').scrollHeight },
  editbarHidden: document.getElementById('editbar').hidden,
  canvas: (() => { const r = document.getElementById('board').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; })(),
})`)

// Play a main line, then create a variation from the root.
await clickBoard(3, 9) // D4
const afterFirst = await evaluate(`__figdesk.snapshot()`)
await clickBoard(9, 3) // K10
const afterSecond = await evaluate(`__figdesk.snapshot()`)
await evaluate(`__figdesk.selectNode(__figdesk.rootId())`)
await clickBoard(3, 3) // D10 -> second root child
const afterVariation = await evaluate(`({
  snapshot: __figdesk.snapshot(),
  rootChildren: __figdesk.tree.root.children.length,
  treeNodes: document.querySelectorAll('.tree-node').length,
})`)

await evaluate(`document.querySelector('#tool-undo').click()`)
await sleep(120)
const afterUndo = await evaluate(`({ snapshot: __figdesk.snapshot(), nodes: document.querySelectorAll('.tree-node').length })`)
await evaluate(`document.querySelector('#tool-redo').click()`)
await sleep(120)
const afterRedo = await evaluate(`({ snapshot: __figdesk.snapshot(), nodes: document.querySelectorAll('.tree-node').length })`)

await evaluate(`document.querySelector('.menu-item[data-action="delete-node"]').click()`)
await sleep(120)
const afterDelete = await evaluate(`({ snapshot: __figdesk.snapshot(), nodes: document.querySelectorAll('.tree-node').length })`)
await evaluate(`document.querySelector('#tool-undo').click()`)
await sleep(120)
const afterUndoDelete = await evaluate(`({ snapshot: __figdesk.snapshot(), nodes: document.querySelectorAll('.tree-node').length })`)

// Edit mode: setup stone, cross mark, line, dim, number, label, then erase a mark.
await evaluate(`__figdesk.selectNode(__figdesk.rootId()); __figdesk.toggleEditMode()`)
await sleep(180)
const editMode = await evaluate(`({ mode: __figdesk.mode, editbarHidden: document.getElementById('editbar').hidden })`)
await evaluate(`__figdesk.selectTool('stone_1')`)
await clickBoard(6, 6) // G7
await evaluate(`__figdesk.selectTool('cross')`)
await clickBoard(5, 6) // F7
await evaluate(`__figdesk.selectTool('line')`)
await clickBoard(0, 0)
await clickBoard(0, 4)
await evaluate(`document.querySelector('.color-swatch[data-color="red"]').click()`)
await clickBoard(7, 0)
await clickBoard(7, 4)
await evaluate(`__figdesk.selectTool('dim')`)
await clickBoard(10, 10)
await clickBoard(12, 12)
await evaluate(`document.querySelector('.color-swatch[data-color="blue"]').click()`)
await clickBoard(8, 0)
await clickBoard(10, 2)
await evaluate(`__figdesk.selectTool('number')`)
await clickBoard(4, 4)
await evaluate(`__figdesk.selectTool('label')`)
const labelPoint = await evaluate(`__figdesk.pointFor(2, 2)`)
await clickAt(labelPoint.x, labelPoint.y)
await sleep(150)
const labelOpen = await evaluate(`document.getElementById('label-dialog').open`)
if (labelOpen) {
  await evaluate(`document.getElementById('label-input').value = 'A'`)
  await evaluate(`document.getElementById('label-ok').click()`)
  await sleep(150)
}
const markup = await evaluate(`({ data: __figdesk.nodeData(), boardSize: __figdesk.snapshot() })`)
await shot('preview-edit.png')

// Right-click removes the cross at F7.
await clickBoard(5, 6, 'right')
const afterErase = await evaluate(`__figdesk.nodeData()`)
await evaluate(`__figdesk.toggleEditMode()`)
await sleep(120)

// Comments tab.
await evaluate(`__figdesk.selectNode(__figdesk.rootId()); document.getElementById('tab-comment').click()`)
await sleep(100)
await evaluate(`(() => {
  const input = document.getElementById('comment-input');
  input.value = 'Root **comment** with a line\\nand a second line.';
  input.dispatchEvent(new Event('change', { bubbles: true }));
})()`)
await sleep(150)
const comment = await evaluate(`({
  data: __figdesk.nodeData(),
  preview: document.getElementById('comment-preview').innerText,
  active: document.getElementById('tab-comment').classList.contains('is-active'),
})`)
await shot('preview-comment.png')

// Lossless SGF load with unknown property + variation.
const load = await evaluate(`(() => {
  const text = '(;GM[1]FF[4]SZ[13]PB[Alice]ZZ[keepme];B[dd](;W[mm]C[var one])(;W[dm]))';
  __figdesk.applySgfText(text, 'test.sgf');
  return {
    snapshot: __figdesk.snapshot(),
    root: __figdesk.nodeData(),
    rootChildren: __figdesk.tree.root.children.length,
    sgf: __figdesk.sgfText(),
    fileLabel: document.getElementById('file-label').textContent,
  };
})()`)
await sleep(150)

// Menu screenshot.
await evaluate(`document.getElementById('menu-file').click()`)
await sleep(100)
const menu = await evaluate(`({
  expanded: document.getElementById('menu-file').getAttribute('aria-expanded'),
  hidden: document.getElementById('popup-file').hidden,
  items: [...document.querySelectorAll('#popup-file .menu-item')].length,
})`)

await key('Escape', 'Escape', 27)

const demo = '(;GM[1]FF[4]SZ[13]PB[Black]PW[White]KM[6.5]AB[dj][jj][gg][dd][jd]C[Five-stone setup];B[fg];W[hg](;B[cf])(;B[fc]))'
await evaluate(`document.getElementById('statuslog').replaceChildren()`)
await evaluate(`(() => {
  __figdesk.applySgfText(${JSON.stringify(demo)}, 'my-Fig-test.sgf');
  const root = __figdesk.tree.root;
  const leaf = root.children[0].children[0].children[0];
  __figdesk.selectNode(leaf.id);
})()`)
await sleep(250)
await shot('preview.png')

console.log(JSON.stringify({
  initial,
  afterFirst,
  afterSecond,
  afterVariation,
  afterUndo,
  afterRedo,
  afterDelete,
  afterUndoDelete,
  editMode,
  markup,
  afterErase,
  comment,
  load,
  menu,
  errors,
}, null, 2))

await send('Browser.close')
ws.close()
