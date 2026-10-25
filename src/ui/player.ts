// Playing a voice on the browser engine, the volca or both, with a keyboard and a scope: shared by the dev pages.
// Wires the elements by id: #start #model #volume #velocity #status #connect #output #channel [data-target]
// #scope #keys. The volcas take a whole voice at a time (PLAN §1), so a new voice is sent debounced, and at once
// before a note that needs it.
import { vcedMessage } from '../dx7/sysex'
import type { Voice } from '../dx7/voice'
import { BrowserEngine } from '../engine/engine'
import type { Model } from '../engine/models'
import { findOutput, outputNames, requestWebMidi, send, webMidiUnavailable } from '../midi/transport'

type Target = 'browser' | 'volca' | 'both'
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T | null

const SETTINGS_KEY = 'volca:player'
const SEND_DELAY = 120

export class Player {
  readonly settings = { model: 'fm2' as Model, volume: 2, port: '', channel: 1, target: 'browser' as Target }
  private engine: BrowserEngine | null = null
  private output: MIDIOutput | null = null
  private voice: Voice | null = null
  private volcaHasVoice = false
  private sendTimer = 0
  private readonly held = new Set<number>()
  private readonly keyEls = new Map<number, HTMLElement>()
  private readonly status = $<HTMLSpanElement>('#status')
  /** called when the model changes (the generator makes voices per model) */
  onModel: (model: Model) => void = () => {}

  constructor() {
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')) } catch { /* defaults */ }
    this.wire()
  }

