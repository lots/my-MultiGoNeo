// CDP check for preview/capture-sound-test.html plus a level/timing check of
// the rendered preview/capture-sound.wav.
//
// Usage: node scripts/verify-capture-sound-test-ui.mjs [port] [url]
// Expects a Chrome started with --remote-debugging-port=<port>.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const port = process.argv[2] ?? '9360'
const root = process.cwd()
const url = process.argv[3] ?? `file:///${root.replaceAll('\\', '/')}/preview/capture-sound-test.html`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const failures = []
const check = (condition, message) => { if (!condition) failures.push(message) }

async function findTarget() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
      if (page) return page
    } catch {}
    await sleep(150)
  }
  throw new Error(`No DevTools target on ${port}`)
}

const page = await findTarget()
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

let seq = 1
const pending = new Map()
const errors = []
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
    return
  }
  if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
  }
})

function send(method, params = {}) {
  const id = seq++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  }
  return result.result.value
}
async function waitForApi() {
  for (let i = 0; i < 100; i += 1) {
    if (await evaluate('window.__captureSoundTest !== undefined').catch(() => false)) return
    await sleep(100)
  }
  throw new Error('The sound-test page did not boot')
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1024,
  deviceScaleFactor: 1,
  mobile: false,
})
await send('Emulation.setScrollbarsHidden', { hidden: true })
await sleep(120)
// A per-run query defeats file:// caching so the screenshot always reflects
// the current HTML.
const runUrl = `${url}${url.includes('?') ? '&' : '?'}run=${Date.now()}`
await send('Page.navigate', { url: runUrl })
await waitForApi()
await sleep(250)

const result = await evaluate(`(async () => {
  const api = window.__captureSoundTest;
  const before = api.state();
  const after = await api.capture(1);
  await api.waveReady();
  return {
    title: document.title,
    before,
    after,
    status: document.getElementById('status').textContent.trim(),
    caption: document.getElementById('wave-caption').textContent.trim(),
    bowBadge: document.getElementById('bowl-black-count').textContent.trim(),
    layout: {
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    },
  };
})()`)
await sleep(150)

const shot = await send('Page.captureScreenshot', { format: 'png' })
await mkdir(path.join(root, 'preview'), { recursive: true })
await writeFile(path.join(root, 'preview/preview-capture-sound.png'), Buffer.from(shot.data, 'base64'))

// The same page must handle a group and the staggered eight-stone voice.
const multi = await evaluate(`(async () => {
  const api = window.__captureSoundTest;
  const three = await api.capture(3);
  const eight = await api.capture(8);
  await api.waveReady();
  return { three, eight, final: api.state(), caption: document.getElementById('wave-caption').textContent.trim() };
})()`)

// ── The page did the thing it claims ───────────────────────────────────────
check(result.before.whiteStones === 1, `expected one white stone before the capture, saw ${result.before.whiteStones}`)
check(result.after.phase === 'done', `capture did not finish (phase ${result.after.phase})`)
check(result.after.whiteStones === 0, `white stone still on the board (${result.after.whiteStones})`)
check(result.after.blackStones === 4, `expected four black stones after the capture, saw ${result.after.blackStones}`)
check(result.after.captured === 1, `expected one captured stone, saw ${result.after.captured}`)
check(result.after.capturedAt.includes('E5'), `captured point was ${result.after.capturedAt.join(',')}, expected E5`)
check(result.after.bowlBlack === 1, `black bowl shows ${result.after.bowlBlack}, expected 1`)
check(result.after.oscillators === 2, `expected two oscillators per stone, saw ${result.after.oscillators}`)
check(result.after.plays === 1, `expected one capture playback, saw ${result.after.plays}`)
check(/captured/i.test(result.status), `status did not report the capture: ${result.status}`)
check(result.bowBadge === '1', `bowl badge shows ${result.bowBadge}, expected 1`)
check(
  result.layout.scrollHeight <= result.layout.innerHeight + 1,
  `the page scrolls at 1440×1024 (${result.layout.scrollHeight} px content in ${result.layout.innerHeight} px)`,
)
check(multi.three.captured === 3, `three-stone scene captured ${multi.three.captured}`)
check(multi.three.whiteStones === 0, `three-stone scene left ${multi.three.whiteStones} white stones`)
check(multi.three.blackStones === 8, `three-stone scene ended with ${multi.three.blackStones} black stones, expected 8`)
check(multi.three.bowlBlack === 3, `three-stone scene bowl shows ${multi.three.bowlBlack}, expected 3`)
check(multi.eight.captured === 8, `eight-stone scene captured ${multi.eight.captured}`)
check(multi.eight.whiteStones === 0, `eight-stone scene left ${multi.eight.whiteStones} white stones`)
check(multi.eight.blackStones === 12, `eight-stone scene ended with ${multi.eight.blackStones} black stones, expected 12`)
check(multi.eight.bowlBlack === 8, `eight-stone scene bowl shows ${multi.eight.bowlBlack}, expected 8`)
check(multi.final.oscillators === 24, `expected 24 oscillators for 1+3+8 stones, saw ${multi.final.oscillators}`)
check(multi.final.plays === 3, `expected three playbacks, saw ${multi.final.plays}`)
check(/^8 stones/.test(multi.caption), `wave caption did not switch to eight stones: ${multi.caption}`)

