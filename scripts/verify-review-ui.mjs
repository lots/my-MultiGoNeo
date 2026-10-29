import fs from 'node:fs/promises'
import path from 'node:path'

const port = process.argv[2] ?? '9342'
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
  await sleep(180)
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

const sgfFile = await fs.readFile('study/my-Sabaki/sgf/ff4_ex_new.sgf', 'utf8')
await evaluate(`__figdesk.applySgfText(${JSON.stringify(sgfFile)}, 'ff4_ex_new.sgf')`)
await sleep(300)
await evaluate(`(() => {
  const node = [...__figdesk.tree.listNodes()].find((x) => x.data.N?.[0] === 'Style & text type');
  __figdesk.selectNode(node.id);
})()`)
await sleep(200)

// Sibling variations should be the children of the current node (A-F).
if (!await evaluate(`__figdesk.settings().showSiblings`)) await clickAction('toggle-siblings')
const node23 = await evaluate(`(() => ({
  snapshot: __figdesk.snapshot(),
  overlay: __figdesk.overlay(),
  settings: __figdesk.settings(),
}))()`)
await shot('preview-variation-node23.png')

await evaluate(`(() => {
  const node = [...__figdesk.tree.listNodes()].find((x) => x.data.N?.[0] === 'W d16');
  __figdesk.selectNode(node.id);
})()`)
await sleep(200)
const node24 = await evaluate(`({
  snapshot: __figdesk.snapshot(),
  overlay: __figdesk.overlay(),
})`)
await shot('preview-variation-node24.png')

// Read-only mode.
await clickAction('toggle-readonly')
await sleep(200)
const readOnly = await evaluate(`(() => ({
  active: __figdesk.readOnly(),
  menuChecked: document.querySelector('.menu-item[data-action="toggle-readonly"]').getAttribute('aria-checked'),
  editDisabled: document.getElementById('tool-edit').disabled,
  passDisabled: document.getElementById('tool-pass').disabled,
  saveDisabled: document.querySelector('.menu-item[data-action="save-sgf"]').disabled,
  saveAsDisabled: document.querySelector('.menu-item[data-action="save-sgf-as"]').disabled,
  sizeDisabled: document.getElementById('board-size').disabled,
  infoDisabled: document.getElementById('info-black').disabled,
  commentHidden: document.getElementById('comment-input').hidden,
  commentDisabled: document.getElementById('comment-input').disabled,
  previewHidden: document.getElementById('comment-preview').hidden,
  statusHidden: document.getElementById('status-readonly').hidden,
  statusText: document.getElementById('status-readonly').textContent.trim(),
  nodes: __figdesk.snapshot().nodes,
}))()`)
await shot('preview-readonly.png')
await evaluate(`__figdesk.playAt(8, 8)`)
await sleep(150)
const afterBlockedPlay = await evaluate(`__figdesk.snapshot()`)
await evaluate(`(() => {
  const node = __figdesk.tree.get(__figdesk.nodeId);
  if (node.children[0]) __figdesk.selectNode(node.children[0].id);
})()`)
await sleep(120)
const afterNav = await evaluate(`__figdesk.snapshot()`)
await evaluate(`document.getElementById('tab-comment').click()`)
await sleep(120)
const readOnlyComment = await evaluate(`({
  inputHidden: document.getElementById('comment-input').hidden,
  previewHidden: document.getElementById('comment-preview').hidden,
  previewText: document.getElementById('comment-preview').innerText.trim().slice(0, 40),
})`)
await clickAction('toggle-readonly')
await sleep(150)
const readOnlyOff = await evaluate(`({
  active: __figdesk.readOnly(),
  editDisabled: document.getElementById('tool-edit').disabled,
  infoDisabled: document.getElementById('info-black').disabled,
  commentHidden: document.getElementById('comment-input').hidden,
  previewHidden: document.getElementById('comment-preview').hidden,
})`)

// Game info fields.
const infoSgf = '(;GM[1]FF[4]SZ[19]GN[Test Game]PB[Black]BR[3d]BT[Team Black]PW[White]WR[2k]WT[Team White]KM[6.5]HA[0]RE[B+1.5]RU[Japanese]DT[2026-10-29]TM[3600]EV[Event]PC[Place]RO[3]US[User]SO[Source]GC[Game comment]CP[Copyright]AN[Annotation])'
await evaluate(`__figdesk.applySgfText(${JSON.stringify(infoSgf)}, 'info.sgf')`)
await sleep(250)
const infoValues = await evaluate(`(() => {
  const ids = ['info-game-name','info-black','info-black-rank','info-black-team','info-white','info-white-rank','info-white-team','info-komi','info-handicap','info-result','info-date','info-time','info-place','info-round','info-event','info-user','info-source','info-comment','info-copyright','info-annotation'];
  return Object.fromEntries(ids.map((id) => [id, document.getElementById(id).value]));
})()`)
await evaluate(`(() => {
  const input = document.getElementById('info-source');
  input.value = 'Edited source';
  input.dispatchEvent(new Event('change', { bubbles: true }));
})()`)
await sleep(150)
const infoUpdate = await evaluate(`__figdesk.tree.root.data.SO?.[0]`)
await shot('preview-game-info.png')

// Normal comment editing shows the editor and the rendered Markdown preview below it.
await evaluate(`document.getElementById('tab-comment').click()`)
await sleep(120)
const normalComment = await evaluate(`({
  inputHidden: document.getElementById('comment-input').hidden,
  previewHidden: document.getElementById('comment-preview').hidden,
  inputDisabled: document.getElementById('comment-input').disabled,
})`)

console.log(JSON.stringify({
  node23,
  node24,
  readOnly,
  afterBlockedPlay,
  afterNav,
  readOnlyComment,
  readOnlyOff,
  infoValues,
  infoUpdate,
  normalComment,
  errors,
}, null, 2))

await send('Browser.close')
ws.close()
