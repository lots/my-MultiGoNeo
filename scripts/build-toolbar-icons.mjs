// Rebuild the inline SVG sprite from the editable files in src/assets/icons.
// Run after changing an icon:  npm run icons:build
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const iconDir = path.join(root, 'src', 'assets', 'icons')
const htmlPath = path.join(root, 'src', 'index.html')

const files = (await fs.readdir(iconDir))
  .filter((name) => name.endsWith('.svg'))
  .sort((a, b) => a.localeCompare(b))

const symbols = []
for (const file of files) {
  const name = file.replace(/\.svg$/, '')
  const svg = await fs.readFile(path.join(iconDir, file), 'utf8')
  const viewBox = (svg.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 24 24'
  const body = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim()
  symbols.push(`    <symbol id="i-${name}" viewBox="${viewBox}">\n${body}\n    </symbol>`)
}

let html = await fs.readFile(htmlPath, 'utf8')
html = html.replace(/\s*<svg class="sprite"[\s\S]*?<\/svg>\s*/, '\n')
const sprite = `  <svg class="sprite" aria-hidden="true" focusable="false">\n${symbols.join('\n')}\n  </svg>\n`
html = html.replace(/(<body[^>]*>\s*)/, `$1${sprite}`)
html = html.replace(
  /<span class="tool-icon" style="--icon:url\('assets\/icons\/([^']+)\.svg'\)" aria-hidden="true"><\/span>/g,
  (_, name) => `<svg class="icon"><use href="#i-${name}"></use></svg>`,
)
await fs.writeFile(htmlPath, html, 'utf8')
console.log(`Rebuilt sprite with ${symbols.length} icons from src/assets/icons`)
