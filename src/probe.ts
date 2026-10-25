// Phase 0 probe: answers Q1–Q8 of PLAN.md §3 on a volca fm and a volca fm2, by ear. The volcas send nothing back,
// so every test sends, plays a note pattern, and asks what was heard; the answers are kept per model in this
// browser and come out as a Markdown report for docs/FINDINGS.md. Nothing is stored to the volca's memory.
import { checksum, parameterChange, readSyx, vcedMessage, type SyxVoice, type VcedOptions, type VcedTail } from './dx7/sysex'
import { initVoice, OP, opBase, setOp, setVc, setVoiceName, VC, voiceName, type Voice } from './dx7/voice'
import { findOutput, outputNames, requestWebMidi, send, webMidiUnavailable } from './midi/transport'
import { bright, octaves, paramTests, pure, type NotePattern } from './probe/testVoices'

// ---------- tiny DOM helpers ----------

type Attrs = Record<string, string | number | boolean | ((e: Event) => void)>
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') e.addEventListener(k, v)
    else if (typeof v === 'boolean') { if (v) e.setAttribute(k, '') }
    else e.setAttribute(k, String(v))
  }
  e.append(...children)
  return e
}
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T
const logEl = $<HTMLDivElement>('#log')
const testsEl = $<HTMLDivElement>('#tests')

const plainLog: string[] = []
function log(text: string, cls = '') {
  plainLog.push(text)
  logEl.append(el('div', cls ? { class: cls } : {}, text))
  logEl.scrollTop = logEl.scrollHeight
}
const t0 = performance.now()
const stamp = () => `${String(Math.round(performance.now() - t0)).padStart(7)} ms`
const hex = (b: ArrayLike<number>, max = 12) =>
  Array.from(b).slice(0, max).map((x) => x.toString(16).padStart(2, '0')).join(' ') + (b.length > max ? ` … (${b.length} B)` : '')

// ---------- settings ----------

const SETTINGS_KEY = 'volca-probe:settings'
interface Settings { port: string; model: 'fm' | 'fm2'; firmware: string; channel: number; device: number; tail: VcedTail }
const settings: Settings = { port: '', model: 'fm2', firmware: '', channel: 1, device: 0, tail: 'opBits' }
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')) } catch { /* defaults */ }
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* private window */ } }

// ---------- answers, per model ----------

interface Answer { result: string; note: string }
const answersKey = (model: string) => `volca-probe:answers:${model}`
function loadAnswers(model: string): Record<string, Answer> {
  try { return JSON.parse(localStorage.getItem(answersKey(model)) ?? '{}') } catch { return {} }
}
let answers = loadAnswers(settings.model)
function saveAnswer(id: string, a: Answer) {
  answers[id] = a
  try { localStorage.setItem(answersKey(settings.model), JSON.stringify(answers)) } catch { /* private window */ }
}

// ---------- MIDI ----------

let access: MIDIAccess | null = null
let output: MIDIOutput | null = null
let running = false
let stopRequested = false
const sounding = new Set<number>()

class Stopped extends Error {}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)).then(() => { if (stopRequested) throw new Stopped() })
const ch = () => (settings.channel - 1) & 0x0f

function out(message: ArrayLike<number>, text: string, cls = 'dim') {
  send(output, message)
  log(`${stamp()} -> ${text}`, cls)
}

function noteOn(note: number, velocity = 100) {
  sounding.add(note)
  out([0x90 | ch(), note, velocity], `note on ${note} vel ${velocity}`)
}
function noteOff(note: number) {
  sounding.delete(note)
  out([0x80 | ch(), note, 0], `note off ${note}`)
}
function allNotesOff() {
  for (const n of [...sounding]) noteOff(n)
  out([0xb0 | ch(), 123, 0], 'CC 123 all notes off')
}
async function playNote(note = 60, ms = 600, velocity = 100) {
  noteOn(note, velocity)
  try { await sleep(ms) } finally { noteOff(note) }
}

