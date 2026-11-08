#!/usr/bin/env node
// Renders the stone-capture bowl sound from src/renderer.js:playCaptureSound()
// into preview/capture-sound.wav and a small JSON manifest of its cues.
//
// preview/capture-sound-test.html builds the same voice with Web Audio and is
// the interactive version; this script is the dependency-free offline copy so
// the sound can be auditioned or attached without opening the app.
//
// The capture voice is deliberately bright: like Sabaki's recorded capture
// samples (95% of their energy above 2 kHz), the high-passed rattle is what
// makes the sound audible on laptop speakers, where the wooden body at
// 105-220 Hz is nearly out of range.
//
// Usage: node scripts/render-capture-sound.mjs [output.wav]

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

const SAMPLE_RATE = 44100
const TARGET_PEAK = 0.95 // -0.5 dBFS
const LEAD_IN = 0.3
const GAP = 0.75
const TAIL = 0.5

// Kept in step with playCaptureSound(): same frequencies, gains and timings.
const VOICE = {
  maxStones: 8,
  gapMin: 0.028,
  gapSpread: 0.018,
  body: {
    f0: 220,
    f1: 105,
    sweep: 0.1,
    step: 8,
    cents: 70,
    peak: 0.22,
    attack: 0.006,
    decay: 0.12,
    stop: 0.13,
  },
  click: {
    f0: 1350,
    step: 25,
    cents: 50,
    peak: 0.15,
    attack: 0.002,
    decay: 0.045,
    stop: 0.05,
  },
  rattle: {
    peak: 0.6,
    attack: 0.002,
    decay: 0.4,
    stop: 0.42,
    highpass: 1400,
    lowpass: 6500,
    q: 0.707,
    noiseSeconds: 1.5,
    seed: 0x9e3779b9,
    noiseOffsetMax: 0.9,
  },
}

// Fixed seed for the rendered audition; the app draws a fresh seed per capture.
const RENDER_SEED = 0x51ed270b

const clampStones = (count) => Math.min(VOICE.maxStones, Math.max(1, Math.round(count)))

function makeRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Same draw order as planCaptureStones() in src/renderer.js.
function planStones(count, seed) {
  const stones = clampStones(count)
  const random = makeRandom(seed)
  const plan = []
  let at = 0
  for (let index = 0; index < stones; index += 1) {
    if (index > 0) at += VOICE.gapMin + random() * VOICE.gapSpread
    const bodyCents = (random() * 2 - 1) * VOICE.body.cents
    const clickCents = (random() * 2 - 1) * VOICE.click.cents
    plan.push({
      at,
      bodyHz: (VOICE.body.f0 - index * VOICE.body.step) * 2 ** (bodyCents / 1200),
      clickHz: (VOICE.click.f0 - index * VOICE.click.step) * 2 ** (clickCents / 1200),
      noiseOffset: random() * VOICE.rattle.noiseOffsetMax,
    })
  }
  return plan
}

// Web Audio exponential ramps: 0.0001 -> peak over `attack`, then peak ->
// 0.0001 over `decay - attack`, held at 0.0001 until the oscillator stops.
function gainAt(t, peak, attack, decay) {
  if (t < 0) return 0
  if (t < attack) return 0.0001 * (peak / 0.0001) ** (t / attack)
  if (t < decay) return peak * (0.0001 / peak) ** ((t - attack) / (decay - attack))
  return 0.0001
}

function addBody(out, at, f0) {
  const start = Math.round(at * SAMPLE_RATE)
  const length = Math.round(VOICE.body.stop * SAMPLE_RATE)
  let phase = 0
  for (let n = 0; n < length; n += 1) {
    if (start + n >= out.length) break
    const t = n / SAMPLE_RATE
    const frequency = t < VOICE.body.sweep
      ? f0 * (VOICE.body.f1 / f0) ** (t / VOICE.body.sweep)
      : VOICE.body.f1
    phase += (2 * Math.PI * frequency) / SAMPLE_RATE
    const triangle = (2 / Math.PI) * Math.asin(Math.sin(phase))
    out[start + n] += triangle * gainAt(t, VOICE.body.peak, VOICE.body.attack, VOICE.body.decay)
  }
}

