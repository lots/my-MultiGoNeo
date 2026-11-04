'use strict';

// Go Text Protocol controller, modelled on @sabaki/gtp (the library my-Sabaki
// uses) but kept dependency-free so the Electron main process can require it
// directly. A session owns one engine process and speaks GTP over its stdio.
//
// Commands are written as `<id> <name> <args...>` and answers are framed by
// `=` (success) or `?` (failure) followed by the id, the payload, and a blank
// line. `analyze`-style commands stream `info ...` lines indefinitely; for
// those the promise resolves as soon as the acknowledgement arrives and the
// lines are forwarded through the `line` event until another command is sent.

const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

class GtpError extends Error {
  constructor(message, { command = null, content = '' } = {}) {
    super(message);
    this.name = 'GtpError';
    this.command = command;
    this.content = content;
  }
}

function splitArgs(value) {
  const text = String(value ?? '').trim();
  if (!text) return [];
  const args = [];
  let current = '';
  let quote = null;

  for (const character of text) {
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += character;
  }
  if (current) args.push(current);
  return args;
}

class GtpSession extends EventEmitter {
  constructor({ path, args = [], cwd = undefined }) {
    super();
    this.path = path;
    this.args = Array.isArray(args) ? args.map(String) : splitArgs(args);
    this.cwd = cwd;
    this.child = null;
    this.started = false;
    this.stopped = false;
    this._buffer = '';
    this._current = null;
    this._nextId = 1;
    this._stderr = '';
  }

  get pid() {
    return this.child?.pid ?? null;
  }

