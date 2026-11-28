// Renders README.md, Features.md, Tutorial.md and Reference.md to PDF with Chrome's DevTools
// print-to-PDF. Markdown is rendered by marked (run through npx), so images and
// tables keep their document-relative paths.
//
//   node scripts/build-docs-pdf.mjs
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const root = process.cwd()
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const port = 9371
const documents = ['README.md', 'Features.md', 'Tutorial.md', 'Reference.md']
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const style = `
<style>
  @page { size: A4; margin: 15mm 13mm 17mm; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    color: #202124;
    font-family: "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
    font-size: 10.2pt;
    line-height: 1.45;
  }
  main { max-width: 100%; }
  h1, h2, h3, h4 { color: #111; line-height: 1.2; break-after: avoid-page; page-break-after: avoid; }
  h1 { margin: 0 0 10px; padding-bottom: 6px; border-bottom: 2px solid #333; font-size: 22pt; }
  h2 { margin: 20px 0 8px; padding-bottom: 3px; border-bottom: 1px solid #bbb; font-size: 15pt; }
  h3 { margin: 14px 0 6px; font-size: 12.5pt; }
  h4 { margin: 11px 0 4px; font-size: 11pt; }
  p { margin: 5px 0 8px; }
  ul, ol { margin: 4px 0 9px; padding-left: 22px; }
  li { margin: 2px 0; }
  a { color: #0b5cad; text-decoration: none; overflow-wrap: anywhere; }
  code { padding: 1px 3px; border-radius: 2px; background: #f1f3f4; font-family: Consolas, "Cascadia Mono", monospace; font-size: 8.8pt; }
  pre { margin: 8px 0; padding: 8px 10px; border: 1px solid #ddd; border-radius: 3px; background: #f7f7f7; white-space: pre-wrap; overflow-wrap: anywhere; }
  pre code { padding: 0; background: transparent; font-size: 8.4pt; }
  blockquote { margin: 8px 0; padding: 5px 10px; border-left: 3px solid #c5c5c5; background: #fafafa; color: #444; }
  table { width: 100%; margin: 8px 0 12px; border-collapse: collapse; font-size: 8.8pt; }
  th, td { padding: 4px 6px; border: 1px solid #cfcfcf; text-align: left; vertical-align: top; }
  th { background: #eeeeee; font-weight: 600; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  img { display: block; max-width: 100%; height: auto; margin: 8px auto 12px; border: 1px solid #ddd; break-inside: avoid; page-break-inside: avoid; }
  h1 img { display: inline-block; width: 1.15em; height: 1.15em; margin: 0 0.28em 0 0; border: 0; vertical-align: -0.12em; }
  hr { margin: 14px 0; border: 0; border-top: 1px solid #ccc; }
</style>`

const proc = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${port}`,
  '--remote-allow-origins=*',
  `--user-data-dir=${path.join(process.env.TEMP, `multigo-pdf-${Date.now()}`)}`,
  'about:blank',
], { stdio: 'ignore' })

async function target() {
  for (let i = 0; i < 150; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
      if (page) return page
    } catch {}
    await sleep(100)
  }
  throw new Error('Chrome DevTools target did not start')
}

try {
  const page = await target()
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let seq = 1
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = seq++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }

  await send('Page.enable')
  await send('Runtime.enable')

  for (const document of documents) {
    const base = document.replace(/\.md$/i, '')
    const mdPath = path.join(root, document)
    if (!existsSync(mdPath)) throw new Error(`Missing ${mdPath}`)
    const htmlPath = path.join(root, `${base}.pdf-source.html`)
    const pdfPath = path.join(root, `${base}.pdf`)
    const marked = spawnSync('npx', ['--yes', 'marked@12.0.2', '-i', mdPath, '-o', htmlPath, '--gfm'], {
      cwd: root, stdio: 'inherit', shell: true,
    })
    if (marked.status !== 0) throw new Error(`marked failed for ${document}`)
    const fragment = await fs.readFile(htmlPath, 'utf8')
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${base}</title>${style}</head><body><main>${fragment}</main></body></html>`
    await fs.writeFile(htmlPath, html, 'utf8')

    await send('Page.navigate', { url: `file:///${htmlPath.replaceAll('\\', '/')}` })
    for (let i = 0; i < 100; i += 1) {
      const ready = await evaluate(`document.readyState === 'complete' && [...document.images].every((image) => image.complete)`).catch(() => false)
      if (ready) break
      await sleep(100)
    }
    await evaluate(`document.fonts ? document.fonts.ready.then(() => true) : true`)
    await sleep(300)

    const result = await send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    })
    await fs.writeFile(pdfPath, Buffer.from(result.data, 'base64'))
    await fs.rm(htmlPath, { force: true })
    const size = (await fs.stat(pdfPath)).size
    console.log(`Wrote ${pdfPath} (${size.toLocaleString()} bytes)`)
  }
  ws.close()
} finally {
  proc.kill()
}
