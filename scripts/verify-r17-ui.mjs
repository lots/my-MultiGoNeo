import fs from 'node:fs/promises'
import path from 'node:path'

const port = process.argv[2] ?? '9344'
const outDir = process.argv[3] ?? '.'
const url = process.argv[4] ?? `file:///${process.cwd().replaceAll('\\', '/')}/src/index.html?test=1`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const fastMoves = Array.from({ length: 30 }, (_, index) => {
  const x = String.fromCharCode(97 + (index % 19))
  const y = String.fromCharCode(97 + Math.floor(index / 19))
  return `${index % 2 === 0 ? 'B' : 'W'}[${x}${y}]`
}).join(';')
const fastSgf = `(;GM[1]FF[4]SZ[19];${fastMoves})`

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
  for (let i = 0; i < 100; i += 1) {
    if (await evaluate('Boolean(window.__figdesk)').catch(() => false)) return
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
await sleep(300)

await shot('preview-r17-layout.png')
const initial = await evaluate(`(() => {
  const info = document.getElementById('pane-info').getBoundingClientRect();
  const message = document.getElementById('pane-message').getBoundingClientRect();
  const rules = document.getElementById('info-rules').getBoundingClientRect();
  const black = document.getElementById('info-black').getBoundingClientRect();
  const blackRank = document.getElementById('info-black-rank').getBoundingClientRect();
  const blackTeam = document.getElementById('info-black-team').getBoundingClientRect();
  const white = document.getElementById('info-white').getBoundingClientRect();
  const whiteRank = document.getElementById('info-white-rank').getBoundingClientRect();
  const whiteTeam = document.getElementById('info-white-team').getBoundingClientRect();
  const visibleStatusLines = [...document.querySelectorAll('#statuslog .status-line')].filter((line) => {
    const rect = line.getBoundingClientRect();
    return rect.bottom > message.top && rect.top < message.bottom;
  }).length;
  return {
    infoHeight: Math.round(info.height),
    messageHeight: Math.round(message.height),
    rulesBottom: Math.round(rules.bottom),
    infoBottom: Math.round(info.bottom),
    rulesVisible: rules.bottom <= info.bottom + 1,
    black: Math.round(black.left), blackRank: Math.round(blackRank.left), blackTeam: Math.round(blackTeam.left),
    white: Math.round(white.left), whiteRank: Math.round(whiteRank.left), whiteTeam: Math.round(whiteTeam.left),
    visibleStatusLines,
    fastStep: __figdesk.settings().fastStep,
  };
})()`)

// R2: a single continuation must not become a sibling hint.
await evaluate(`__figdesk.applySgfText('(;GM[1]FF[4]SZ[13];B[dd])', 'single.sgf', { browser: true })`)
await sleep(200)
const singleBefore = await evaluate(`__figdesk.overlay()`)
if (!(await evaluate(`document.querySelector('.menu-item[data-action="toggle-siblings"]').getAttribute('aria-checked') === 'true'`))) {
  await evaluate(`document.querySelector('.menu-item[data-action="toggle-siblings"]').click()`)
  await sleep(150)
}
const singleOverlay = await evaluate(`__figdesk.overlay()`)
await evaluate(`__figdesk.applySgfText('(;GM[1]FF[4]SZ[13];B[dd](;W[cc])(;W[kk]))', 'branch.sgf', { browser: true })`)
await sleep(200)
const loadedMessage = await evaluate(`[...document.querySelectorAll('#statuslog .status-text')].at(-1)?.textContent`)
await evaluate(`__figdesk.selectNode(__figdesk.tree.root.children[0].id)`)
await sleep(150)
const branchOverlay = await evaluate(`__figdesk.overlay()`)

// R5: fast forward/rewind by the default 20 moves.
await evaluate(`__figdesk.applySgfText(${JSON.stringify(fastSgf)}, 'fast-steps.sgf')`)
await sleep(250)
await evaluate(`__figdesk.selectNode(__figdesk.rootId())`)
await evaluate(`document.getElementById('tool-forward').click()`)
await sleep(300)
const fastForward = await evaluate(`({ moveNumber: __figdesk.snapshot().moveNumber, fastStep: __figdesk.settings().fastStep })`)
await evaluate(`document.getElementById('tool-rewind').click()`)
await sleep(300)
const fastRewind = await evaluate(`({ moveNumber: __figdesk.snapshot().moveNumber })`)

// R7: Delete Move works from both Play and Edit modes.
await evaluate(`__figdesk.applySgfText('(;GM[1]FF[4]SZ[13](;B[dd])(;B[pp]))', 'delete.sgf', { browser: true })`)
await sleep(200)
await evaluate(`(() => {
  const first = __figdesk.tree.root.children[0];
  __figdesk.selectNode(first.id);
})()`)
await evaluate(`document.getElementById('tool-delete').click()`)
await sleep(200)
const deleteInPlay = await evaluate(`({ nodes: __figdesk.snapshot().nodes, mode: __figdesk.mode })`)
await evaluate(`(() => {
  const remaining = __figdesk.tree.root.children[0];
  __figdesk.selectNode(remaining.id);
  __figdesk.toggleEditMode();
})()`)
await sleep(150)
const deleteButtonInEdit = await evaluate(`({ disabled: document.getElementById('tool-delete').disabled, edit: __figdesk.mode })`)
await evaluate(`document.getElementById('tool-delete').click()`)
await sleep(200)
const deleteInEdit = await evaluate(`({ nodes: __figdesk.snapshot().nodes, mode: __figdesk.mode })`)

// R6: three-line comment editor, visible rendered Markdown, persisted height.
await evaluate(`__figdesk.applySgfText('(;GM[1]FF[4]SZ[13]C[**bold** and *italic*])', 'comment.sgf')`)
await sleep(200)
await evaluate(`__figdesk.setTab('comment')`)
await sleep(200)
const commentInitial = await evaluate(`(() => {
  const input = document.getElementById('comment-input');
  const preview = document.getElementById('comment-preview');
  return {
    rows: input.rows,
    height: Math.round(input.getBoundingClientRect().height),
    previewHidden: preview.hidden,
    previewHtml: preview.innerHTML,
    editorValue: input.value,
  };
})()`)
await shot('preview-comment.png')
await evaluate(`(() => {
  const input = document.getElementById('comment-input');
  input.style.height = '120px';
})()`)
await sleep(350)
const commentHeightSaved = await evaluate(`__figdesk.settings().commentHeight`)
await evaluate(`document.getElementById('tab-info').click()`)
await sleep(100)
await send('Page.reload', { ignoreCache: true })
await waitForApp()
await sleep(350)
const commentHeightReloaded = await evaluate(`(() => ({
  setting: __figdesk.settings().commentHeight,
  inlineHeight: document.getElementById('comment-input').style.height,
  rows: document.getElementById('comment-input').rows,
}))()`)

// Save As prefills the current file name; Save then reuses the chosen handle.
await evaluate(`__figdesk.applySgfText('(;GM[1]FF[4]SZ[13])', 'existing.sgf')`)
await evaluate(`(() => {
  window.__pickerCalls = 0;
  window.__pickerOptions = null;
  window.__savedText = '';
  const handle = {
    name: 'picked-location.sgf',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    createWritable: async () => ({
      write: async (text) => { window.__savedText = text; },
      close: async () => {},
    }),
  };
  Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true,
    writable: true,
    value: async (options) => { window.__pickerCalls += 1; window.__pickerOptions = options; return handle; },
  });
})()`)
await evaluate(`document.querySelector('.menu-item[data-action="save-sgf-as"]').click()`)
await sleep(350)
const pickerSave = await evaluate(`({
  calls: window.__pickerCalls,
  suggestedName: window.__pickerOptions?.suggestedName,
  pickerId: window.__pickerOptions?.id,
  message: [...document.querySelectorAll('#statuslog .status-text')].at(-1)?.textContent,
  filePath: __figdesk.snapshot().filePath,
  wroteSgf: window.__savedText.includes('GM[1]'),
  savedLength: window.__savedText.length,
})`)
await evaluate(`document.querySelector('.menu-item[data-action="save-sgf"]').click()`)
await sleep(300)
const pickerReuse = await evaluate(`({ calls: window.__pickerCalls, filePath: __figdesk.snapshot().filePath })`)
await evaluate(`document.querySelector('.menu-item[data-action="save-sgf-as"]').click()`)
await sleep(300)
const pickerRetained = await evaluate(`({
  calls: window.__pickerCalls,
  startIn: Boolean(window.__pickerOptions?.startIn),
  suggestedName: window.__pickerOptions?.suggestedName,
  filePath: __figdesk.snapshot().filePath,
})`)
const saveMessage = pickerSave.message
const browserMessage = loadedMessage

console.log(JSON.stringify({
  initial,
  singleBefore,
  singleOverlay,
  branchOverlay,
  loadedMessage: browserMessage,
  fastForward,
  fastRewind,
  deleteInPlay,
  deleteButtonInEdit,
  deleteInEdit,
  commentInitial,
  commentHeightSaved,
  commentHeightReloaded,
  browserMessage,
  saveMessage,
  pickerSave,
  pickerReuse,
  pickerRetained,
  pickerId: pickerSave.pickerId,
  errors,
}, null, 2))

await send('Browser.close')
ws.close()