// ── The audio graph and the WAV agree on shape and level ───────────────────
const pcm = await evaluate('window.__captureSoundTest.renderPCM(1)')
const wav = await readFile(path.join(root, 'preview/capture-sound.wav'))
const manifest = JSON.parse(await readFile(path.join(root, 'preview/capture-sound.json'), 'utf8'))

// The stones must not land on a metronome: gaps and pitches vary per stone,
// and the page's schedule must match the one baked into the WAV.
const eight = manifest.sections.find((section) => section.count === 8)
const gaps = eight.schedule.slice(1).map((stone, index) => stone.at - eight.schedule[index].at)
check(
  gaps.every((gap) => gap >= 0.026 && gap <= 0.048),
  `stone gaps are outside 28-46 ms: ${gaps.map((gap) => (gap * 1000).toFixed(1)).join(', ')}`,
)
check(
  Math.max(...gaps) - Math.min(...gaps) > 0.003,
  `stone gaps are too regular: ${gaps.map((gap) => (gap * 1000).toFixed(1)).join(', ')}`,
)
const bodyHeights = eight.schedule.map((stone) => stone.bodyHz)
check(
  Math.max(...bodyHeights) - Math.min(...bodyHeights) > 5,
  `stone pitches are too uniform: ${bodyHeights.map((hz) => hz.toFixed(0)).join(', ')}`,
)
const clickHeights = eight.schedule.map((stone) => stone.clickHz)
check(
  Math.max(...clickHeights) - Math.min(...clickHeights) > 5,
  `click pitches are too uniform: ${clickHeights.map((hz) => hz.toFixed(0)).join(', ')}`,
)

const pageSchedule = await evaluate('window.__captureSoundTest.schedule(8)')
check(pageSchedule.length === 8, `page schedule has ${pageSchedule.length} stones, expected 8`)
check(
  pageSchedule.every((stone, index) => (
    Math.abs(stone.at - eight.schedule[index].at) < 0.0002
    && Math.abs(stone.bodyHz - eight.schedule[index].bodyHz) < 0.05
  )),
  'the page schedule differs from the WAV schedule',
)

function parseWav(buffer) {
  const ascii = (offset, length) => buffer.toString('ascii', offset, offset + length)
  const channels = buffer.readUInt16LE(22)
  const sampleRate = buffer.readUInt32LE(24)
  const bits = buffer.readUInt16LE(34)
  let offset = 12
  let dataOffset = 44
  let dataLength = buffer.length - 44
  while (offset + 8 <= buffer.length) {
    const id = ascii(offset, 4)
    const size = buffer.readUInt32LE(offset + 4)
    if (id === 'data') { dataOffset = offset + 8; dataLength = size; break }
    offset += 8 + size + (size % 2)
  }
  const samples = new Float64Array(dataLength / 2)
  for (let i = 0; i < samples.length; i += 1) samples[i] = buffer.readInt16LE(dataOffset + i * 2) / 32768
  return { channels, sampleRate, bits, samples, duration: samples.length / sampleRate }
}

