import fs from 'node:fs/promises'
import path from 'node:path'

// Drives the Play > Estimate / Play > Score flow in a DevTools-enabled Chromium.
//
//   node scripts/verify-count-ui.mjs 9347 . "file:///.../src/index.html?test=1"

const port = process.argv[2] ?? '9347'
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
  if (message.method === 'Page.javascriptDialogOpening') {
    // The app guards unsaved games with a beforeunload dialog; accept it so the
    // script can re-navigate between runs.
    ws.send(JSON.stringify({ id: seq++, method: 'Page.handleJavaScriptDialog', params: { accept: true } }))
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

async function shot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' })
  await fs.writeFile(path.join(outDir, name), Buffer.from(result.data, 'base64'))
}

async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(120)
}

const metrics = (width, height) => send('Emulation.setDeviceMetricsOverride', {
  width, height, deviceScaleFactor: 1, mobile: false,
})

await send('Page.enable')
await send('Runtime.enable')
await metrics(1440, 1024)
await send('Page.navigate', { url })
await sleep(400)

let ready = false
for (let i = 0; i < 100; i += 1) {
  ready = await evaluate('Boolean(window.__figdesk && window.MultiGoScoring)').catch(() => false)
  if (ready) break
  await sleep(150)
}
if (!ready) throw new Error('MultiGo Neo did not initialise')

const letter = (index) => String.fromCharCode(97 + index)
const column = (x) => Array.from({ length: 13 }, (_, y) => `[${letter(x)}${letter(y)}]`).join('')

async function selectLeaf() {
  await evaluate(`(() => {
    let leaf = window.__figdesk.tree.root;
    while (leaf.children.length) leaf = leaf.children[0];
    window.__figdesk.selectNode(leaf.id);
  })()`)
  await sleep(250)
}

// Bowls are live during play: Black captures one White stone with this sequence.
const captureSgf = '(;GM[1]FF[4]SZ[9]RU[Japanese]PB[Black]PW[White]KM[6.5]'
  + ';B[ed];W[ee];B[ef];W[ad];B[de];W[ae];B[fe])'
await evaluate(`__figdesk.applySgfText(${JSON.stringify(captureSgf)}, 'captures.sgf')`)
await selectLeaf()
const playBowls = await evaluate(`(() => {
  const c = __figdesk.count().bowls;
  return {
    visible: !document.getElementById('bowl-black').hidden,
    black: c.black,
    white: c.white,
    blackStones: document.querySelectorAll('#bowl-black-stones .bowl-stone').length,
    whiteStones: document.querySelectorAll('#bowl-white-stones .bowl-stone').length,
    status: document.getElementById('status-captures').textContent,
  };
})()`)
await shot('preview/preview-bowls.png')

// The bowls must hug the board, including after a pane resize.
const bowlGapWide = await evaluate(`(() => {
  const board = document.getElementById('board').getBoundingClientRect();
  const left = document.getElementById('bowl-black').getBoundingClientRect();
  const right = document.getElementById('bowl-white').getBoundingClientRect();
  return { left: Math.round(board.left - left.right), right: Math.round(right.left - board.right) };
})()`)
await metrics(1200, 900)
await sleep(350)
const bowlGapResized = await evaluate(`(() => {
  const board = document.getElementById('board').getBoundingClientRect();
  const left = document.getElementById('bowl-black').getBoundingClientRect();
  const right = document.getElementById('bowl-white').getBoundingClientRect();
  return {
    left: Math.round(board.left - left.right),
    right: Math.round(right.left - board.right),
    shown: !document.getElementById('bowl-black').hidden,
  };
})()`)
await metrics(1440, 1024)
await sleep(300)

// The mirror case: White captures a Black stone, so the White bowl shows a
// black stone (the contrast case that used to vanish on the dark bowl).
const whiteCaptureSgf = '(;GM[1]FF[4]SZ[9]RU[Japanese]PB[Black]PW[White]KM[6.5]'
  + ';B[aa];W[ed];B[ee];W[ef];B[ab];W[de];B[ac];W[fe])'