function vcedOptions(over: VcedOptions = {}): VcedOptions {
  return { device: settings.device, tail: settings.tail, ...over }
}

function sendVoice(v: Voice, over: VcedOptions = {}) {
  const o = vcedOptions(over)
  const m = vcedMessage(v, o)
  const tail = o.tail === 'opBits' ? `op bits ${(o.opMask ?? 0x3f).toString(2).padStart(6, '0')}` : o.tail === 'checksum' ? `checksum ${hex([checksum(v)])}` : 'no tail'
  out(m, `voice "${voiceName(v)}" ${m.length} B, dev ${o.device}, count ${o.count ?? 155}, ${tail}`, 'ok')
}

async function playPattern(p: NotePattern) {
  switch (p) {
    case 'one': return playNote(60, 900)
    case 'long': return playNote(60, 3000)
    case 'velocity': await playNote(60, 700, 20); await sleep(250); return playNote(60, 700, 127)
    case 'range': await playNote(36, 1200); await sleep(250); return playNote(84, 1200)
    case 'repeat': for (let i = 0; i < 4; i++) { await playNote(60, 220); await sleep(120) } return
  }
}

/** One test run at a time; every control is off meanwhile, except Stop. */
async function run(label: string, body: () => Promise<void>) {
  if (running) return
  if (!output) { log('Connect first.', 'warn'); return }
  running = true
  stopRequested = false
  document.body.classList.add('running')
  for (const b of document.querySelectorAll<HTMLButtonElement>('button[data-run]')) b.disabled = true
  log(label, 'head')
  try {
    await body()
  } catch (e) {
    if (e instanceof Stopped) log('stopped', 'warn')
    else log(`error: ${(e as Error).message}`, 'bad')
  } finally {
    stopRequested = false
    if (sounding.size) allNotesOff()
    running = false
    for (const b of document.querySelectorAll<HTMLButtonElement>('button[data-run]')) b.disabled = !output
  }
}

// ---------- building blocks of the page ----------

function section(title: string, qs: string, hint: string, ...children: Node[]) {
  const s = el('section', {}, el('h2', {}, title + ' ', el('b', {}, qs)))
  if (hint) s.append(el('p', { class: 'hint' }, hint))
  s.append(...children)
  testsEl.append(s)
  return s
}

const runButton = (text: string, label: string, body: () => Promise<void>) =>
  el('button', { 'data-run': true, disabled: true, click: () => run(label, body) }, text)

/** A test row: its buttons, what to expect, and the answer (a choice and a note), kept per model. */
const rows: { id: string; refresh: () => void }[] = []
function testRow(id: string, name: string, expect: string, buttons: Node[], choices: readonly string[]) {
  const select = el('select', {}, el('option', { value: '' }, 'heard…'), ...choices.map((c) => el('option', { value: c }, c)))
  const note = el('input', { class: 'note', placeholder: 'note (optional)' })
  const row = el('div', { class: 'test' },
    el('div', { class: 'row' }, el('span', { class: 'name' }, name), ...buttons),
    ...(expect ? [el('p', { class: 'expect' }, expect)] : []),
    el('div', { class: 'row' }, select, note))
  const save = () => {
    saveAnswer(id, { result: select.value, note: note.value })
    row.classList.toggle('answered', !!select.value)
    if (select.value) log(`answer ${settings.model} ${id}: ${select.value}${note.value ? ` (${note.value})` : ''}`, 'dim')
  }
  select.addEventListener('change', save)
  note.addEventListener('change', save)
  const refresh = () => {
    const a = answers[id]
    select.value = a?.result ?? ''
    note.value = a?.note ?? ''
    row.classList.toggle('answered', !!a?.result)
  }
  rows.push({ id, refresh })
  refresh()
  return row
}

/** A free-text answer, kept like a test row. */
function textAnswer(id: string, placeholder: string) {
  const t = el('textarea', { placeholder })
  t.addEventListener('change', () => saveAnswer(id, { result: t.value ? 'see note' : '', note: t.value }))
  rows.push({ id, refresh: () => { t.value = answers[id]?.note ?? '' } })
  t.value = answers[id]?.note ?? ''
  return t
}