check(asciiHeader(wav), 'capture-sound.wav is not a RIFF/WAVE file')
function asciiHeader(buffer) {
  return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE'
}

const decoded = parseWav(wav)
check(decoded.channels === 1, `WAV channels ${decoded.channels}, expected 1`)
check(decoded.sampleRate === 44100, `WAV rate ${decoded.sampleRate}, expected 44100`)
check(decoded.bits === 16, `WAV bits ${decoded.bits}, expected 16`)
check(Math.abs(decoded.duration - manifest.duration) < 0.01, `WAV duration ${decoded.duration}, manifest ${manifest.duration}`)

let peak = 0
let energy = 0
for (const sample of decoded.samples) {
  peak = Math.max(peak, Math.abs(sample))
  energy += sample * sample
}
const rms = Math.sqrt(energy / decoded.samples.length)
check(Math.abs(peak - manifest.targetPeak) < 0.006, `WAV peak ${peak.toFixed(3)}, expected ${manifest.targetPeak}`)
check(rms > 0.02, `WAV rms ${rms.toFixed(4)} looks silent`)

// Each section must start (and be loud) where the manifest says.
for (const section of manifest.sections) {
  const from = Math.max(0, Math.round((section.start - 0.02) * decoded.sampleRate))
  const to = Math.min(decoded.samples.length, Math.round((section.start + 0.08) * decoded.sampleRate))
  let onset = -1
  for (let i = from; i < to; i += 1) {
    if (Math.abs(decoded.samples[i]) > 0.05) { onset = i / decoded.sampleRate; break }
  }
  check(onset >= 0, `no onset found for the ${section.count}-stone section at ${section.start}s`)
  if (onset >= 0) {
    check(
      Math.abs(onset - section.start) < 0.012,
      `${section.count}-stone onset at ${onset.toFixed(3)}s, manifest says ${section.start}s`,
    )
  }
  const window = decoded.samples.subarray(
    Math.round(section.start * decoded.sampleRate),
    Math.round((section.start + 0.12) * decoded.sampleRate),
  )
  let sectionRms = 0
  for (const sample of window) sectionRms += sample * sample
  sectionRms = Math.sqrt(sectionRms / window.length)
  check(sectionRms > 0.01, `${section.count}-stone section is quiet (rms ${sectionRms.toFixed(4)})`)
}

// The capture must be bright, not just loud: Sabaki's recorded captures put
// 95% of their energy above 2 kHz, and a bass-only mix is inaudible on laptop
// speakers even at full scale.
function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const real = re[i]
      re[i] = re[j]
      re[j] = real
      const imaginary = im[i]
      im[i] = im[j]
      im[j] = imaginary
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len
    const wRe = Math.cos(angle)
    const wIm = Math.sin(angle)
    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0
      for (let j = 0; j < len / 2; j += 1) {
        const uRe = re[i + j]
        const uIm = im[i + j]
        const vRe = re[i + j + len / 2] * curRe - im[i + j + len / 2] * curIm
        const vIm = re[i + j + len / 2] * curIm + im[i + j + len / 2] * curRe
        re[i + j] = uRe + vRe
        im[i + j] = uIm + vIm
        re[i + j + len / 2] = uRe - vRe
        im[i + j + len / 2] = uIm - vIm
        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }
}

