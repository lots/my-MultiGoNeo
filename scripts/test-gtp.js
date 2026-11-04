'use strict';

// Exercises the main-process GTP controller and the shared engine-core helpers
// against scripts/fixtures/fake-gtp-engine.js. Run with `node scripts/test-gtp.js`.

const assert = require('node:assert/strict');
const path = require('node:path');

const { GtpSession, splitArgs } = require('../electron/gtp');
const core = require('../src/engine-core.js');

const fixture = path.join(__dirname, 'fixtures', 'fake-gtp-engine.js');

function waitForLine(session, predicate, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.removeListener('event', onEvent);
      reject(new Error('Timed out waiting for an analysis line.'));
    }, timeout);
    function onEvent(event) {
      if (event.type === 'line' && predicate(event.line)) {
        clearTimeout(timer);
        session.removeListener('event', onEvent);
        resolve(event.line);
      }
    }
    session.on('event', onEvent);
  });
}

async function testSplitArgs() {
  assert.deepEqual(splitArgs(''), []);
  assert.deepEqual(splitArgs('--mode gtp'), ['--mode', 'gtp']);
  assert.deepEqual(splitArgs('--foo "a b" --bar'), ['--foo', 'a b', '--bar']);
  assert.deepEqual(splitArgs(`--path 'C:\\Go engines\\gnugo.exe'`), [
    '--path',
    'C:\\Go engines\\gnugo.exe',
  ]);
}

async function testSession() {
  const session = new GtpSession({
    path: process.execPath,
    args: [fixture],
    cwd: __dirname,
  });
  const events = [];
  session.on('event', (event) => events.push(event));

  try {
    await session.start();
    assert.ok(session.pid > 0, 'engine process should have a pid');

    const name = await session.send({ name: 'name' });
    assert.equal(name.ok, true);
    assert.equal(name.content, 'FakeGTP');

    const version = await session.send({ name: 'version' });
    assert.equal(version.content, '0.1.0');

    const protocol = await session.send({ name: 'protocol_version' });
    assert.equal(protocol.content, '2');

    const commands = await session.send({ name: 'list_commands' });
    assert.ok(commands.content.split('\n').includes('genmove'));
    assert.ok(commands.content.split('\n').includes('kata-analyze'));

    assert.equal((await session.send({ name: 'boardsize', args: [19] })).ok, true);
    assert.equal((await session.send({ name: 'komi', args: ['6.5'] })).ok, true);
    assert.equal((await session.send({ name: 'clear_board' })).ok, true);
    assert.equal(
      (await session.send({ name: 'play', args: ['B', 'D4'] })).ok,
      true,
    );

    const move = await session.send({ name: 'genmove', args: ['W'] });
    assert.equal(move.content, 'Q16');
    assert.deepEqual(core.parseGtpVertex(move.content, 19, 19), [15, 3]);

    const rejected = await session
      .send({ name: 'boardsize', args: [1] })
      .then(() => false, (error) => error.message);
    assert.match(String(rejected), /unacceptable size/);

    // Streaming analysis: the acknowledgement resolves immediately; info lines
    // keep arriving until the next command interrupts the stream.
    const lines = [];
    session.on('event', (event) => {
      if (event.type === 'line') lines.push(event.line);
    });
    const ack = await session.send(
      { name: 'kata-analyze', args: ['B', '100'] },
      { stream: true },
    );
    assert.equal(ack.ok, true);
    await waitForLine(session, (line) => line.includes('info move'));

    const interrupted = await session.send({ name: 'name' });
    assert.equal(interrupted.content, 'FakeGTP');
    assert.ok(events.some((event) => event.type === 'stream-end'));

    const parsed = core.parseAnalysisLine(
      'info move D4 visits 120 winrate 0.5321 scoreLead 1.2 pv D4 Q16',
      19,
      19,
      'float',
    );
    assert.equal(parsed.length, 1);
    assert.deepEqual(parsed[0].move, [3, 15]);
    assert.equal(parsed[0].visits, 120);
    assert.equal(parsed[0].winrate, 53.21);
    assert.equal(parsed[0].scoreLead, 1.2);
    assert.deepEqual(parsed[0].pvs[0], [3, 15]);

    // Leela-Zero dialect: integer ten-thousandths, no scoreLead.
    const lz = core.parseAnalysisLine(
      'info move Q16 visits 300 winrate 5213 pv Q16 D4',
      19,
      19,
      'integer',
    );
    assert.equal(lz.length, 1);
    assert.equal(lz[0].winrate, 52.13);
    assert.equal(lz[0].scoreLead, null);

    // Several info segments on one line, plus a scoreMean fallback.
    const multi = core.parseAnalysisLine(
      'info move Q16 visits 30 winrate 0.6 scoreMean 2.5 pv Q16 info move D4 visits 10 winrate 0.4 pv D4',
      19,
      19,
      'float',
    );
    assert.equal(multi.length, 2);
    assert.equal(multi[0].scoreLead, 2.5);
    assert.equal(multi[0].move[0], 15);
    assert.equal(multi[1].move[0], 3);

    assert.equal(core.selectAnalysisCommand(['genmove', 'kata-analyze']), 'kata-analyze');
    assert.equal(core.selectAnalysisCommand(['genmove']), null);

    assert.deepEqual(core.parseGenmoveResult('pass', 19, 19), { type: 'pass' });
    assert.deepEqual(core.parseGenmoveResult('resign', 19, 19), { type: 'resign' });
    assert.deepEqual(core.parseGenmoveResult('Q16', 19, 19), {
      type: 'move',
      x: 15,
      y: 3,
    });
    assert.equal(core.parseGenmoveResult('Z99', 19, 19).type, 'invalid');

    await session.stop();
    assert.equal(session.stopped, true);
  } finally {
    try { await session.stop(); } catch { /* already stopped */ }
  }
}