const numberInput = (value: number, min: number, max: number, onChange: (n: number) => void) => {
  const i = el('input', { type: 'number', min, max, value })
  i.addEventListener('change', () => onChange(Math.max(min, Math.min(max, Number(i.value) || min))))
  return i
}

// ---------- 1. Setup (Q6) ----------

const statusEl = el('span', { id: 'status' }, webMidiUnavailable() ?? 'not connected')
const portSel = el('select', {})
const modelSel = el('select', {}, el('option', { value: 'fm' }, 'volca fm'), el('option', { value: 'fm2' }, 'volca fm2'))
modelSel.value = settings.model
modelSel.addEventListener('change', () => {
  settings.model = modelSel.value as Settings['model']
  saveSettings()
  answers = loadAnswers(settings.model)
  for (const r of rows) r.refresh()
  log(`model: ${modelSel.selectedOptions[0].text} (its answers loaded)`, 'head')
})
const firmwareIn = el('input', { placeholder: 'e.g. 1.07', value: settings.firmware, style: 'width: 6em' })
firmwareIn.addEventListener('change', () => { settings.firmware = firmwareIn.value; saveSettings() })
const tailSel = el('select', {},
  el('option', { value: 'opBits' }, 'volca: operator bits 3f'),
  el('option', { value: 'checksum' }, 'DX7: checksum'),
  el('option', { value: 'none' }, 'nothing after the data'))
tailSel.value = settings.tail
tailSel.addEventListener('change', () => { settings.tail = tailSel.value as VcedTail; saveSettings(); log(`voice form for the tests: ${tailSel.selectedOptions[0].text}`) })

function fillPorts() {
  if (!access) return
  const names = outputNames(access)
  portSel.replaceChildren(...names.map((n) => el('option', { value: n }, n)))
  output = findOutput(access, settings.port)
  portSel.value = output?.name ?? ''
  statusEl.textContent = output ? `sending to ${output.name}` : 'no MIDI output found'
  for (const b of document.querySelectorAll<HTMLButtonElement>('button[data-run]')) b.disabled = !output || running
}
portSel.addEventListener('change', () => { settings.port = portSel.value; saveSettings(); fillPorts() })

async function connect() {
  try {
    access = await requestWebMidi()
    access.onstatechange = () => fillPorts()
    fillPorts()
    log(`Web MIDI: ${outputNames(access).length} outputs`, 'ok')
  } catch (e) {
    statusEl.textContent = `no MIDI access: ${(e as Error).message}`
    log(statusEl.textContent, 'bad')
  }
}

section('Setup', 'Q6',
  'Model and firmware go into the report. MIDI ch = the volca’s channel for notes (the SysEx goes to any channel, as far as we know). Voice form: what follows the 155 voice bytes in every test except Q1, which tries them all; set it to what Q1 found.',
  el('div', { class: 'row' }, el('button', { click: connect }, 'Connect'), statusEl),
  el('div', { class: 'row' }, el('label', {}, 'Out ', portSel), el('label', {}, 'Model ', modelSel), el('label', {}, 'Firmware ', firmwareIn)),
  el('div', { class: 'row' },
    el('label', {}, 'MIDI ch ', numberInput(settings.channel, 1, 16, (n) => { settings.channel = n; saveSettings() })),
    el('label', {}, 'SysEx device n ', numberInput(settings.device, 0, 15, (n) => { settings.device = n; saveSettings() })),
    el('label', {}, 'Voice form ', tailSel)),
  el('div', { class: 'row' },
    runButton('Link test: play a note', 'link test', () => playNote(60, 800)),
    el('button', { class: 'stop', click: () => { stopRequested = true; if (!running && output) allNotesOff() } }, 'Stop / all notes off')),
  el('p', { class: 'hint' }, 'Q6: how is it connected (interface, DIN or USB), which MIDI settings did you change on the volca (channel, MIDI RX Short Message, …), does it have a MIDI out or USB-MIDI?'),
  textAnswer('Q6', 'connections and settings'))

