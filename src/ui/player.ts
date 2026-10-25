// The dev pages' player: Playback (playback.ts) wired to their elements by id: #start #model #volume #velocity
// #status #connect #output #channel [data-target] #scope #keys.
import type { Voice } from '../dx7/voice'
import type { Model } from '../engine/models'
import { Playback, type Target } from './playback'

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T | null

export class Player {
  readonly playback = new Playback()
  private readonly keyEls = new Map<number, HTMLElement>()
  private readonly status = $<HTMLSpanElement>('#status')
  /** called when the model changes (the generator makes voices per model) */
  onModel: (model: Model) => void = () => {}

  constructor() {
    this.playback.onNotes = (held) => { for (const [n, el] of this.keyEls) el.classList.toggle('down', held.has(n)) }
    this.wire()
  }

  get settings() {
    return this.playback.settings
  }

  setVoice(v: Voice) {
    this.playback.setVoice(v)
  }

  audition(note = 60, ms = 700) {
    this.playback.audition(note, Number($<HTMLInputElement>('#velocity')?.value ?? 100), ms)
  }

  async start() {
    if (this.playback.started) return
    try {
      await this.playback.start()
      const b = $<HTMLButtonElement>('#start')
      if (b) b.disabled = true
      if (this.status) this.status.textContent = `running at ${this.playback.engine!.context.sampleRate} Hz`
      this.drawScope()
    } catch (e) {
      if (this.status) this.status.textContent = `no audio: ${(e as Error).message}`
    }
  }

  private async noteOn(note: number, velocity: number) {
    if (this.settings.target !== 'volca' && !this.playback.started) await this.start()
    await this.playback.noteOn(note, velocity)
  }

  private wire() {
    const s = this.settings
    $<HTMLButtonElement>('#start')?.addEventListener('click', () => this.start())
    const model = $<HTMLSelectElement>('#model')
    if (model) {
      model.value = s.model
      model.addEventListener('change', () => { this.playback.set({ model: model.value as Model }); this.onModel(s.model) })
    }
    const volume = $<HTMLInputElement>('#volume')
    if (volume) {
      volume.value = String(s.volume)
      volume.addEventListener('input', () => this.playback.set({ volume: Number(volume.value) }))
    }
    const channel = $<HTMLInputElement>('#channel')
    if (channel) {
      channel.value = String(s.channel)
      channel.addEventListener('change', () => this.playback.set({ channel: Math.max(1, Math.min(16, Number(channel.value) || 1)) }))
    }
    const select = $<HTMLSelectElement>('#output')
    this.playback.onPorts = () => {
      select?.replaceChildren(...this.playback.outputs.map((n) => new Option(n, n)))
      if (select) select.value = this.playback.outputName ?? ''
    }
    if (select) select.onchange = () => this.playback.set({ port: select.value })
    $<HTMLButtonElement>('#connect')?.addEventListener('click', async () => {
      const why = await this.playback.connect()
      if (why && this.status) this.status.textContent = why
    })
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-target]')) {
      b.classList.toggle('on', b.dataset.target === s.target)
      b.addEventListener('click', () => {
        this.playback.set({ target: b.dataset.target as Target })
        for (const x of document.querySelectorAll('[data-target]')) x.classList.toggle('on', x === b)
      })
    }
    this.drawKeys()
    this.computerKeys()
  }

  private drawScope() {
    const canvas = $<HTMLCanvasElement>('#scope')
    const engine = this.playback.engine
    if (!canvas || !engine) return
    const g = canvas.getContext('2d')!
    const data = new Float32Array(engine.analyser.fftSize)
    const frame = () => {
      engine.analyser.getFloatTimeDomainData(data)
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
        void this.noteOn(n, Math.max(1, Math.min(127, Math.round(((e.clientY - r.top) / r.height) * 127))))
      })
      key.addEventListener('pointerup', () => this.playback.noteOff(n))
      key.addEventListener('pointercancel', () => this.playback.noteOff(n))
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
      if (i >= 0) void this.noteOn(60 + 12 * octave + i, velocity())
    })
    window.addEventListener('keyup', (e) => {
      const i = MAP.indexOf(e.key)
      // the note may have started in another octave: release every note this key could have played
      if (i >= 0) for (let o = -3; o <= 3; o++) this.playback.noteOff(60 + 12 * o + i)
    })
    window.addEventListener('blur', () => this.playback.allNotesOff())
  }
}