function addClick(out, at, frequency) {
  const start = Math.round(at * SAMPLE_RATE)
  const length = Math.round(VOICE.click.stop * SAMPLE_RATE)
  const harmonics = Math.max(1, Math.floor(SAMPLE_RATE / 2 / frequency))
  const omega = 2 * Math.PI * frequency
  for (let n = 0; n < length; n += 1) {
    if (start + n >= out.length) break
    const t = n / SAMPLE_RATE
    let square = 0
    for (let k = 1; k <= harmonics; k += 2) square += Math.sin(omega * k * t) / k
    square *= 4 / Math.PI
    out[start + n] += square * gainAt(t, VOICE.click.peak, VOICE.click.attack, VOICE.click.decay)
  }
}

// Deterministic white noise, matching the LCG in src/renderer.js.
function makeNoise(seconds) {
  const length = Math.ceil(seconds * SAMPLE_RATE)
  const noise = new Float64Array(length)
  let seed = VOICE.rattle.seed
  for (let i = 0; i < length; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    noise[i] = (seed / 4294967296) * 2 - 1
  }
  return noise
}

// RBJ biquad, the same shape Web Audio uses for its BiquadFilterNode.
function biquad(input, type, frequency, q) {
  const w0 = (2 * Math.PI * frequency) / SAMPLE_RATE
  const cosine = Math.cos(w0)
  const sine = Math.sin(w0)
  const alpha = sine / (2 * q)
  let b0
  let b1
  let b2
  if (type === 'highpass') {
    b0 = (1 + cosine) / 2
    b1 = -(1 + cosine)
    b2 = (1 + cosine) / 2
  } else {
    b0 = (1 - cosine) / 2
    b1 = 1 - cosine
    b2 = (1 - cosine) / 2
  }
  const a0 = 1 + alpha
  const a1 = -2 * cosine
  const a2 = 1 - alpha
  const out = new Float64Array(input.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < input.length; i += 1) {
    const x = input[i]
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    out[i] = y
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
  }
  return out
}

const rattleNoise = biquad(
  biquad(makeNoise(VOICE.rattle.noiseSeconds), 'highpass', VOICE.rattle.highpass, VOICE.rattle.q),
  'lowpass',
  VOICE.rattle.lowpass,
  VOICE.rattle.q,
)

function addRattle(out, at, offsetSeconds) {
  const start = Math.round(at * SAMPLE_RATE)
  const offset = Math.round(offsetSeconds * SAMPLE_RATE)
  const length = Math.round(VOICE.rattle.stop * SAMPLE_RATE)
  for (let n = 0; n < length; n += 1) {
    if (start + n >= out.length) break
    const t = n / SAMPLE_RATE
    out[start + n] += rattleNoise[offset + n]
      * gainAt(t, VOICE.rattle.peak, VOICE.rattle.attack, VOICE.rattle.decay)
  }
}

function renderVoice(count) {
  const plan = planStones(count, RENDER_SEED)
  const seconds = plan[plan.length - 1].at + VOICE.rattle.stop + 0.05
  const out = new Float64Array(Math.ceil(seconds * SAMPLE_RATE))
  for (const stone of plan) {
    addBody(out, stone.at, stone.bodyHz)
    addClick(out, stone.at, stone.clickHz)
    addRattle(out, stone.at, stone.noiseOffset)
  }
  return out
}

function peakOf(samples) {
  let peak = 0
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample))
  return peak
}

function rmsOf(samples) {
  let sum = 0
  for (const sample of samples) sum += sample * sample
  return Math.sqrt(sum / Math.max(1, samples.length))
}

function encodeWav(samples, sampleRate) {
  const dataLength = samples.length * 2
  const buffer = Buffer.alloc(44 + dataLength)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataLength, 40)
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2)
  }
  return buffer
}

const plan = [1, 3, 8].map((count) => ({ count, data: renderVoice(count) }))
let cursor = LEAD_IN
for (const item of plan) {
  item.start = cursor
  cursor += item.data.length / SAMPLE_RATE + GAP
}
const totalSeconds = cursor - GAP + TAIL
const track = new Float64Array(Math.ceil(totalSeconds * SAMPLE_RATE))
for (const item of plan) {
  const offset = Math.round(item.start * SAMPLE_RATE)
  for (let i = 0; i < item.data.length && offset + i < track.length; i += 1) {
    track[offset + i] += item.data[i]
  }
}

const rawPeak = peakOf(track)
const normalization = TARGET_PEAK / rawPeak
for (let i = 0; i < track.length; i += 1) track[i] *= normalization

