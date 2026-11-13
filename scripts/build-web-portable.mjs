import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

/**
 * Assembles the portable browser build:
 *
 *   web-portable/
 *     index.html          <- open this
 *     styles.css
 *     themes/*.css
 *     *.js
 *     embed.html          <- optional zero-JS embed examples
 *     LICENSE
 *     README.txt
 *     Open MultiGo Neo.cmd
 *
 * Also writes release/MultiGo-Neo-<version>-web.zip from the finished folder so
 * the folder and the release archive always match.
 *
 * Everything is referenced relatively and nothing is fetched at runtime, so the
 * folder can be copied to a USB stick and opened from file:// on another PC.
 *
 *   node scripts/build-web-portable.mjs [outputDir]
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'src')
const out = path.resolve(process.argv[2] ?? path.join(root, 'web-portable'))
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))

// Minimal ZIP writer (deflate + UTF-8 names) so `npm run dist:web` can emit the
// release archive without depending on PowerShell, 7-Zip or an npm package.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(buffer) {
  let value = 0xffffffff
  for (let index = 0; index < buffer.length; index += 1) {
    value = CRC_TABLE[(value ^ buffer[index]) & 0xff] ^ (value >>> 8)
  }
  return (value ^ 0xffffffff) >>> 0
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

function createZip(entries) {
  const locals = []
  const central = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.data)
    const deflated = zlib.deflateRawSync(entry.data, { level: 9 })
    const useDeflate = deflated.length < entry.data.length
    const payload = useDeflate ? deflated : entry.data
    const method = useDeflate ? 8 : 0
    const stamp = dosDateTime(entry.date ?? new Date())

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(stamp.time, 10)
    local.writeUInt16LE(stamp.date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, payload)

    const directory = Buffer.alloc(46)
    directory.writeUInt32LE(0x02014b50, 0)
    directory.writeUInt16LE(20, 4)
    directory.writeUInt16LE(20, 6)
    directory.writeUInt16LE(0x0800, 8)
    directory.writeUInt16LE(method, 10)
    directory.writeUInt16LE(stamp.time, 12)
    directory.writeUInt16LE(stamp.date, 14)
    directory.writeUInt32LE(crc, 16)
    directory.writeUInt32LE(payload.length, 20)
    directory.writeUInt32LE(entry.data.length, 24)
    directory.writeUInt16LE(name.length, 28)
    directory.writeUInt16LE(0, 30)
    directory.writeUInt16LE(0, 32)
    directory.writeUInt16LE(0, 34)
    directory.writeUInt16LE(0, 36)
    directory.writeUInt32LE(0, 38)
    directory.writeUInt32LE(offset, 42)
    central.push(directory, name)

    offset += local.length + name.length + payload.length
  }

  const centralSize = central.reduce((total, buffer) => total + buffer.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, ...central, end])
}

const files = [
  'index.html',
  'styles.css',
  'sabaki-bundle.js',
  'path-spec.js',
  'scoring.js',
  'engine-core.js',
  'engine.js',
  'renderer.js',
  'embed.html',
  'embed.css',
  'embed.js',
  'license.html',
]

const dirs = ['themes']

const readme = `MultiGo Neo ${pkg.version} - portable web build
${'='.repeat(36)}

1. Copy this whole folder to the USB stick (keep the files together).
2. Double-click index.html, or run "Open MultiGo Neo.cmd".
   Chrome or Edge is recommended; other Chromium browsers work too.

No installation and no internet connection are required. Everything the app
needs is inside this folder.

Notes
-----
- This is the browser build. GTP engines, native Open/Save dialogs, the .sgf
  Explorer association and the installer are Electron-only and are not
  available here. Open and Save use the browser's file picker/downloads.
- Settings, theme, recent files, board size and panel layout are stored in the
  browser's localStorage for this folder. Clearing site data resets them.
- Some browsers restrict clipboard access or "Save As" on file:// pages; the
  app falls back to downloads where it can.
- To update: rebuild the folder with "npm run dist:web" and replace it.

Files loaded by index.html:
  styles.css, themes/*.css,
  sabaki-bundle.js, path-spec.js, scoring.js, engine-core.js, engine.js,
  renderer.js

The MIT licence is in LICENSE, and also as license.html for hosts that publish
only html/css/js assets.
`

const launcher = `@echo off
rem Open the portable web build with the default browser.
start "" "%~dp0index.html"
`

async function copyFile(relativePath) {
  const from = path.join(src, relativePath)
  const to = path.join(out, relativePath)
  await fs.mkdir(path.dirname(to), { recursive: true })
  await fs.copyFile(from, to)
  return relativePath
}

async function walkFiles(dir, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const result = []
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name)
    if (entry.isDirectory()) {
      result.push(...(await walkFiles(path.join(dir, entry.name), relative)))
    } else {
      result.push(relative)
    }
  }
  return result
}

await fs.rm(out, { recursive: true, force: true })
await fs.mkdir(out, { recursive: true })

const copied = []
for (const file of files) copied.push(await copyFile(file))
for (const dir of dirs) {
  const entries = await fs.readdir(path.join(src, dir), { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    copied.push(await copyFile(path.join(dir, entry.name)))
  }
}

// Optional SGF study records (git-ignored, refreshed on every build).
const sgfSource = path.join(root, 'AQ', 'sgf', '十三路打谱操')
const sgfTarget = path.join(out, 'sgf', '十三路打谱操')
let sgfFiles = 0
try {
  await fs.cp(sgfSource, sgfTarget, { recursive: true })
  sgfFiles = (await walkFiles(sgfTarget)).length
} catch {
  // No local SGF folder (clean clone / CI): build without the records.
}

await fs.copyFile(path.join(root, 'LICENSE'), path.join(out, 'LICENSE'))
// license.html is checked in under src/ rather than generated here, so hosts
// that publish the source tree directly still serve the MIT notice.
const sgfNote = sgfFiles
  ? `\nBundled study records: ${sgfFiles} SGF files in sgf/十三路打谱操.\n`
  : ''
await fs.writeFile(path.join(out, 'README.txt'), readme + sgfNote, 'utf8')
await fs.writeFile(path.join(out, 'Open MultiGo Neo.cmd'), launcher.replace(/\n/g, '\r\n'), 'utf8')

// Release archive: same files, same names, written from the finished folder.
const zipPath = path.join(root, 'release', `MultiGo-Neo-${pkg.version}-web.zip`)
const zipEntries = []
for (const relative of await walkFiles(out)) {
  const full = path.join(out, relative)
  zipEntries.push({
    name: relative.split(path.sep).join('/'),
    data: await fs.readFile(full),
    date: (await fs.stat(full)).mtime,
  })
}
await fs.mkdir(path.dirname(zipPath), { recursive: true })
await fs.writeFile(zipPath, createZip(zipEntries))

// Sanity check: every relative href/src in index.html must exist in the output.
const index = await fs.readFile(path.join(out, 'index.html'), 'utf8')
const references = [...index.matchAll(/(?:href|src)="([^"#:]+)"/g)]
  .map((match) => match[1])
  .filter((value) => !value.startsWith('data:'))
const missing = []
for (const reference of references) {
  try {
    await fs.access(path.join(out, reference))
  } catch {
    missing.push(reference)
  }
}
if (missing.length) {
  throw new Error(`Missing output files referenced by index.html: ${missing.join(', ')}`)
}

const all = await walkFiles(out)
let bytes = 0
for (const file of all) bytes += (await fs.stat(path.join(out, file))).size

console.log(`Built ${path.relative(root, out)} with ${all.length} files (${(bytes / 1024 / 1024).toFixed(2)} MB).`)
console.log(`Web zip: ${path.relative(root, zipPath)} (${((await fs.stat(zipPath)).size / 1024 / 1024).toFixed(2)} MB)`)
console.log(`Open: ${path.join(out, 'index.html')}`)
console.log(`Resources checked: ${references.length}, missing: ${missing.length}`)
console.log(`Bundled SGF records: ${sgfFiles}`)
