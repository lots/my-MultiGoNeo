'use strict';

// Owns the GTP engine processes started from the renderer. Each entry is tied
// to the WebContents that asked for it so a window closing cannot leak an
// engine, and every protocol event is forwarded back over IPC.

const path = require('node:path');

const { GtpSession, splitArgs } = require('./gtp');

class EngineManager {
  constructor() {
    this.entries = new Map();
  }

  async start(payload, webContents) {
    const engineId = String(payload?.engineId ?? '');
    const enginePath = String(payload?.path ?? '');
    const args = String(payload?.args ?? '');
    if (!engineId || !/^[\w.-]+$/.test(engineId)) {
      throw new Error('Invalid engine id.');
    }
    if (!enginePath.trim()) throw new Error('No engine executable was chosen.');

    const existing = this.entries.get(engineId);
    if (existing) return { ok: true, pid: existing.session.pid };

    const entry = {
      session: new GtpSession({
        path: enginePath,
        args: splitArgs(args),
        cwd: payload?.cwd
          || (path.isAbsolute(enginePath) ? path.dirname(enginePath) : undefined),
      }),
      webContents,
    };
    entry.session.on('event', (event) => {
      if (event.type === 'exit') this.entries.delete(engineId);
      if (!webContents.isDestroyed()) {
        webContents.send('engine:event', { engineId, ...event });
      }
    });

    this.entries.set(engineId, entry);
    try {
      await entry.session.start();
    } catch (error) {
      this.entries.delete(engineId);
      throw error;
    }
    return { ok: true, pid: entry.session.pid };
  }

  async send({ engineId, command, options } = {}) {
    const entry = this.entries.get(engineId);
    if (!entry) throw new Error('That engine is not running.');
    const name = String(command?.name ?? '');
    if (!/^[A-Za-z_][\w-]*$/.test(name)) throw new Error('Invalid GTP command.');
    const args = Array.isArray(command?.args) ? command.args.map(String) : [];
    return entry.session.send({ name, args }, options ?? {});
  }

  async stop({ engineId } = {}) {
    const entry = this.entries.get(engineId);
    if (!entry) return { ok: true };
    this.entries.delete(engineId);
    try { await entry.session.stop(); } catch { /* best effort */ }
    return { ok: true };
  }

  stopFor(webContentsId) {
    for (const [engineId, entry] of [...this.entries]) {
      if (entry.webContents.id === webContentsId) {
        this.entries.delete(engineId);
        entry.session.stop().catch(() => {});
      }
    }
  }

  disposeAll() {
    for (const [, entry] of this.entries) {
      entry.session.stop().catch(() => {});
    }
    this.entries.clear();
  }
}

module.exports = { EngineManager };
