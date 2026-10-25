// Phase 3's lab: the generator with plain controls, to tune the tonalities by ear before the real interface.
import { algorithmOf } from './dx7/algorithms'
import { vcedMessage, vmemMessage } from './dx7/sysex'
import { getOp, VC, voiceName, type Voice } from './dx7/voice'
import {
  angleOf, DEFAULT_CHOICES, REGISTER_LABELS, REGISTERS, SHAPE_HINTS, SHAPE_LABELS, SHAPES, TONALITIES, TONALITY_HINTS, TONALITY_HUES, TONALITY_LABELS,
  type GeneratorChoices, type Register, type Shape, type Tonality,
} from './generator/choices'
import { generate, type Generated } from './generator/generate'
import { newSeed } from './generator/random'
import { Player } from './ui/player'

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T
const player = new Player()
player.onModel = () => regenerate(true)

const STATE_KEY = 'volca:lab'
interface PinState { tonality: Tonality; weight: number; intensity: number }
const state = {
  pins: [{ tonality: 'bell', weight: 0.6, intensity: 0.5 }, { tonality: 'warm', weight: 0.4, intensity: 0.5 }] as PinState[],
  choices: { ...DEFAULT_CHOICES } as Omit<GeneratorChoices, 'pins'>,
  wild: 0,
  seed: newSeed(),
}
try { Object.assign(state, JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}')) } catch { /* defaults */ }
const save = () => { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)) } catch { /* private window */ } }

const choices = (): GeneratorChoices => ({ ...state.choices, pins: state.pins.map((p) => ({ angle: angleOf(p.tonality), radius: p.intensity, weight: p.weight })) })
const colour = (t: Tonality, l = 62) => `hsl(${TONALITY_HUES[t]} 70% ${l}%)`

// ---------- the ring ----------

function drawRing() {
  const ring = $<HTMLDivElement>('#ring')
  for (const b of ring.querySelectorAll('button')) b.remove()
  for (const t of TONALITIES) {
    const a = (angleOf(t) - 90) * (Math.PI / 180)
    const b = document.createElement('button')
    b.textContent = TONALITY_LABELS[t]
    b.title = TONALITY_HINTS[t]
    b.style.left = `${150 + 118 * Math.cos(a)}px`
    b.style.top = `${150 + 118 * Math.sin(a)}px`
    b.style.borderColor = colour(t)
    const pinned = state.pins.some((p) => p.tonality === t)
    b.classList.toggle('pinned', pinned)
    if (pinned) b.style.background = colour(t)
    b.addEventListener('click', () => {
      if (pinned) state.pins = state.pins.filter((p) => p.tonality !== t)
      else if (state.pins.length < 3) state.pins.push({ tonality: t, weight: 0.5, intensity: 0.5 })
      changed()
      drawRing()
      drawPins()
    })
    ring.append(b)
  }
}

function slider(min: number, max: number, step: number, value: number, onInput: (v: number) => void) {
  const i = document.createElement('input')
  Object.assign(i, { type: 'range', min, max, step, value })
  i.addEventListener('input', () => onInput(Number(i.value)))
  i.addEventListener('change', () => audition())
  return i
}

function drawPins() {
  const el = $<HTMLDivElement>('#pins')
  el.replaceChildren(...state.pins.map((p) => {
    const row = document.createElement('div')
    row.className = 'pin'
    const name = document.createElement('b')
    name.textContent = TONALITY_LABELS[p.tonality]
    name.style.color = colour(p.tonality)
    const weight = document.createElement('label')
    weight.append('weight', slider(0.05, 1, 0.05, p.weight, (v) => { p.weight = v; changed(false) }))
    const intensity = document.createElement('label')
    intensity.append('mild … extreme', slider(0, 1, 0.05, p.intensity, (v) => { p.intensity = v; changed(false) }))
    const x = document.createElement('button')
    x.textContent = '✕'
    x.addEventListener('click', () => { state.pins = state.pins.filter((q) => q !== p); changed(); drawRing(); drawPins() })
    row.append(name, weight, intensity, x)
    return row
  }))
  if (!state.pins.length) el.innerHTML = '<p class="hint">No pins: Generate picks a tonality.</p>'
}

// ---------- controls ----------