await evaluate(`__figdesk.applySgfText(${JSON.stringify(whiteCaptureSgf)}, 'white-captures.sgf')`)
await selectLeaf()
const whiteBowls = await evaluate(`(() => {
  const c = __figdesk.count().bowls;
  return {
    visible: !document.getElementById('bowl-white').hidden,
    black: c.black,
    white: c.white,
    blackStones: document.querySelectorAll('#bowl-black-stones .bowl-stone').length,
    whiteStones: document.querySelectorAll('#bowl-white-stones .bowl-stone').length,
    status: document.getElementById('status-captures').textContent,
  };
})()`)
await shot('preview/preview-bowls-white.png')

// Chinese rules do not use prisoners, so the bowls stay hidden during play.
const chineseSgf = '(;GM[1]FF[4]SZ[9]RU[Chinese]PB[Black]PW[White];B[ed];W[ee];B[ef])'
await evaluate(`__figdesk.applySgfText(${JSON.stringify(chineseSgf)}, 'chinese.sgf')`)
await selectLeaf()
const chineseBowls = await evaluate(`({
  visible: !document.getElementById('bowl-black').hidden,
  white: __figdesk.count().bowls.white,
})`)

// Play > Estimate and Play > Score, driven through the real menus.
const estimateSgf = '(;GM[1]FF[4]SZ[9]KM[6.5]RU[Japanese]PB[Black]PW[White]'
  + 'AB' + [
    'aa', 'ba', 'ca', 'da', 'ea', 'fa', 'ga', 'ha', 'ia',
    'ab', 'ib', 'ac', 'ic', 'ad', 'id', 'ae', 'ie', 'af', 'if', 'ag', 'ig',
    'ah', 'ih', 'ai', 'bi', 'ci', 'di', 'ei', 'fi', 'gi', 'hi', 'ii',
  ].map((point) => `[${point}]`).join('')
  + 'AW[ee])'
await evaluate(`__figdesk.applySgfText(${JSON.stringify(estimateSgf)}, 'estimate.sgf')`)
await sleep(300)

const menuEstimate = await evaluate(`(() => {
  document.getElementById('menu-play').click();
  document.querySelector('#popup-play [data-action="estimate"]').click();
  const c = __figdesk.count();
  return {
    active: c.active,
    mode: c.mode,
    dead: c.dead,
    result: document.getElementById('count-result').textContent,
    title: document.querySelector('.count-title').textContent,
    hint: document.querySelector('.count-hint').textContent,
  };
})()`)
await sleep(200)
await shot('preview/preview-estimate.png')

const menuScore = await evaluate(`(() => {
  document.getElementById('menu-play').click();
  document.querySelector('#popup-play [data-action="score"]').click();
  const c = __figdesk.count();
  return {
    active: c.active,
    mode: c.mode,
    dead: c.dead,
    result: document.getElementById('count-result').textContent,
    title: document.querySelector('.count-title').textContent,
    hint: document.querySelector('.count-hint').textContent,
  };
})()`)
await sleep(200)
await shot('preview/preview-score.png')

// The old Count Territory command must be gone; only Estimate / Score remain.
const legacyCountRemoved = await evaluate(`(() => {
  __figdesk.exitCount();
  return {
    menuItem: Boolean(document.querySelector('[data-action="count-territory"]')),
    estimate: Boolean(document.querySelector('[data-action="estimate"]')),
    score: Boolean(document.querySelector('[data-action="score"]')),
  };
})()`)

const sgf = `(;GM[1]FF[4]SZ[13]KM[6.5]RU[Japanese]PB[Black]PW[White]`
  + `AB${column(3)}AW${column(8)}[bh])`

await evaluate(`__figdesk.applySgfText(${JSON.stringify(sgf)}, 'count-test.sgf')`)
await sleep(300)

const initial = await evaluate(`(() => {
  __figdesk.enterCount('japanese');
  const c = __figdesk.count();
  return {
    rules: c.rules,
    result: document.getElementById('count-result').textContent,
    blackTerritory: document.getElementById('count-black-territory').textContent,
    whiteTerritory: document.getElementById('count-white-territory').textContent,
    dame: document.getElementById('count-dame').textContent,
    prisoners: [document.getElementById('count-black-prisoners').textContent, document.getElementById('count-white-prisoners').textContent],
    panelOpen: !document.getElementById('count-card').hidden,
    bowls: c.bowls,
  };
})()`)
await shot('preview/preview-count-japanese.png')

