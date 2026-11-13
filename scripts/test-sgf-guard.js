'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

// The IPC handlers are the only place the size ceiling is enforced, so this
// test loads electron/main.js against a stub Electron and calls them directly.
// It covers the guard, the configurable ceiling, and the import skip report.

const handlers = new Map();
let nextOpenResult = { canceled: true, filePaths: [] };

const fakeElectron = {
  app: {
    on() {},
    quit() {},
    setName() {},
    setAppUserModelId() {},
    requestSingleInstanceLock: () => true,
    getPath: (name) => path.join(os.tmpdir(), `fig-test-${name}`),
    getAppPath: () => process.cwd(),
    isPackaged: false,
    // Never resolves: the entry point must not create a window under test.
    whenReady: () => new Promise(() => {}),
  },
  BrowserWindow: class {
    static getAllWindows() { return []; }
    static fromWebContents() { return null; }
  },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu() {} },
  dialog: { showOpenDialog: async () => nextOpenResult },
  ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
  session: { defaultSession: {} },
  shell: { openExternal() {} },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return fakeElectron;
  return originalLoad.call(this, request, parent, isMain);
};

let mainModule;
try {
  mainModule = require('../electron/main.js');
} finally {
  Module._load = originalLoad;
}
mainModule.registerIpc();

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'multigo-sgf-guard-'));

function writeFile(name, bytes) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

async function rejects(promise, pattern) {
  try {
    await promise;
  } catch (error) {
    assert.match(error.message, pattern);
    return;
  }
  assert.fail('expected the handler to reject');
}

let count = 0;
function test(name, callback) {
  return Promise.resolve()
    .then(callback)
    .then(() => {
      count += 1;
      console.log(`ok ${count} - ${name}`);
    });
}

(async () => {
  const big = 'a'.repeat(6_000_000);
  const small = '(;GM[1]FF[4]SZ[19];B[pd])';
  const bigPath = writeFile('big.sgf', big);
  const smallPath = writeFile('small.sgf', small);

  await test('refuses a 6 MB file under the default 5 MB ceiling', async () => {
    await rejects(handlers.get('game:open-path')({}, { filePath: bigPath }), /too large to open \(6 MB exceeds the 5 MB limit\)/);
  });

  await test('accepts the same file when the ceiling is raised', async () => {
    const result = await handlers.get('game:open-path')({}, { filePath: bigPath, maxBytes: 10_000_000 });
    assert.equal(result.filePath, bigPath);
    assert.equal(result.content.length, big.length);
  });

  await test('the open dialog honours the ceiling too', async () => {
    nextOpenResult = { canceled: false, filePaths: [bigPath] };
    await rejects(handlers.get('game:open')({}, { maxBytes: 5_000_000 }), /too large to open/);
    nextOpenResult = { canceled: true, filePaths: [] };
  });

  await test('a nonsensical ceiling falls back to 5 MB rather than opening the gate', async () => {
    await rejects(handlers.get('game:open-path')({}, { filePath: bigPath, maxBytes: -1 }), /too large to open/);
    await rejects(handlers.get('game:open-path')({}, { filePath: bigPath, maxBytes: 'nonsense' }), /too large to open/);
  });

  await test('import reports files it skipped instead of dropping them silently', async () => {
    nextOpenResult = { canceled: false, filePaths: [smallPath, bigPath] };
    const result = await handlers.get('game:import')({}, { maxBytes: 5_000_000 });
    nextOpenResult = { canceled: true, filePaths: [] };
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].filePath, smallPath);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].filePath, bigPath);
    assert.equal(result.skipped[0].reason, 'too large');
    assert.equal(result.skipped[0].size, 6_000_000);
  });

  await test('save refuses a payload above the ceiling', async () => {
    await rejects(
      handlers.get('game:save')({}, { content: 'x'.repeat(6_000_000), filePath: path.join(dir, 'out.sgf') }),
      /Invalid SGF payload/,
    );
  });

  await test('save writes a payload within the ceiling', async () => {
    const target = path.join(dir, 'out.sgf');
    const result = await handlers.get('game:save')({}, { content: small, filePath: target });
    assert.equal(result.filePath, target);
    assert.equal(fs.readFileSync(target, 'utf8'), small);
  });

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${count} SGF guard tests passed.`);
})().catch((error) => {
  fs.rmSync(dir, { recursive: true, force: true });
  console.error(error);
  process.exitCode = 1;
});
