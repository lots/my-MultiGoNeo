'use strict';

// Reads and writes the hand-maintainable engine connection list
// (`engines/engines.json`). The same file is used by "Engine > Manage Engines…",
// so a text editor and the dialog are interchangeable.

const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 1;

function stringValue(value, fallback = '') {
  if (value == null) return fallback;
  const text = String(value);
  return text === '' ? fallback : text;
}

function normalizeEngine(engine, index, dir, fallbackDirs) {
  if (!engine || typeof engine !== 'object') return null;
  const file = stringValue(engine.path).trim();
  if (!file) return null;

  const resolved = resolveEnginePath(file, dir, fallbackDirs);
  const name = stringValue(engine.name).trim() || path.basename(resolved).replace(/\.(exe|cmd|bat)$/i, '');
  const id = stringValue(engine.id).trim() || `engine-${index + 1}`;

  return {
    id,
    name,
    path: resolved,
    file,
    args: stringValue(engine.args),
    commands: stringValue(engine.commands),
  };
}

function resolveEnginePath(file, dir, fallbackDirs = []) {
  if (path.isAbsolute(file)) return path.normalize(file);
  for (const base of [dir, ...fallbackDirs]) {
    const candidate = path.resolve(base, file);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.resolve(dir, file);
}

function relativeTo(dir, absolute) {
  const relative = path.relative(dir, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join('/');
}

function serializeEngine(engine, dir, fallbackDirs) {
  let outputPath;
  if (engine.file && engine.original === engine.path) {
    outputPath = engine.file;
  } else {
    const absolute = resolveEnginePath(engine.path, dir, fallbackDirs);
    outputPath = relativeTo(dir, absolute) ?? absolute;
  }
  return {
    id: stringValue(engine.id),
    name: stringValue(engine.name),
    path: outputPath,
    args: stringValue(engine.args),
    commands: stringValue(engine.commands),
  };
}

class EngineConfig {
  constructor({ filePath, seedPaths = [], fallbackDirs = [] }) {
    this.filePath = filePath;
    this.dir = path.dirname(filePath);
    this.seedPaths = seedPaths.filter(Boolean);
    this.fallbackDirs = fallbackDirs.filter(Boolean);
  }

  ensureFile() {
    if (fs.existsSync(this.filePath)) return;
    fs.mkdirSync(this.dir, { recursive: true });
    const seed = this.seedPaths.find((candidate) => fs.existsSync(candidate));
    if (seed) {
      fs.copyFileSync(seed, this.filePath);
      return;
    }
    fs.writeFileSync(
      this.filePath,
      `${JSON.stringify({ version: SCHEMA_VERSION, engines: [] }, null, 2)}\n`,
      'utf8',
    );
  }

  readRaw() {
    this.ensureFile();
    const text = fs.readFileSync(this.filePath, 'utf8');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Engine configuration must be a JSON object.');
    }
    return parsed;
  }

  load() {
    const parsed = this.readRaw();
    const list = Array.isArray(parsed.engines)
      ? parsed.engines
      : Array.isArray(parsed['engines.list'])
        ? parsed['engines.list']
        : [];
    const engines = list
      .map((engine, index) => normalizeEngine(engine, index, this.dir, this.fallbackDirs))
      .filter(Boolean);
    return {
      path: this.filePath,
      dir: this.dir,
      version: Number(parsed.version) || SCHEMA_VERSION,
      engines,
    };
  }

  save(engines) {
    if (!Array.isArray(engines)) throw new Error('Engine list must be an array.');
    const seen = new Set();
    const output = [];
    engines.forEach((engine, index) => {
      if (!engine || typeof engine.path !== 'string' || !engine.path.trim()) {
        throw new Error(`Engine ${index + 1} has no executable path.`);
      }
      if (!engine.name || !String(engine.name).trim()) {
        throw new Error(`Engine ${index + 1} has no name.`);
      }
      const id = stringValue(engine.id) || `engine-${index + 1}`;
      if (seen.has(id)) throw new Error(`Duplicate engine id: ${id}`);
      seen.add(id);
      output.push(serializeEngine(engine, this.dir, this.fallbackDirs));
    });

    fs.mkdirSync(this.dir, { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    const text = `${JSON.stringify({ version: SCHEMA_VERSION, engines: output }, null, 2)}\n`;
    fs.writeFileSync(temporary, text, 'utf8');
    fs.renameSync(temporary, this.filePath);
    return this.load();
  }
}

// Picks the writable location for the configuration file. Development uses the
// repository's engines/ folder; a packaged app prefers <install>/engines and
// falls back to userData when the installation directory is read-only.
function chooseConfigPath({ app, isPackaged, appPath, exeDir, userData, resourcesPath, env }) {
  const override = env?.MULTIGO_ENGINE_CONFIG;
  if (override) return path.resolve(override);

  if (!isPackaged) {
    return path.join(appPath, 'engines', 'engines.json');
  }

  const installed = path.join(exeDir, 'engines', 'engines.json');
  if (isWritableDirectory(path.dirname(installed))) return installed;

  return path.join(userData, 'engines', 'engines.json');
}

function isWritableDirectory(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  EngineConfig,
  chooseConfigPath,
  isWritableDirectory,
  resolveEnginePath,
  SCHEMA_VERSION,
};