  private save() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)) } catch { /* private window */ }
  }

  setVoice(v: Voice) {
    this.voice = Uint8Array.from(v)
    this.engine?.setVoice(this.voice)
    this.volcaHasVoice = false
    if (this.toVolca()) {
      clearTimeout(this.sendTimer)
      this.sendTimer = window.setTimeout(() => this.sendToVolca(), SEND_DELAY)
    }
  }

  /** Plays C4 briefly: to hear a new voice without touching the keyboard. */
  audition(note = 60, ms = 700) {
    this.noteOn(note, Number($<HTMLInputElement>('#velocity')?.value ?? 100))
    setTimeout(() => this.noteOff(note), ms)
  }

  private toBrowser = () => this.settings.target !== 'volca'
  private toVolca = () => this.settings.target !== 'browser' && !!this.output
  private ch = () => (this.settings.channel - 1) & 0x0f

  private sendToVolca() {
    clearTimeout(this.sendTimer)
    if (!this.output || !this.voice) return
    // the fm2 takes either byte 155 (FINDINGS Q1); the volca fm's own form is the operator bits
    send(this.output, vcedMessage(this.voice, { tail: 'opBits' }))
    this.volcaHasVoice = true
  }

  async start() {
    if (this.engine) return
    try {
      this.engine = await BrowserEngine.start()
      this.engine.setModel(this.settings.model)
      this.engine.setGain(this.settings.volume)
      if (this.voice) this.engine.setVoice(this.voice)
      const b = $<HTMLButtonElement>('#start')
      if (b) b.disabled = true
      if (this.status) this.status.textContent = `running at ${this.engine.context.sampleRate} Hz`
      this.drawScope()
    } catch (e) {
      if (this.status) this.status.textContent = `no audio: ${(e as Error).message}`
    }
  }

  async noteOn(note: number, velocity: number) {
    if (this.held.has(note)) return
    if (this.toBrowser() && !this.engine) await this.start()
    this.held.add(note)
    this.keyEls.get(note)?.classList.add('down')
    if (this.toBrowser()) this.engine?.noteOn(note, velocity)
    if (this.toVolca()) {
      if (!this.volcaHasVoice) this.sendToVolca()
      send(this.output, [0x90 | this.ch(), note, velocity])
    }
  }

  noteOff(note: number) {
    if (!this.held.delete(note)) return
    this.keyEls.get(note)?.classList.remove('down')
    this.engine?.noteOff(note)
    if (this.output) send(this.output, [0x80 | this.ch(), note, 0])
  }

  private wire() {
    const s = this.settings
    $<HTMLButtonElement>('#start')?.addEventListener('click', () => this.start())
    const model = $<HTMLSelectElement>('#model')
    if (model) {
      model.value = s.model
      model.addEventListener('change', () => { s.model = model.value as Model; this.save(); this.engine?.setModel(s.model); this.onModel(s.model) })
    }
    const volume = $<HTMLInputElement>('#volume')
    if (volume) {
      volume.value = String(s.volume)
      volume.addEventListener('input', () => { s.volume = Number(volume.value); this.save(); this.engine?.setGain(s.volume) })
    }
    const channel = $<HTMLInputElement>('#channel')
    if (channel) {
      channel.value = String(s.channel)
      channel.addEventListener('change', () => { s.channel = Math.max(1, Math.min(16, Number(channel.value) || 1)); this.save() })
    }
    $<HTMLButtonElement>('#connect')?.addEventListener('click', () => this.connect())
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-target]')) {
      b.classList.toggle('on', b.dataset.target === s.target)
      b.addEventListener('click', () => {
        s.target = b.dataset.target as Target
        this.save()
        for (const x of document.querySelectorAll('[data-target]')) x.classList.toggle('on', x === b)
        if (this.toVolca()) this.sendToVolca()
      })
    }
    this.drawKeys()
    this.computerKeys()
  }

  private async connect() {
    const why = webMidiUnavailable()
    if (why) { if (this.status) this.status.textContent = why; return }
    const select = $<HTMLSelectElement>('#output')
    try {
      const access = await requestWebMidi()
      const fill = () => {
        select?.replaceChildren(...outputNames(access).map((n) => new Option(n, n)))
        this.output = findOutput(access, this.settings.port)
        if (select) select.value = this.output?.name ?? ''
        this.volcaHasVoice = false
      }
      access.onstatechange = fill
      fill()
      if (select) select.onchange = () => { this.settings.port = select.value; this.save(); fill() }
    } catch (e) {
      if (this.status) this.status.textContent = `no MIDI: ${(e as Error).message}`
    }
  }

  private drawScope() {
    const canvas = $<HTMLCanvasElement>('#scope')
    if (!canvas || !this.engine) return
    const g = canvas.getContext('2d')!
    const analyser = this.engine.analyser
    const data = new Float32Array(analyser.fftSize)
    const frame = () => {
      analyser.getFloatTimeDomainData(data)
      // start at a rising zero crossing, so a steady tone stands still
      let start = 0
      for (let i = 1; i < data.length / 2; i++) if (data[i - 1] < 0 && data[i] >= 0) { start = i; break }
      g.fillStyle = getComputedStyle(canvas).backgroundColor || '#16141c'
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

  /** Two octaves from C3: soft at the top of a key, hard at the front. */
  private drawKeys() {
    const el = $<HTMLDivElement>('#keys')
    if (!el) return
    const FIRST = 48
    const BLACK = [1, 3, 6, 8, 10]
    const whites = Array.from({ length: 25 }, (_, i) => FIRST + i).filter((n) => !BLACK.includes(n % 12))
    const w = 100 / whites.length
    let wi = 0
    for (let n = FIRST; n < FIRST + 25; n++) {
      const key = document.createElement('div')
      const black = BLACK.includes(n % 12)
      key.className = black ? 'b' : 'w'
      key.style.left = `${black ? wi * w - w * 0.3 : wi * w}%`
      key.style.width = `${black ? w * 0.6 : w}%`
      if (!black) {
        if (n % 12 === 0) key.innerHTML = `<span class="label">C${n / 12 - 1}</span>`
        wi++
      }
      key.addEventListener('pointerdown', (e) => {
        key.setPointerCapture(e.pointerId)
        const r = key.getBoundingClientRect()
        this.noteOn(n, Math.max(1, Math.min(127, Math.round(((e.clientY - r.top) / r.height) * 127))))
      })
      key.addEventListener('pointerup', () => this.noteOff(n))
      key.addEventListener('pointercancel', () => this.noteOff(n))
      el.append(key)
      this.keyEls.set(n, key)
    }
  }

  /** A W S E D F T G Y H U J K O L P ; from C4, Z/X an octave down/up. */
  private computerKeys() {
    const MAP = 'awsedftgyhujkolp;'
    let octave = 0
    const velocity = () => Number($<HTMLInputElement>('#velocity')?.value ?? 100)
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.repeat || e.metaKey || e.ctrlKey || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'z') { octave = Math.max(-3, octave - 1); return }
      if (e.key === 'x') { octave = Math.min(3, octave + 1); return }
      const i = MAP.indexOf(e.key)
      if (i >= 0) this.noteOn(60 + 12 * octave + i, velocity())
    })
    window.addEventListener('keyup', (e) => {
      const i = MAP.indexOf(e.key)
      // the note may have started in another octave: release every note this key could have played
      if (i >= 0) for (let o = -3; o <= 3; o++) this.noteOff(60 + 12 * o + i)
    })
    window.addEventListener('blur', () => { for (const n of [...this.held]) this.noteOff(n) })
  }
}
