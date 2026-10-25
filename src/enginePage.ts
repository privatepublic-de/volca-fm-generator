// Phase 2's test page: the browser engine next to the volca, to compare voices by ear (PLAN §5).
import { algorithmOf } from './dx7/algorithms'
import { readSyx, vcedMessage } from './dx7/sysex'
import { VC, voiceName, type Voice } from './dx7/voice'
import { BrowserEngine } from './engine/engine'
import type { Model } from './engine/models'
import { findOutput, outputNames, requestWebMidi, send, webMidiUnavailable } from './midi/transport'
import { bright, octaves, paramTests, pure } from './probe/testVoices'

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T
const statusEl = $<HTMLSpanElement>('#status')
const voicesEl = $<HTMLUListElement>('#voices')
const infoEl = $<HTMLDivElement>('#info')
const modelSel = $<HTMLSelectElement>('#model')
const volumeIn = $<HTMLInputElement>('#volume')
const velocityIn = $<HTMLInputElement>('#velocity')
const outputSel = $<HTMLSelectElement>('#output')
const channelIn = $<HTMLInputElement>('#channel')

const SETTINGS_KEY = 'volca-engine:settings'
const settings = { model: 'fm2' as Model, volume: 2, port: '', channel: 1, target: 'browser' as Target }
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')) } catch { /* defaults */ }
const save = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* private window */ } }

type Target = 'browser' | 'volca' | 'both'
let engine: BrowserEngine | null = null
let output: MIDIOutput | null = null
let current: Voice = pure()
/** whether the volca has the current voice */
let volcaHasVoice = false

// ---------- voices ----------

interface Entry { voice: Voice; source: string }
const builtIn: Entry[] = [
  { voice: pure(), source: 'probe' }, { voice: bright(), source: 'probe' }, { voice: octaves(), source: 'probe' },
  ...paramTests().flatMap((t) => [{ voice: t.a, source: 'probe' }, { voice: t.b, source: 'probe' }]),
]
let loaded: Entry[] = []
let loadedName = ''

function listVoices() {
  const item = (e: Entry, i: number) => {
    const li = document.createElement('li')
    li.innerHTML = `<span class="src"></span><span class="name"></span>`
    li.querySelector('.src')!.textContent = e.source
    li.querySelector('.name')!.textContent = voiceName(e.voice)
    li.dataset.index = String(i)
    li.addEventListener('click', () => {
      for (const x of voicesEl.querySelectorAll('li.sel')) x.classList.remove('sel')
      li.classList.add('sel')
      selectVoice(e.voice)
    })
    return li
  }
  const group = (text: string) => {
    const li = document.createElement('li')
    li.className = 'group'
    li.textContent = text
    return li
  }
  voicesEl.replaceChildren(
    ...(loaded.length ? [group(loadedName), ...loaded.map((e, i) => item(e, i))] : []),
    group('Probe voices'), ...builtIn.map((e, i) => item(e, loaded.length + i)))
}

function selectVoice(v: Voice) {
  current = Uint8Array.from(v)
  engine?.setVoice(current)
  volcaHasVoice = false
  if (settings.target !== 'browser') sendToVolca()
  const alg = algorithmOf(current[VC.algorithm])
  infoEl.innerHTML = ''
  const line = (label: string, value: string) => {
    const div = document.createElement('div')
    div.append(`${label} `)
    const b = document.createElement('b')
    b.textContent = value
    div.append(b)
    infoEl.append(div)
  }
  line('Voice', voiceName(current))
  line('Algorithm', `${alg.number}: carriers ${alg.carriers.join(', ')}, feedback ${current[VC.feedback]}${alg.feedback.from !== alg.feedback.to ? ` (OP${alg.feedback.from} → OP${alg.feedback.to})` : ` (OP${alg.feedback.from})`}`)
}

$<HTMLInputElement>('#file').addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  const read = readSyx(new Uint8Array(await f.arrayBuffer()))
  loaded = read.voices.map((v) => ({ voice: v.voice, source: v.source.replace(/^bank \d+ \/ /, '') }))
  loadedName = `${f.name}${read.notes.length ? ` (${read.notes.length} notes: ${read.notes[0]})` : ''}`
  listVoices()
})

// ---------- engine ----------

modelSel.value = settings.model
volumeIn.value = String(settings.volume)

$<HTMLButtonElement>('#start').addEventListener('click', startAudio)
async function startAudio() {
  if (engine) return
  try {
    engine = await BrowserEngine.start()
    engine.setModel(settings.model)
    engine.setGain(settings.volume)
    engine.setVoice(current)
    $<HTMLButtonElement>('#start').disabled = true
    statusEl.textContent = `running at ${engine.context.sampleRate} Hz`
    drawScope()
  } catch (e) {
    statusEl.textContent = `no audio: ${(e as Error).message}`
  }
}
modelSel.addEventListener('change', () => { settings.model = modelSel.value as Model; save(); engine?.setModel(settings.model) })
volumeIn.addEventListener('input', () => { settings.volume = Number(volumeIn.value); save(); engine?.setGain(settings.volume) })