// Toggle the lone white stone at (1,7) with a real mouse click on the board.
const point = await evaluate('__figdesk.pointFor(1, 7)')
await clickAt(point.x, point.y)
await sleep(200)
const afterDead = await evaluate(`(() => {
  const c = __figdesk.count();
  return {
    dead: c.dead,
    blackTerritory: document.getElementById('count-black-territory').textContent,
    blackPrisoners: document.getElementById('count-black-prisoners').textContent,
    result: document.getElementById('count-result').textContent,
    bowlBlack: c.bowls.black,
    bowlWhite: c.bowls.white,
    bowlBlackStones: document.querySelectorAll('#bowl-black-stones .bowl-stone').length,
    bowlWhiteStones: document.querySelectorAll('#bowl-white-stones .bowl-stone').length,
  };
})()`)
await shot('preview/preview-count-dead.png')

const chinese = await evaluate(`(() => {
  const select = document.getElementById('count-rules');
  select.value = 'chinese';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  const c = __figdesk.count();
  return {
    result: document.getElementById('count-result').textContent,
    prisonersHidden: getComputedStyle(document.querySelector('.count-jp')).display === 'none',
    stonesShown: getComputedStyle(document.querySelector('.count-cn')).display !== 'none',
    bowlsHidden: document.getElementById('bowl-black').hidden,
    rules: c.rules,
  };
})()`)
await sleep(200)
await shot('preview/preview-count-chinese.png')

const written = await evaluate(`(() => {
  document.getElementById('count-write').click();
  const re = window.__figdesk.tree.root.data.RE;
  document.getElementById('count-done').click();
  return {
    re,
    active: window.__figdesk.count().active,
    cardHidden: document.getElementById('count-card').hidden,
    sgfHasRe: window.__figdesk.sgfText().includes('RE[' + re + ']'),
  };
})()`)

// Escape closes counting.
await evaluate(`__figdesk.enterCount('japanese')`)
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await sleep(200)
const escaped = await evaluate(`({ active: __figdesk.count().active, cardHidden: document.getElementById('count-card').hidden })`)

// Narrow pane: bowls must hide themselves.
await metrics(520, 900)
await sleep(400)
const narrow = await evaluate(`(() => {
  __figdesk.enterCount('japanese');
  return {
    paneWidth: Math.round(document.getElementById('pane-board').getBoundingClientRect().width),
    shown: !document.getElementById('bowl-black').hidden,
    result: document.getElementById('count-result').textContent,
  };
})()`)
await evaluate(`__figdesk.exitCount()`)
await metrics(1440, 1024)
await sleep(300)

// Two consecutive passes must offer counting.
const doublePass = await evaluate(`(async () => {
  __figdesk.startGame({ width: 9, height: 9 });
  __figdesk.passTurn();
  __figdesk.passTurn();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const dialog = document.getElementById('confirm-dialog');
  const message = document.getElementById('confirm-message').textContent;
  const open = dialog.open;
  if (open) document.getElementById('confirm-ok').click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const counting = window.__figdesk.count().active;
  if (counting) window.__figdesk.exitCount();
  return { open, message, counting };
})()`)

// Small boards must keep edge stones inside the canvas.
const smallBoards = await evaluate(`(async () => {
  const results = {};
  for (const size of [8, 4, 2]) {
    __figdesk.startGame({ width: size, height: size });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const view = __figdesk.boardView;
    const radius = view.spacing * 0.465;
    results[size] = {
      margin: Math.round(view.margin),
      radius: Math.round(radius * 10) / 10,
      clearance: Math.round((view.margin - radius) * 10) / 10,
      labelClearance: Math.round((view.labelOffset - radius) * 10) / 10,
    };
  }
  return results;
})()`)
await evaluate(`__figdesk.startGame({ width: 8, height: 8 })`)
await evaluate(`__figdesk.applySgfText('(;GM[1]FF[4]SZ[8]AB[aa][ah][ha][hh])', 'edges.sgf')`)
await sleep(350)
await shot('preview/preview-8x8.png')

console.log(JSON.stringify({ playBowls, bowlGapWide, bowlGapResized, whiteBowls, chineseBowls, menuEstimate, menuScore, legacyCountRemoved, initial, afterDead, chinese, written, escaped, narrow, doublePass, smallBoards, errors }, null, 2))
ws.close()
process.exit(errors.length === 0 ? 0 : 1)