function drawControls() {
  const el = $<HTMLDivElement>('#controls')
  const c = state.choices
  const field = (label: string, control: HTMLElement, value?: () => string) => {
    const l = document.createElement('label')
    const head = document.createElement('span')
    head.textContent = label
    const b = document.createElement('b')
    head.append(b)
    const show = () => { b.textContent = value ? value() : '' }
    show()
    control.addEventListener('input', show)
    l.append(head, control)
    el.append(l)
  }
  const select = <T extends string>(options: readonly T[], labels: Record<T, string>, value: T | null, none: string, onChange: (v: T | null) => void, hints?: Record<T, string>) => {
    const s = document.createElement('select')
    s.append(new Option(none, ''), ...options.map((o) => { const opt = new Option(labels[o], o); if (hints) opt.title = hints[o]; return opt }))
    s.value = value ?? ''
    s.addEventListener('change', () => { onChange((s.value || null) as T | null); changed(); audition() })
    return s
  }
  const pct = (x: number) => `${Math.round(x * 100)}`
  field('Envelope', select<Shape>(SHAPES, SHAPE_LABELS, c.shape, 'the tonality’s own', (v) => (c.shape = v), SHAPE_HINTS))
  field('Length: short … long', slider(-1, 1, 0.05, c.length, (v) => { c.length = v; changed(false) }), () => pct(c.length))
  field('Brightness: mellow … bright', slider(-1, 1, 0.05, c.brightness, (v) => { c.brightness = v; changed(false) }), () => pct(c.brightness))
  field('Complexity: pure … dense', slider(0, 1, 0.05, c.complexity, (v) => { c.complexity = v; changed(false) }), () => pct(c.complexity))
  field('Motion: still … alive', slider(0, 1, 0.05, c.motion, (v) => { c.motion = v; changed(false) }), () => pct(c.motion))
  field('Register', select<Register>(REGISTERS, REGISTER_LABELS, c.register, 'the tonality’s own', (v) => (c.register = v)))
  field('Velocity response', slider(0, 1, 0.05, c.velocity, (v) => { c.velocity = v; changed(false) }), () => pct(c.velocity))
  field('Wild: typical … wild', slider(0, 1, 0.05, state.wild, (v) => { state.wild = v; changed(false) }), () => pct(state.wild))
  const accent = document.createElement('input')
  accent.type = 'checkbox'
  accent.checked = c.pitchAccent
  accent.addEventListener('change', () => { c.pitchAccent = accent.checked; changed(); audition() })
  field('Pitch accent', accent)
}

// ---------- generating ----------

let current: Generated | null = null
let currentVoice: Voice | null = null
interface HistoryEntry { voice: Voice; label: string; hue: number }
const history: HistoryEntry[] = []

function regenerate(record = false) {
  current = generate(choices(), { seed: state.seed, model: player.settings.model, wild: state.wild })
  show(current.voice, record)
}

function show(v: Voice, record: boolean) {
  currentVoice = v
  player.setVoice(v)
  const alg = algorithmOf(v[VC.algorithm])
  const ops = [1, 2, 3, 4, 5, 6].filter((op) => getOp(v, op, 'outputLevel') > 0)
  const roles = current?.roles.map((r) => `${TONALITY_LABELS[r.tonality]} as ${r.as}`).join(', ') ?? ''
  $<HTMLDivElement>('#info').innerHTML = ''
  const line = (label: string, value: string) => {
    const div = document.createElement('div')
    div.append(`${label} `)
    const b = document.createElement('b')
    b.textContent = value
    div.append(b)
    $<HTMLDivElement>('#info').append(div)
  }
  line('Voice', `${voiceName(v)}   seed ${state.seed}`)
  line('Algorithm', `${alg.number}, operators sounding: ${ops.join(' ')} (carriers ${alg.carriers.filter((c) => ops.includes(c)).join(' ')}), feedback ${v[VC.feedback]}`)
  if (roles) line('Mix', roles)
  if (current) line('Loudness', `${current.loudness.toFixed(1)} dB`)
  if (record) {
    history.push({ voice: v, label: voiceName(v), hue: TONALITY_HUES[current?.mix[0]?.tonality ?? 'warm'] })
    drawHistory()
  }
}

/** Something changed: the same seed again, recorded when it's a step (not while dragging). */
function changed(record = true) {
  save()
  regenerate(record)
}

function audition() {
  if ($<HTMLInputElement>('#auto').checked) setTimeout(() => player.audition(), 140)
}

function drawHistory() {
  const el = $<HTMLDivElement>('#history')
  el.replaceChildren(...history.slice(-32).map((h) => {
    const b = document.createElement('button')
    b.textContent = h.label
    b.style.borderLeftColor = `hsl(${h.hue} 70% 62%)`
    b.classList.toggle('sel', h.voice === currentVoice)
    b.addEventListener('click', () => { current = null; show(h.voice, false); drawHistory(); audition() })
    return b
  }))
}

$<HTMLButtonElement>('#generate').addEventListener('click', () => { state.seed = newSeed(); save(); regenerate(true); drawHistory(); audition() })
$<HTMLButtonElement>('#variation').addEventListener('click', () => {
  // the same choices, a seed close by, kept typical
  state.seed += 1 + Math.floor(Math.random() * 1000)
  save()
  regenerate(true)
  drawHistory()
  audition()
})
$<HTMLButtonElement>('#mutate').addEventListener('click', () => {
  // the lab's pins are whole tonalities, so its Mutate is a fully wild roll of them (the app moves its pins instead)
  state.seed = newSeed()
  save()
  current = generate(choices(), { seed: state.seed, model: player.settings.model, wild: 1 })
  show(current.voice, true)
  drawHistory()
  audition()
})

function download(name: string, bytes: Uint8Array) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
$<HTMLButtonElement>('#exportVoice').addEventListener('click', () => {
  if (currentVoice) download(`${voiceName(currentVoice).replace(/\W+/g, '-') || 'voice'}.syx`, vcedMessage(currentVoice, { tail: 'checksum' }))
})
$<HTMLButtonElement>('#exportBank').addEventListener('click', () => {
  if (history.length) download('volca-generator.syx', vmemMessage(history.slice(-32).map((h) => h.voice)))
})

drawRing()
drawPins()
drawControls()
regenerate(true)