function drawScope() {
  const canvas = $<HTMLCanvasElement>('#scope')
  const g = canvas.getContext('2d')!
  const data = new Float32Array(engine!.analyser.fftSize)
  const frame = () => {
    engine!.analyser.getFloatTimeDomainData(data)
    // start at a rising zero crossing, so a steady tone stands still
    let start = 0
    for (let i = 1; i < data.length / 2; i++) if (data[i - 1] < 0 && data[i] >= 0) { start = i; break }
    g.fillStyle = '#16141c'
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.strokeStyle = '#f0a050'
    g.lineWidth = 2
    g.beginPath()
    const n = data.length / 2
    for (let i = 0; i < n; i++) {
      const x = (i / n) * canvas.width
      const y = canvas.height / 2 - data[start + i] * (canvas.height / 2) * 0.95
      if (i) g.lineTo(x, y)
      else g.moveTo(x, y)
    }
    g.stroke()
    requestAnimationFrame(frame)
  }
  frame()
}

// ---------- volca ----------

channelIn.value = String(settings.channel)
channelIn.addEventListener('change', () => { settings.channel = Math.max(1, Math.min(16, Number(channelIn.value) || 1)); save() })
const ch = () => (settings.channel - 1) & 0x0f

$<HTMLButtonElement>('#connect').addEventListener('click', async () => {
  const why = webMidiUnavailable()
  if (why) { statusEl.textContent = why; return }
  try {
    const access = await requestWebMidi()
    const fill = () => {
      outputSel.replaceChildren(...outputNames(access).map((n) => new Option(n, n)))
      output = findOutput(access, settings.port)
      outputSel.value = output?.name ?? ''
    }
    access.onstatechange = fill
    fill()
    outputSel.onchange = () => { settings.port = outputSel.value; save(); output = findOutput(access, settings.port); volcaHasVoice = false }
  } catch (e) {
    statusEl.textContent = `no MIDI: ${(e as Error).message}`
  }
})

function sendToVolca() {
  if (!output) return
  // the fm2 takes either byte 155 (FINDINGS Q1); the volca fm's own form is the operator bits
  send(output, vcedMessage(current, { tail: 'opBits' }))
  volcaHasVoice = true
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-target]')) {
  b.classList.toggle('on', b.dataset.target === settings.target)
  b.addEventListener('click', () => {
    settings.target = b.dataset.target as Target
    save()
    for (const x of document.querySelectorAll('[data-target]')) x.classList.toggle('on', x === b)
  })
}

// ---------- notes ----------

const held = new Set<number>()
const toBrowser = () => settings.target !== 'volca'
const toVolca = () => settings.target !== 'browser' && !!output

async function noteOn(note: number, velocity = Number(velocityIn.value)) {
  if (held.has(note)) return
  if (toBrowser() && !engine) await startAudio()
  held.add(note)
  keyEls.get(note)?.classList.add('down')
  if (toBrowser()) engine?.noteOn(note, velocity)
  if (toVolca()) {
    if (!volcaHasVoice) sendToVolca()
    send(output, [0x90 | ch(), note, velocity])
  }
}

function noteOff(note: number) {
  if (!held.delete(note)) return
  keyEls.get(note)?.classList.remove('down')
  engine?.noteOff(note)
  if (output) send(output, [0x80 | ch(), note, 0])
}

// ---------- keyboard: two octaves on screen, the computer keys ----------

const keysEl = $<HTMLDivElement>('#keys')
const keyEls = new Map<number, HTMLDivElement>()
const FIRST = 48
const BLACK = [1, 3, 6, 8, 10]
function drawKeys() {
  keysEl.replaceChildren()
  keyEls.clear()
  const whites = Array.from({ length: 25 }, (_, i) => FIRST + i).filter((n) => !BLACK.includes(n % 12))
  const w = 100 / whites.length
  let wi = 0
  for (let n = FIRST; n < FIRST + 25; n++) {
    const el = document.createElement('div')
    const black = BLACK.includes(n % 12)
    el.className = black ? 'b' : 'w'
    el.style.left = `${black ? wi * w - w * 0.3 : wi * w}%`
    el.style.width = `${black ? w * 0.6 : w}%`
    if (!black) {
      if (n % 12 === 0) el.innerHTML = `<span class="label">C${n / 12 - 1}</span>`
      wi++
    }
    // soft at the top of a key, hard at the front
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId)
      const r = el.getBoundingClientRect()
      noteOn(n, Math.max(1, Math.min(127, Math.round(((e.clientY - r.top) / r.height) * 127))))
    })
    el.addEventListener('pointerup', () => noteOff(n))
    el.addEventListener('pointercancel', () => noteOff(n))
    keysEl.append(el)
    keyEls.set(n, el)
  }
}

const KEY_MAP = 'awsedftgyhujkolp;'
let octave = 0
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || (e.target as HTMLElement).tagName === 'INPUT') return
  if (e.key === 'z') { octave = Math.max(-3, octave - 1); return }
  if (e.key === 'x') { octave = Math.min(3, octave + 1); return }
  const i = KEY_MAP.indexOf(e.key)
  if (i >= 0) noteOn(60 + 12 * octave + i)
})
window.addEventListener('keyup', (e) => {
  const i = KEY_MAP.indexOf(e.key)
  if (i < 0) return
  // the note may have started in another octave: release every note this key could have played
  for (let o = -3; o <= 3; o++) noteOff(60 + 12 * o + i)
})
window.addEventListener('blur', () => { for (const n of [...held]) noteOff(n) })

drawKeys()
listVoices()
selectVoice(current)
voicesEl.querySelector<HTMLLIElement>('li[data-index]')?.classList.add('sel')
