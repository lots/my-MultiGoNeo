'use strict';

// Minimal GTP engine used by scripts/test-gtp.js and the CDP UI test. It is
// deliberately dependency-free and follows the framing rules closely enough
// to exercise the controller: responses end with a blank line, and
// `kata-analyze` streams `info` lines until another command arrives.

const readline = require('node:readline');

const NAME = 'FakeGTP';
const VERSION = '0.1.0';
const COMMANDS = [
  'name', 'version', 'protocol_version', 'list_commands', 'known_command',
  'boardsize', 'rectangular_boardsize', 'clear_board', 'komi', 'play',
  'genmove', 'undo', 'set_free_handicap', 'place_free_handicap',
  'fixed_handicap', 'showboard', 'final_score', 'quit',
  'kata-analyze', 'kata-genmove_analyze', 'stop',
];

let boardSize = 19;
let analyzeTimer = null;
const stones = new Set();

function addStone(vertex) {
  const text = String(vertex ?? '').trim();
  if (!text || /^pass$/i.test(text)) return;
  stones.add(text.toUpperCase());
}

function emptyCandidates() {
  const moves = boardSize >= 16
    ? ['Q16', 'D4', 'Q4', 'D16', 'R14', 'K10', 'C3']
    : ['D4', 'K10', 'K4', 'D10', 'C6', 'J5'];
  return moves.filter((move) => !stones.has(move));
}

function stopAnalysis() {
  if (analyzeTimer) {
    clearInterval(analyzeTimer);
    analyzeTimer = null;
  }
}

function write(text) {
  process.stdout.write(text);
}

function succeed(id, content = '') {
  write(`=${id}${content ? ` ${content}` : ''}\n\n`);
}

function fail(id, message) {
  write(`?${id} ${message}\n\n`);
}

function startAnalysis(id, command, args) {
  const moves = emptyCandidates();
  let tick = 0;
  write(`=${id}\n`);
  analyzeTimer = setInterval(() => {
    tick += 1;
    const parts = [];
    for (let index = 0; index < Math.min(3, moves.length); index += 1) {
      const winrate = Math.max(0.05, 0.62 - index * 0.07 - (tick - 1) * 0.001);
      const scoreLead = 2.4 - index * 1.1;
      parts.push(
        `info move ${moves[index]} visits ${Math.round(800 / (index + 1)) + tick} ` +
          `winrate ${winrate.toFixed(4)} scoreLead ${scoreLead.toFixed(2)} ` +
          `pv ${moves.slice(index).join(' ')}`,
      );
    }
    write(`${parts.join(' ')}\n`);
  }, 60);
  if (typeof analyzeTimer.unref === 'function') analyzeTimer.unref();
}

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;

  const match = /^(\d+)\s+(\S+)(?:\s+(.*))?$/.exec(text);
  const id = match ? match[1] : '';
  const name = match ? match[2] : text.split(/\s+/)[0];
  const args = match && match[3] ? match[3].split(/\s+/) : [];

  stopAnalysis();

  switch (name) {
    case 'name':
      succeed(id, NAME);
      break;
    case 'version':
      succeed(id, VERSION);
      break;
    case 'protocol_version':
      succeed(id, '2');
      break;
    case 'list_commands':
      succeed(id, COMMANDS.join('\n'));
      break;
    case 'known_command':
      succeed(id, COMMANDS.includes(args[0]) ? 'true' : 'false');
      break;
    case 'boardsize': {
      const size = Number(args[0]);
      if (!Number.isInteger(size) || size < 2 || size > 52) {
        fail(id, 'unacceptable size');
        break;
      }
      boardSize = size;
      stones.clear();
      succeed(id);
      break;
    }
    case 'rectangular_boardsize': {
      const width = Number(args[0]);
      const height = Number(args[1]);
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
        fail(id, 'unacceptable size');
        break;
      }
      boardSize = Math.max(width, height);
      stones.clear();
      succeed(id);
      break;
    }
    case 'clear_board':
      stones.clear();
      succeed(id);
      break;
    case 'komi':
    case 'undo':
    case 'stop':
      succeed(id);
      break;
    case 'play':
      addStone(args[1]);
      succeed(id);
      break;
    case 'set_free_handicap':
      for (const vertex of args) addStone(vertex);
      succeed(id);
      break;
    case 'place_free_handicap':
    case 'fixed_handicap':
      succeed(id);
      break;
    case 'showboard':
      succeed(id, `board ${boardSize}`);
      break;
    case 'final_score':
      succeed(id, 'B+0.5');
      break;
    case 'genmove': {
      if (process.env.FAKE_GTP_PASS === '1') {
        succeed(id, 'pass');
        break;
      }
      if (process.env.FAKE_GTP_RESIGN === '1') {
        succeed(id, 'resign');
        break;
      }
      const point = emptyCandidates()[0] ?? 'pass';
      addStone(point);
      succeed(id, point);
      break;
    }
    case 'kata-analyze':
    case 'kata-genmove_analyze':
    case 'lz-analyze':
      startAnalysis(id, name, args);
      break;
    case 'quit':
      succeed(id);
      setTimeout(() => process.exit(0), 10);
      break;
    default:
      fail(id, `unknown command: ${name}`);
  }
});

process.stdin.on('end', () => process.exit(0));