// ---------- 2. Voice format (Q1) ----------

interface Form { id: string; name: string; o: VcedOptions }
const forms = (): Form[] => [
  { id: 'opBits', name: 'volca: operator bits 3f', o: { tail: 'opBits', device: 0 } },
  { id: 'checksum', name: 'DX7: checksum', o: { tail: 'checksum', device: 0 } },
  { id: 'none', name: 'no byte 155 (162 B)', o: { tail: 'none', device: 0 } },
  { id: 'count156', name: 'operator bits, count 01 1C (156)', o: { tail: 'opBits', device: 0, count: 156 } },
  { id: 'deviceCh', name: 'operator bits, device n = MIDI ch − 1', o: { tail: 'opBits', device: -1 } },
  { id: 'checksumCh', name: 'checksum, device n = MIDI ch − 1', o: { tail: 'checksum', device: -1 } },
]
const formOptions = (o: VcedOptions): VcedOptions => ({ ...o, device: o.device === -1 ? ch() : o.device })

section('Voice format', 'Q1',
  'Each row sends PROBE PURE (a sine) in that form and plays C4, then PROBE BRT (brassy) in the same form and plays C4 again. If the form works, the second note is clearly brighter. Does the volca’s display show the name?',
  ...forms().map((f) => testRow(`Q1.${f.id}`, f.name, '',
    [runButton('Run', `Q1: ${f.name}`, async () => {
      sendVoice(pure(), formOptions(f.o)); await sleep(400); await playNote(60, 700); await sleep(300)
      sendVoice(bright(), formOptions(f.o)); await sleep(400); await playNote(60, 700)
    })],
    ['sine → brassy (it works)', 'no change', 'silent or broken', 'something else'])))

// ---------- 3. Operator bits and levels (Q7) ----------

const masks: { id: string; name: string; mask: number }[] = [
  { id: 'all', name: 'all six (3f)', mask: 0x3f },
  ...[5, 4, 3, 2, 1, 0].map((bit) => ({ id: `B${bit}`, name: `only B${bit} (${(1 << bit).toString(16).padStart(2, '0')})`, mask: 1 << bit })),
  { id: 'none', name: 'none (00)', mask: 0 },
]
const PITCHES = ['1 lowest', '2', '3', '4', '5', '6 highest', 'all six', 'silent', 'something else']

function downloadSyx() {
  const voices = [pure(), bright(), octaves(), ...paramTests().flatMap((t) => [t.a, t.b])]
  const bytes = voices.flatMap((v) => Array.from(vcedMessage(v, { tail: 'checksum' })))
  download('volca-probe-voices.syx', new Blob([Uint8Array.from(bytes)], { type: 'application/octet-stream' }))
}

section('Operator on/off bits and loudness', 'Q7',
  'PROBE OCT: algorithm 32, six carriers an octave apart: OP1 lowest (ratio 0.5) … OP6 highest (ratio 16). Each row sends it with only some operator bits on (voice form: operator bits) and holds C4. Which octave do you hear? 1 is the lowest of the six. On the DX7, B5 = OP1 = lowest.',
  ...masks.map((m) => testRow(`Q7.${m.id}`, m.name, '',
    [runButton('Run', `Q7: operator bits ${m.name}`, async () => {
      sendVoice(octaves(), { tail: 'opBits', opMask: m.mask }); await sleep(400); await playNote(60, 1800)
    })], PITCHES)),
  el('p', { class: 'hint' }, 'Loudness: load the probe’s voices in Dexed (DX7 form, with checksums) and compare PROBE PURE and PROBE BRT there and on the volca, at similar volume settings. How do loudness and brightness compare?'),
  el('div', { class: 'row' }, el('button', { click: downloadSyx }, 'Download the probe voices (.syx, DX7 form)')),
  textAnswer('Q7.loudness', 'loudness and brightness vs Dexed'))

// ---------- 4. Timing (Q4) ----------

const DELAYS = [0, 10, 25, 50, 100, 200, 400]
let burstGap = 0

