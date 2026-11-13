import fs from 'node:fs/promises'
import path from 'node:path'
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
 * Everything is referenced relatively and nothing is fetched at runtime, so the
 * folder can be copied to a USB stick and opened from file:// on another PC.
 *
 *   node scripts/build-web-portable.mjs [outputDir]
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'src')
const out = path.resolve(process.argv[2] ?? path.join(root, 'web-portable'))
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))

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

await fs.copyFile(path.join(root, 'LICENSE'), path.join(out, 'LICENSE'))
// license.html is checked in under src/ rather than generated here, so hosts
// that publish the source tree directly still serve the MIT notice.
await fs.writeFile(path.join(out, 'README.txt'), readme, 'utf8')
await fs.writeFile(path.join(out, 'Open MultiGo Neo.cmd'), launcher.replace(/\n/g, '\r\n'), 'utf8')

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

const all = []
for (const entry of await fs.readdir(out, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    for (const child of await fs.readdir(path.join(out, entry.name))) {
      all.push(path.join(entry.name, child))
    }
  } else {
    all.push(entry.name)
  }
}
let bytes = 0
for (const file of all) bytes += (await fs.stat(path.join(out, file))).size

console.log(`Built ${path.relative(root, out)} with ${all.length} files (${(bytes / 1024 / 1024).toFixed(2)} MB).`)
console.log(`Open: ${path.join(out, 'index.html')}`)
console.log(`Resources checked: ${references.length}, missing: ${missing.length}`)