// Welch average over the whole single-stone section: a single peak window can
// land on one noise spike and badly overstate or understate the brightness.
function averageSpectrum(samples, from, to, size = 1024) {
  const power = new Float64Array(size / 2)
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  let windows = 0
  for (let start = from; start + size <= to; start += size / 2) {
    for (let i = 0; i < size; i += 1) {
      re[i] = samples[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)))
      im[i] = 0
    }
    fft(re, im)
    for (let k = 0; k < size / 2; k += 1) power[k] += re[k] * re[k] + im[k] * im[k]
    windows += 1
  }
  const binHz = decoded.sampleRate / size
  let low = 0
  let mid = 0
  let high = 0
  let total = 0
  let centroid = 0
  for (let k = 1; k < size / 2; k += 1) {
    const frequency = k * binHz
    const bandEnergy = power[k] / Math.max(1, windows)
    total += bandEnergy
    centroid += frequency * bandEnergy
    if (frequency < 300) low += bandEnergy
    else if (frequency < 2000) mid += bandEnergy
    else high += bandEnergy
  }
  return { low: low / total, mid: mid / total, high: high / total, centroid: centroid / total }
}

const first = manifest.sections[0]
const sectionStart = Math.round(first.start * decoded.sampleRate)
const sectionEnd = Math.min(
  decoded.samples.length,
  Math.round((first.start + first.duration) * decoded.sampleRate),
)
const spectrum = averageSpectrum(decoded.samples, sectionStart, sectionEnd)
check(spectrum.high > 0.5, `capture is too dark: ${(spectrum.high * 100).toFixed(0)}% of energy above 2 kHz`)
check(spectrum.centroid > 2000, `spectral centroid ${Math.round(spectrum.centroid)} Hz is too low`)
check(spectrum.low < 0.4, `too much sub-300 Hz energy (${(spectrum.low * 100).toFixed(0)}%)`)
check(spectrum.mid > 0.02, `mid band is almost empty (${(spectrum.mid * 100).toFixed(1)}%)`)

// The page's Web Audio render and the WAV should have the same envelope.
function envelope(samples, pointsPerSecond = 200) {
  const window = Math.max(1, Math.round(decoded.sampleRate / pointsPerSecond))
  const points = []
  for (let i = 0; i + window <= samples.length; i += window) {
    let local = 0
    for (let j = i; j < i + window; j += 1) local = Math.max(local, Math.abs(samples[j]))
    points.push(local)
  }
  return points
}
const pageEnvelope = envelope(pcm)
const wavEnvelope = envelope(
  decoded.samples.subarray(
    Math.round(first.start * decoded.sampleRate),
    Math.round((first.start + 0.18) * decoded.sampleRate),
  ),
)
let dot = 0
let pageNorm = 0
let wavNorm = 0
for (let i = 0; i < Math.min(pageEnvelope.length, wavEnvelope.length); i += 1) {
  dot += pageEnvelope[i] * wavEnvelope[i]
  pageNorm += pageEnvelope[i] ** 2
  wavNorm += wavEnvelope[i] ** 2
}
const similarity = dot / Math.sqrt(pageNorm * wavNorm)
check(similarity > 0.9, `page and WAV envelopes differ (similarity ${similarity.toFixed(3)})`)

console.log(JSON.stringify({
  page: result,
  wav: {
    duration: decoded.duration,
    peak: Number(peak.toFixed(4)),
    rms: Number(rms.toFixed(4)),
    normalizeDb: manifest.normalizeDb,
    sections: manifest.sections.map((section) => ({ count: section.count, start: section.start })),
    spectrum: {
      low: Number(spectrum.low.toFixed(3)),
      mid: Number(spectrum.mid.toFixed(3)),
      high: Number(spectrum.high.toFixed(3)),
      centroidHz: Math.round(spectrum.centroid),
    },
    eightStoneGapsMs: gaps.map((gap) => Number((gap * 1000).toFixed(1))),
    eightStonePitchHz: {
      body: [Number(Math.min(...bodyHeights).toFixed(1)), Number(Math.max(...bodyHeights).toFixed(1))],
      click: [Number(Math.min(...clickHeights).toFixed(1)), Number(Math.max(...clickHeights).toFixed(1))],
    },
  },
  envelopeSimilarity: Number(similarity.toFixed(4)),
  errors,
  failures,
}, null, 2))

ws.close()
process.exitCode = failures.length === 0 && errors.length === 0 ? 0 : 1