section('Sending and timing', 'Q4',
  'Over 5-pin MIDI a voice takes about 52 ms to arrive; these tests find how soon a note after a send plays the new voice, and whether a send cuts sounding notes.',
  testRow('Q4.held', 'Held note across sends', 'Holds C4, sends BRT after 0.8 s and PURE after 2 s, releases at 3.2 s.',
    [runButton('Run', 'Q4: held note across sends', async () => {
      sendVoice(pure()); await sleep(400)
      noteOn(60); await sleep(800); sendVoice(bright()); await sleep(1200); sendVoice(pure()); await sleep(1200); noteOff(60)
    })],
    ['the note is cut at each send', 'keeps sounding and changes sound', 'keeps sounding, old sound', 'something else']),
  ...DELAYS.map((d) => testRow(`Q4.delay${d}`, `Note ${d} ms after a send`, d === 0 ? 'Sends PURE, plays C4; sends BRT, plays C4 right after the send call. Is the second note brassy from its very start?' : '',
    [runButton('Run', `Q4: note ${d} ms after the send`, async () => {
      sendVoice(pure()); await sleep(500); await playNote(60, 400); await sleep(300)
      sendVoice(bright()); if (d) await sleep(d); await playNote(60, 700)
    })],
    ['brassy from its start', 'starts wrong, then brassy', 'stays a sine', 'silent or cut', 'something else'])),
  testRow('Q4.burst', 'Ten sends back to back', 'Sends PURE and BRT alternately, ten voices, the last one BRT, with the gap below between them; plays C4 0.6 s after the last. Is it brassy (the last voice landed)?',
    [el('label', {}, 'gap ', numberInput(0, 0, 500, (n) => (burstGap = n)), ' ms'),
      runButton('Run', 'Q4: ten sends back to back', async () => {
        for (let i = 0; i < 10; i++) { sendVoice(i % 2 ? bright() : pure()); if (burstGap) await sleep(burstGap) }
        await sleep(600); await playNote(60, 900)
      })],
    ['brassy (the last landed)', 'a sine (one got lost)', 'silent or broken', 'something else']))

// ---------- 5. Parameter changes (Q3) ----------

/** OP2's output level, ramped from 0 to 99 while C4 sounds. */
async function rampTest(device: number) {
  sendVoice(pure()); await sleep(400)
  noteOn(60); await sleep(500)
  const param = opBase(2) + OP.outputLevel
  for (let level = 0; level <= 99; level += 3) {
    send(output, parameterChange(param, level, device))
    await sleep(40)
  }
  log(`${stamp()} -> 34 parameter changes, OP2 output level (param ${param}) 0 → 99, dev ${device}`, 'ok')
  await sleep(700); noteOff(60)
}

section('DX7 parameter changes', 'Q3',
  'If the volca takes DX7 parameter changes (F0 43 1n …), the generator could change a sounding voice live. The volca fm’s official firmware lists none.',
  testRow('Q3.dev0', 'OP2 level ramp, device 0', 'Holds C4 on PROBE PURE and turns OP2 (the modulator) up from 0 to 99 in 1.4 s: the sine should turn brassy during the note.',
    [runButton('Run', 'Q3: OP2 level ramp, device 0', () => rampTest(0))],
    ['brightens during the note', 'no change', 'something else']),
  testRow('Q3.devCh', 'OP2 level ramp, device = ch − 1', '',
    [runButton('Run', 'Q3: OP2 level ramp, device = MIDI ch − 1', () => rampTest(ch()))],
    ['brightens during the note', 'no change', 'something else']),
  testRow('Q3.algorithm', 'Algorithm 1 → 32, held note', 'Holds C4 on PROBE BRT and switches the algorithm to 32 after 0.8 s: brassy should turn to a sine.',
    [runButton('Run', 'Q3: algorithm change on a held note', async () => {
      sendVoice(bright()); await sleep(400)
      noteOn(60); await sleep(800)
      out(parameterChange(VC.algorithm, 31, settings.device), 'parameter change algorithm → 32'); await sleep(1200); noteOff(60)
      out(parameterChange(VC.algorithm, 0, settings.device), 'parameter change algorithm → 1')
    })],
    ['turns to a sine', 'no change', 'something else']))