  // `.cmd`/`.bat` shims are not executables: cmd.exe has to interpret them.
  _spawnCommand() {
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(this.path)) {
      const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
      const commandLine = [this.path, ...this.args].map(quote).join(' ');
      return {
        file: process.env.ComSpec || 'cmd.exe',
        args: ['/d', '/s', '/c', quote(commandLine)],
        windowsVerbatimArguments: true,
      };
    }
    return {
      file: this.path,
      args: this.args,
      windowsVerbatimArguments: false,
    };
  }

  start() {
    if (this.child) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let settled = false;
      const command = this._spawnCommand();
      const child = spawn(command.file, command.args, {
        cwd: this.cwd,
        windowsHide: true,
        windowsVerbatimArguments: command.windowsVerbatimArguments,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.child = child;

      child.once('spawn', () => {
        settled = true;
        this.started = true;
        this.emit('event', { type: 'started', pid: child.pid });
        resolve();
      });

      child.once('error', (error) => {
        this.emit('event', {
          type: 'error',
          message: `Could not start the engine: ${error.message}`,
        });
        if (!settled) {
          settled = true;
          reject(new Error(`Could not start the engine: ${error.message}`));
        }
      });

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => this._handleData(chunk));

      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        this._stderr += chunk;
        const text = String(chunk).trim();
        if (text) this.emit('event', { type: 'stderr', message: text });
      });

      child.once('exit', (code, signal) => {
        this.started = false;
        this.stopped = true;
        if (this._current) {
          const current = this._current;
          this._current = null;
          clearTimeout(current.timer);
          if (current.stream && current.ackSettled) {
            this.emit('event', { type: 'stream-end', commandId: current.id });
          } else if (!current.settled) {
            current.reject(
              new GtpError('The engine stopped before answering.', {
                command: current.command,
              }),
            );
          }
        }
        this.emit('event', {
          type: 'exit',
          code,
          signal,
          message: `Engine exited${code == null ? '' : ` (code ${code})`}${
            signal ? ` (${signal})` : ''
          }.`,
        });
      });
    });
  }

  _handleData(chunk) {
    this._buffer += chunk;
    let index = this._buffer.indexOf('\n');
    while (index >= 0) {
      let line = this._buffer.slice(0, index);
      this._buffer = this._buffer.slice(index + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      this._handleLine(line);
      index = this._buffer.indexOf('\n');
    }
  }

  _handleLine(line) {
    const current = this._current;
    if (!current) {
      // Unsolicited output (for example a stray prompt); ignore it.
      if (line.trim()) this.emit('event', { type: 'stderr', message: line });
      return;
    }

    if (!current.started) {
      const match = /^([=?])(\d*)(?:\s(.*))?$/.exec(line);
      if (!match) {
        if (line.trim()) this.emit('event', { type: 'stderr', message: line });
        return;
      }
      current.started = true;
      const ok = match[1] === '=';
      const payload = match[3] ?? '';
      current.ok = ok;
      if (!ok) {
        current.error = payload || 'GTP command failed.';
      }

      if (current.stream) {
        current.ackSettled = true;
        clearTimeout(current.timer);
        if (payload) {
          this.emit('event', {
            type: 'line',
            commandId: current.id,
            line: payload,
          });
        }
        current.resolve({ ok, content: payload });
        if (!ok) this._finishStream();
        return;
      }

      if (!ok) {
        current.content.push(payload);
      } else if (payload) {
        current.content.push(payload);
      }
      return;
    }

    if (line === '') {
      this._finishCommand();
      return;
    }

    if (current.stream) {
      this.emit('event', {
        type: 'line',
        commandId: current.id,
        line,
      });
      return;
    }

    current.content.push(line);
  }

  _finishCommand() {
    const current = this._current;
    if (!current) return;
    this._current = null;
    clearTimeout(current.timer);
    if (current.stream) {
      if (!current.ackSettled) {
        current.settled = true;
        current.resolve({ ok: current.ok, content: '' });
      }
      this.emit('event', { type: 'stream-end', commandId: current.id });
      return;
    }
    current.settled = true;
    const content = current.content.join('\n');
    if (current.ok) {
      current.resolve({ ok: true, content });
    } else {
      current.reject(
        new GtpError(current.error || content || 'GTP command failed.', {
          command: current.command,
          content,
        }),
      );
    }
  }

  _finishStream() {
    const current = this._current;
    if (!current || !current.stream) return;
    this._current = null;
    clearTimeout(current.timer);
    this.emit('event', { type: 'stream-end', commandId: current.id });
  }

  send(command, { stream = false, timeout = 30000 } = {}) {
    if (!this.child || !this.started || this.stopped) {
      return Promise.reject(new GtpError('The engine is not running.'));
    }
    if (this._current) {
      if (this._current.stream) {
        this._finishStream();
      } else {
        return Promise.reject(
          new GtpError('The engine is still answering the previous command.'),
        );
      }
    }

    const id = this._nextId++;
    const args = (command.args ?? []).map(String);
    const text = `${id} ${command.name}${args.length ? ` ${args.join(' ')}` : ''}`;
    this.emit('event', {
      type: 'sent',
      commandId: id,
      command: { name: command.name, args },
      line: text,
    });

    const pending = {
      id,
      command,
      stream,
      ok: null,
      content: [],
      started: false,
      settled: false,
      ackSettled: false,
      timer: null,
      resolve: null,
      reject: null,
      error: '',
    };

    const promise = new Promise((resolve, reject) => {
      pending.resolve = resolve;
      pending.reject = reject;
    });

    pending.timer = setTimeout(() => {
      if (this._current !== pending) return;
      this._current = null;
      pending.settled = true;
      pending.reject(
        new GtpError(
          `The engine did not answer "${command.name}" within ${Math.round(
            timeout / 1000,
          )} s.`,
          { command },
        ),
      );
      this.emit('event', { type: 'timeout', commandId: id, name: command.name });
      // The engine is still busy with the old command; kill it so a later
      // command cannot read the stale answer as its own.
      try { this.child.kill(); } catch { /* already gone */ }
    }, timeout);
    if (typeof pending.timer.unref === 'function') pending.timer.unref();

    this._current = pending;
    try {
      this.child.stdin.write(`${text}\n`);
      this.emit('event', {
        type: 'command',
        commandId: id,
        name: command.name,
        args,
      });
    } catch (error) {
      this._current = null;
      clearTimeout(pending.timer);
      pending.settled = true;
      pending.reject(new GtpError(error.message, { command }));
    }

    return promise;
  }

  async stop(timeout = 3000) {
    if (!this.child || this.stopped) return;
    try {
      await this.send({ name: 'quit' }, { timeout: Math.min(timeout, 3000) });
    } catch {
      // Engines are free to exit without answering quit.
    }
    const child = this.child;
    this.stopped = true;
    if (!child) return;
    const killTimer = setTimeout(() => {
      try { child.kill(); } catch { /* already gone */ }
    }, 750);
    if (typeof killTimer.unref === 'function') killTimer.unref();
    try { child.stdin.end(); } catch { /* pipe already closed */ }
    child.once('exit', () => clearTimeout(killTimer));
  }
}

module.exports = { GtpSession, GtpError, splitArgs };