const outputPath = path.resolve(process.argv[2] ?? path.join(root, 'preview/capture-sound.wav'))
const manifestPath = outputPath.replace(/\.wav$/i, '.json')
await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, encodeWav(track, SAMPLE_RATE))

const manifest = {
  generatedBy: 'scripts/render-capture-sound.mjs',
  description:
    'Stone-capture bowl sound from playCaptureSound() in src/renderer.js: wooden body, bowl click and a bright high-passed rattle, rendered offline as an audition track (one, three and eight stones). Stones land 28-46 ms apart with a small pitch jitter.',
  sampleRate: SAMPLE_RATE,
  channels: 1,
  bits: 16,
  duration: Number((track.length / SAMPLE_RATE).toFixed(3)),
  targetPeak: TARGET_PEAK,
  normalizeGain: Number(normalization.toFixed(4)),
  normalizeDb: Number((20 * Math.log10(normalization)).toFixed(2)),
  rawPeak: Number(rawPeak.toFixed(6)),
  randomization: {
    seed: RENDER_SEED,
    note: 'The app draws a fresh seed per capture; this WAV uses a fixed seed so it is reproducible.',
    gapMs: [VOICE.gapMin * 1000, (VOICE.gapMin + VOICE.gapSpread) * 1000],
    bodyCents: VOICE.body.cents,
    clickCents: VOICE.click.cents,
    noiseOffsetMaxSeconds: VOICE.rattle.noiseOffsetMax,
  },
  voice: {
    maxStones: VOICE.maxStones,
    gapSeconds: { min: VOICE.gapMin, max: VOICE.gapMin + VOICE.gapSpread },
    body: {
      wave: 'triangle',
      fromHz: VOICE.body.f0,
      toHz: VOICE.body.f1,
      sweepSeconds: VOICE.body.sweep,
      hzPerStone: VOICE.body.step,
      pitchJitterCents: VOICE.body.cents,
      peakGain: VOICE.body.peak,
      attackSeconds: VOICE.body.attack,
      decaySeconds: VOICE.body.decay,
      stopSeconds: VOICE.body.stop,
    },
    click: {
      wave: 'square',
      hz: VOICE.click.f0,
      hzPerStone: VOICE.click.step,
      pitchJitterCents: VOICE.click.cents,
      peakGain: VOICE.click.peak,
      attackSeconds: VOICE.click.attack,
      decaySeconds: VOICE.click.decay,
      stopSeconds: VOICE.click.stop,
    },
    rattle: {
      source: 'deterministic white noise',
      seed: VOICE.rattle.seed,
      filter: {
        highpassHz: VOICE.rattle.highpass,
        lowpassHz: VOICE.rattle.lowpass,
        q: VOICE.rattle.q,
      },
      peakGain: VOICE.rattle.peak,
      attackSeconds: VOICE.rattle.attack,
      decaySeconds: VOICE.rattle.decay,
      stopSeconds: VOICE.rattle.stop,
      noiseSeconds: VOICE.rattle.noiseSeconds,
      noiseOffsetMaxSeconds: VOICE.rattle.noiseOffsetMax,
    },
  },
  sections: plan.map((item) => ({
    count: item.count,
    start: Number(item.start.toFixed(3)),
    duration: Number((item.data.length / SAMPLE_RATE).toFixed(3)),
    rawPeak: Number(peakOf(item.data).toFixed(6)),
    rawRms: Number(rmsOf(item.data).toFixed(6)),
    schedule: planStones(item.count, RENDER_SEED).map((stone) => ({
      at: Number(stone.at.toFixed(4)),
      bodyHz: Number(stone.bodyHz.toFixed(2)),
      clickHz: Number(stone.clickHz.toFixed(2)),
      noiseOffset: Number(stone.noiseOffset.toFixed(4)),
    })),
  })),
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`Rendered ${outputPath}`)
console.log(
  `  ${manifest.duration}s, ${SAMPLE_RATE} Hz mono 16-bit, peak ${manifest.targetPeak} ` +
  `(${manifest.normalizeDb >= 0 ? '+' : ''}${manifest.normalizeDb} dB audition gain)`,
)
for (const section of manifest.sections) {
  console.log(
    `  ${String(section.count).padStart(2)} stone${section.count === 1 ? ' ' : 's'} @ ` +
    `${section.start.toFixed(2)}s · raw peak ${section.rawPeak} · rms ${section.rawRms}`,
  )
}
console.log(`Wrote ${manifestPath}`)