// ---------- 6. Voice parameters (Q5) ----------

const PARAM_CHOICES = ['works as expected', 'no difference (ignored)', 'differs, not as expected', 'unsure']
section('Voice parameters', 'Q5',
  'Each pair differs in one parameter only. Play A, then B, and compare. A parameter the volca ignores gives no difference. Velocity: the volca fm’s documents say it doesn’t use note velocity.',
  ...paramTests().map((t) => testRow(`Q5.${t.id}`, t.label, t.expect, [
    runButton(`A: ${t.aLabel}`, `Q5 ${t.label}: A (${t.aLabel})`, async () => { sendVoice(t.a); await sleep(400); await playPattern(t.pattern) }),
    runButton(`B: ${t.bLabel}`, `Q5 ${t.label}: B (${t.bLabel})`, async () => { sendVoice(t.b); await sleep(400); await playPattern(t.pattern) }),
  ], PARAM_CHOICES)))

// ---------- 7. Control changes (Q8) ----------

/** Brassy with envelopes that move and a little vibrato, so every CC has something to change. */
function ccVoice(): Voice {
  const v = initVoice()
  setOp(v, 2, 'outputLevel', 82)
  setOp(v, 2, 'rate1', 60); setOp(v, 2, 'rate2', 45); setOp(v, 2, 'level2', 70); setOp(v, 2, 'level3', 70)
  setOp(v, 1, 'rate1', 75); setOp(v, 1, 'rate2', 40); setOp(v, 1, 'level2', 85); setOp(v, 1, 'level3', 85)
  setVc(v, 'lfoSpeed', 30); setVc(v, 'lfoPitchDepth', 15); setVc(v, 'pitchModSens', 5)
  setVoiceName(v, 'PROBE CC')
  return v
}

const CCS: { cc: number; name: string }[] = [
  { cc: 41, name: 'velocity' }, { cc: 42, name: 'modulator attack' }, { cc: 43, name: 'modulator decay' },
  { cc: 44, name: 'carrier attack' }, { cc: 45, name: 'carrier decay' }, { cc: 46, name: 'LFO rate' },
  { cc: 47, name: 'LFO pitch depth' }, { cc: 48, name: 'algorithm' },
]
const ccOut = (cc: number, value: number) => out([0xb0 | ch(), cc, value], `CC ${cc} = ${value}`)

async function ccRun(cc: number, value: number) {
  ccOut(cc, value); await sleep(150)
  await playNote(60, 1200)
}
const CC_CHOICES = ['low and high differ', 'no difference', 'differ, and a voice send resets it', 'something else']

function ccRow(id: string, name: string, cc: () => number) {
  return testRow(id, name, '', [
    runButton('Send PROBE CC', `Q8: send PROBE CC`, async () => { sendVoice(ccVoice()); await sleep(400); await playNote(60, 1200) }),
    runButton('low (0)', `Q8: CC ${name} low`, () => ccRun(cc(), 0)),
    runButton('high (127)', `Q8: CC ${name} high`, () => ccRun(cc(), 127)),
  ], CC_CHOICES)
}

let customCc = 126
section('Control changes', 'Q8',
  'The volca fm takes these CCs (with MIDI RX Short Message on). Send PROBE CC once, then compare low and high; send PROBE CC again and play: is the change gone (the voice reset it)? Last row: any CC number, e.g. for mono/poly (126/127) or portamento (5, 65) on the fm2.',
  ...CCS.map((c) => ccRow(`Q8.cc${c.cc}`, `CC ${c.cc} ${c.name}`, () => c.cc)),
  ccRow('Q8.custom', 'CC (number below)', () => customCc),
  el('div', { class: 'row' }, el('label', {}, 'CC number ', numberInput(customCc, 0, 127, (n) => (customCc = n)))),
  textAnswer('Q8.notes', 'which CCs, and what they did'))