function testSyncCommands() {
  const position = {
    width: 19,
    height: 19,
    komi: 6.5,
    handicap: 2,
    handicapPoints: [[3, 3], [15, 15]],
    setup: [{ sign: 1, x: 9, y: 9 }],
    moves: [
      { sign: -1, x: 3, y: 15 },
      { sign: 1, pass: true },
      { sign: -1, x: 15, y: 3 },
    ],
  };
  const commands = core.buildSyncCommands(position, {
    commands: ['set_free_handicap', 'play'],
  });
  const text = commands
    .map((command) =>
      `${command.name}${command.args?.length ? ` ${command.args.join(' ')}` : ''}`)
    .join('\n');
  assert.match(text, /^boardsize 19$/m);
  assert.match(text, /^komi 6\.5$/m);
  assert.match(text, /^clear_board$/m);
  assert.match(text, /^set_free_handicap D16 Q4$/m);
  assert.match(text, /^play W D4$/m);
  assert.match(text, /^play B pass$/m);
  assert.match(text, /^play W Q16$/m);
  assert.ok(
    text.indexOf('clear_board') < text.indexOf('set_free_handicap'),
    'the board must be cleared before the handicap is placed',
  );

  // Without set_free_handicap the stones are replayed as moves instead.
  const fallback = core.buildSyncCommands(position, { commands: ['play'] });
  assert.ok(!fallback.some((command) => command.name === 'set_free_handicap'));
  assert.ok(
    fallback.some(
      (command) => command.name === 'play' && command.args.join(' ') === 'B Q4',
    ),
  );

  const rectangular = core.buildSyncCommands(
    { ...position, width: 19, height: 13 },
    { commands: ['play'] },
  );
  assert.deepEqual(rectangular[0], { name: 'boardsize', args: ['19', '13'] });

  const fixed = core.buildSyncCommands(
    { width: 19, height: 19, komi: 0.5, handicap: 3, handicapPoints: [], setup: [], moves: [] },
    { commands: ['fixed_handicap', 'play'] },
  );
  assert.ok(
    fixed.some(
      (command) => command.name === 'fixed_handicap' && command.args[0] === '3',
    ),
  );
}

async function main() {
  await testSplitArgs();
  await testSession();
  testSyncCommands();
  console.log('GTP tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
