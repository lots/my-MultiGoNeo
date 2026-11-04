import fs from 'node:fs/promises';
import path from 'node:path';

// Drives the Engine tab against scripts/fixtures/fake-gtp-engine.js.
// Usage: node scripts/verify-engine-ui.mjs <port> <outDir> <nodePath> <fixturePath> [configPath]
const port = process.argv[2] ?? '9555';
const outDir = process.argv[3] ?? 'preview';
const nodePath = process.argv[4];
const fixturePath = process.argv[5];
const configPath = process.argv[6] ?? null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findTarget() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(150);
  }
  throw new Error('No DevTools target');
}

const page = await findTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
let seq = 1;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    if (!message.params.entry.text.includes('favicon')) errors.push(message.params.entry.text);
  }
});
function send(method, params = {}) {
  const id = seq++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function shot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(outDir, name), Buffer.from(result.data, 'base64'));
}
async function waitFor(expression, label, tries = 200) {
  for (let i = 0; i < tries; i += 1) {
    if (await evaluate(expression).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const jsErrors = [];
await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await sleep(500);

const originalConfig = configPath ? await fs.readFile(configPath, 'utf8') : null;

console.log('engine module:', await evaluate('typeof window.MultiGoEngine'));
console.log('snapshot:', await evaluate('JSON.stringify(window.MultiGoEngine ? Object.keys(window.MultiGoEngine) : null)'));

// Start from a clean slate if a previous run left an engine attached.
const startStatus = await evaluate(`document.getElementById('engine-status').textContent`);
if (!startStatus.includes('No engine attached') && !startStatus.includes('No engines configured')) {
  await evaluate(`document.getElementById('engine-attach').click()`);
  await waitFor(`document.getElementById('engine-status').textContent.includes('No engine attached')`, 'initial detach');
}

// Deterministic board: start a fresh game, discarding any previous test moves.
await evaluate(`document.querySelector('[data-action="new-game"]').click()`);
await sleep(250);
if (await evaluate(`document.getElementById('confirm-dialog').open`)) {
  await evaluate(`document.getElementById('confirm-ok').click()`);
  await waitFor(`!document.getElementById('confirm-dialog').open`, 'new game');
}
await waitFor(`document.getElementById('status-move').textContent.includes('Move 0')`, 'empty board');

await evaluate(`document.getElementById('tab-engine').click()`);
await waitFor(`!document.getElementById('panel-engine').hidden`, 'engine tab');

await evaluate(`document.getElementById('engine-manage').click()`);
await waitFor(`document.getElementById('engines-dialog').open`, 'engines dialog');
await evaluate(`
  (() => {
    const row = document.querySelector('.engine-row-item');
    row.querySelector('.engine-name').value = 'FakeGTP';
    row.querySelector('.engine-path').value = ${JSON.stringify(nodePath)};
    row.querySelector('.engine-args').value = ${JSON.stringify(fixturePath)};
    document.getElementById('engines-save').click();
  })()
`);
await waitFor(`!document.getElementById('engines-dialog').open`, 'engines saved');
await waitFor(`document.querySelectorAll('#engine-select option').length > 0`, 'engine option');

await evaluate(`document.getElementById('engine-attach').click()`);
await waitFor(`(() => { const t = document.getElementById('engine-status').textContent; return t.includes('FakeGTP') && t.includes('commands') && !t.includes('0 commands'); })()`, 'engine attach', 300);
console.log('status:', await evaluate(`document.getElementById('engine-status').textContent`));

await evaluate(`document.getElementById('engine-genmove').click()`);
await waitFor(`document.getElementById('status-move').textContent.includes('Move 1')`, 'engine move', 200);
console.log('move:', await evaluate(`document.getElementById('status-move').textContent`));

await evaluate(`
  (() => {
    const box = document.getElementById('engine-analysis');
    if (!box.checked) { box.checked = true; box.dispatchEvent(new Event('change', {bubbles: true})); }
  })()
`);
await waitFor(`document.getElementById('engine-winrate').textContent.startsWith('W ')`, 'white analysis', 400);
console.log('winrate:', await evaluate(`document.getElementById('engine-winrate').textContent`));
console.log('variations:', await evaluate(`document.getElementById('engine-moves').textContent`));
await shot('engine-analysis.png');

// Navigation discards the evaluation and analyses the new position.
await evaluate(`document.querySelector('[data-action="first"]').click()`);
await waitFor(`document.getElementById('engine-winrate').textContent.startsWith('B ')`, 'root analysis', 400);
console.log('root winrate:', await evaluate(`document.getElementById('engine-winrate').textContent`));

await evaluate(`document.getElementById('engine-console-open').click()`);
await waitFor(`!document.getElementById('engine-console-panel').hidden`, 'console panel');
await evaluate(`
  (() => {
    const input = document.getElementById('engine-console-input');
    input.value = 'name';
    document.getElementById('engine-console-form').requestSubmit();
  })()
`);
await waitFor(`document.getElementById('engine-console-log').textContent.includes('=FakeGTP')`, 'console reply');
await shot('engine-console.png');
await evaluate(`document.getElementById('tab-info').click()`);
await waitFor(`document.getElementById('engine-console-panel').hidden`, 'console closes on tab change');
await evaluate(`document.getElementById('tab-engine').click()`);

console.log('log tail:', await evaluate(`Array.from(document.querySelectorAll('#statuslog .status-text')).slice(-8).map(x => x.textContent)`));

console.log('errors:', JSON.stringify(errors));
await evaluate(`document.getElementById('engine-attach').click()`);
await sleep(400);
if (configPath && originalConfig != null) {
  await fs.writeFile(configPath, originalConfig);
}
console.log('done');
ws.close();