// ---------- 8. Storing (Q2) ----------

section('Storing on the volca', 'Q2',
  'Sends PROBE BRT to the program being played. Then store it on the volca as its manual says (volca fm: EDIT, then WRITE?), select another program and come back. Do you hear it again? What were the steps? (Pick a program you can lose.)',
  el('div', { class: 'row' },
    runButton('Send PROBE BRT and play', 'Q2: send PROBE BRT', async () => { sendVoice(bright()); await sleep(400); await playNote(60, 900) }),
    runButton('Play C4', 'Q2: play', () => playNote(60, 900))),
  textAnswer('Q2', 'where the voice landed, how storing went'))

// ---------- 9. Files ----------

let fileVoices: SyxVoice[] = []
const fileSel = el('select', { style: 'min-width: 16em' })
const fileIn = el('input', { type: 'file', accept: '.syx,application/octet-stream' })
fileIn.addEventListener('change', async () => {
  const f = fileIn.files?.[0]
  if (!f) return
  const read = readSyx(new Uint8Array(await f.arrayBuffer()))
  fileVoices = read.voices
  fileSel.replaceChildren(...fileVoices.map((v, i) => el('option', { value: i }, `${v.source}: ${voiceName(v.voice)}`)))
  log(`${f.name}: ${fileVoices.length} voices`, 'head')
  for (const n of read.notes) log(`   ${n}`, 'warn')
})
section('Files', '',
  'A .syx from Dexed or elsewhere (1 voice or a 32-voice bank): send one voice to the volca in the voice form above and play C4, to compare with Dexed.',
  el('div', { class: 'row' }, fileIn),
  el('div', { class: 'row' }, fileSel,
    runButton('Send and play', 'file voice', async () => {
      const v = fileVoices[Number(fileSel.value)]
      if (!v) return
      sendVoice(v.voice); await sleep(400); await playNote(60, 1500)
    })))

// ---------- 10. Report ----------

function download(name: string, blob: Blob) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function report(): string {
  const date = new Date().toISOString().slice(0, 10)
  const lines = [`# volca probe results, ${date}`, '', `Port: ${output?.name ?? '–'} · MIDI ch ${settings.channel} · SysEx device ${settings.device} · voice form ${settings.tail}`, '']
  for (const model of ['fm', 'fm2'] as const) {
    const a = loadAnswers(model)
    const ids = Object.keys(a).filter((id) => a[id].result || a[id].note).sort()
    lines.push(`## volca ${model}${model === settings.model && settings.firmware ? `, firmware ${settings.firmware}` : ''}`, '')
    if (!ids.length) { lines.push('(no answers)', ''); continue }
    lines.push('| Test | Heard | Note |', '|---|---|---|')
    for (const id of ids) lines.push(`| ${id} | ${a[id].result} | ${a[id].note.replace(/\n/g, ' ').replace(/\|/g, '/')} |`)
    lines.push('')
  }
  return lines.join('\n')
}

section('Report', '',
  'All answers for both models as Markdown (paste it into the chat, or save it). The log can go along too.',
  el('div', { class: 'row' },
    el('button', { click: () => { navigator.clipboard.writeText(report()).then(() => log('report copied', 'ok'), () => log('copy failed: use Download', 'warn')) } }, 'Copy report'),
    el('button', { click: () => download('volca-probe-report.md', new Blob([report()], { type: 'text/markdown' })) }, 'Download report'),
    el('button', { click: () => download('volca-probe-log.txt', new Blob([plainLog.join('\n')], { type: 'text/plain' })) }, 'Download log'),
    el('button', {
      click: () => {
        if (!confirm(`Clear all answers for the volca ${settings.model}?`)) return
        answers = {}
        try { localStorage.removeItem(answersKey(settings.model)) } catch { /* private window */ }
        for (const r of rows) r.refresh()
      },
    }, 'Clear this model’s answers')))

log(`model: volca ${settings.model}; Connect to start`, 'head')
