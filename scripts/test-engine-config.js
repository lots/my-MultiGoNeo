'use strict';

// Tests the engine connection list reader/writer without Electron or engines.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  EngineConfig,
  chooseConfigPath,
  resolveEnginePath,
} = require('../electron/engine-config.js');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'multigo-engines-'));
}

function testSeedAndRoundTrip() {
  const root = tempDir();
  const dir = path.join(root, 'engines');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'gnugo.cmd'), '@echo off\r\n');

  const seedPath = path.join(root, 'seed.json');
  fs.writeFileSync(seedPath, JSON.stringify({
    version: 1,
    engines: [{ id: 'seed', name: 'Seed', path: 'gnugo.cmd' }],
  }));

  const config = new EngineConfig({
    filePath: path.join(dir, 'engines.json'),
    seedPaths: [seedPath],
  });
  const loaded = config.load();
  assert.equal(loaded.path, path.join(dir, 'engines.json'));
  assert.equal(loaded.engines.length, 1);
  assert.equal(loaded.engines[0].name, 'Seed');
  assert.equal(loaded.engines[0].file, 'gnugo.cmd');
  assert.equal(loaded.engines[0].path, path.join(dir, 'gnugo.cmd'));

  const saved = config.save(loaded.engines.map((engine) => ({
    ...engine,
    original: engine.path,
  })));
  const text = fs.readFileSync(path.join(dir, 'engines.json'), 'utf8');
  assert.match(text, /"path": "gnugo\.cmd"/);
  assert.equal(saved.engines[0].path, path.join(dir, 'gnugo.cmd'));

  fs.rmSync(root, { recursive: true, force: true });
}

function testManualFormat() {
  const root = tempDir();
  const dir = path.join(root, 'engines');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'engines.json'), JSON.stringify({
    version: 1,
    engines: [
      { name: 'No id', path: 'gnugo.cmd' },
      { id: 'fuego', name: 'Fuego', path: 'C:\\Tools\\fuego.exe', args: '--foo', commands: 'komi 7.5' },
    ],
  }));
  const config = new EngineConfig({ filePath: path.join(dir, 'engines.json') });
  const loaded = config.load();
  assert.equal(loaded.engines.length, 2);
  assert.equal(loaded.engines[0].id, 'engine-1');
  assert.equal(loaded.engines[0].name, 'No id');
  assert.equal(loaded.engines[1].args, '--foo');
  assert.equal(loaded.engines[1].commands, 'komi 7.5');

  // Sabaki-style files are accepted on read.
  fs.writeFileSync(path.join(dir, 'engines.json'), JSON.stringify({
    'engines.list': [{ name: 'Pachi', path: 'pachi.cmd' }],
  }));
  assert.equal(config.load().engines[0].name, 'Pachi');

  fs.rmSync(root, { recursive: true, force: true });
}

function testValidation() {
  const root = tempDir();
  const config = new EngineConfig({ filePath: path.join(root, 'engines', 'engines.json') });
  assert.throws(() => config.save([{ name: '', path: '' }]), /no executable path/i);
  assert.throws(
    () => config.save([
      { id: 'a', name: 'A', path: 'a.cmd' },
      { id: 'a', name: 'B', path: 'b.cmd' },
    ]),
    /Duplicate engine id/,
  );
  fs.rmSync(root, { recursive: true, force: true });
}

function testPathChoice() {
  const root = tempDir();
  const dev = chooseConfigPath({
    isPackaged: false,
    appPath: root,
    exeDir: path.join(root, 'out'),
    userData: path.join(root, 'user'),
    resourcesPath: path.join(root, 'out', 'resources'),
    env: {},
  });
  assert.equal(dev, path.join(root, 'engines', 'engines.json'));

  const portable = chooseConfigPath({
    isPackaged: true,
    appPath: path.join(root, 'app.asar'),
    exeDir: path.join(root, 'portable'),
    userData: path.join(root, 'user'),
    resourcesPath: path.join(root, 'portable', 'resources'),
    env: {},
  });
  assert.equal(portable, path.join(root, 'portable', 'engines', 'engines.json'));

  const override = chooseConfigPath({
    isPackaged: true,
    appPath: root,
    exeDir: root,
    userData: root,
    resourcesPath: root,
    env: { MULTIGO_ENGINE_CONFIG: path.join(root, 'custom.json') },
  });
  assert.equal(override, path.join(root, 'custom.json'));
  fs.rmSync(root, { recursive: true, force: true });
}

function testResolutionFallback() {
  const root = tempDir();
  const configDir = path.join(root, 'config');
  const bundleDir = path.join(root, 'bundle');
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.writeFileSync(path.join(bundleDir, 'gnugo.cmd'), '@echo off\r\n');
  assert.equal(
    resolveEnginePath('gnugo.cmd', configDir, [bundleDir]),
    path.join(bundleDir, 'gnugo.cmd'),
  );
  fs.rmSync(root, { recursive: true, force: true });
}

testSeedAndRoundTrip();
testManualFormat();
testValidation();
testPathChoice();
testResolutionFallback();
console.log('Engine configuration tests passed.');
