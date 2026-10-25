// Playing a voice on the browser engine, the volca or both, without any page around it: the app and the dev pages'
// Player build on this. The volcas take a whole voice at a time (PLAN §1), so a new voice is sent debounced, and at
// once before a note that needs it.
import { vcedMessage } from '../dx7/sysex'
import type { Voice } from '../dx7/voice'
import { BrowserEngine } from '../engine/engine'
import type { Model } from '../engine/models'
import { findOutput, outputNames, requestWebMidi, send, webMidiUnavailable } from '../midi/transport'

export type Target = 'browser' | 'volca' | 'both'

export interface PlaybackSettings {
  model: Model
  volume: number
  port: string
  channel: number
  target: Target
  /** the volca fm2's chorus and reverb depth, 0–127 (CC 93 and 91; switched on at the volca) */
  chorus: number
  reverb: number
  /** the volca fm's chorus button, for the browser's sound only: MIDI can't switch it */
  fmChorus: boolean
}

/** The fm2's effect depths (MIDI implementation rev. 1.00, 2022-11-17; with MIDI Short Message on). */
export const CC_REVERB = 91
export const CC_CHORUS = 93

const SETTINGS_KEY = 'volca:player'
const SEND_DELAY = 120

export class Playback {
  readonly settings: PlaybackSettings = { model: 'fm2', volume: 2, port: '', channel: 1, target: 'browser', chorus: 0, reverb: 0, fmChorus: false }
  engine: BrowserEngine | null = null
  private access: MIDIAccess | null = null
  private output: MIDIOutput | null = null
  private voice: Voice | null = null
  private volcaHasVoice = false
  private sendTimer: ReturnType<typeof setTimeout> | undefined
  private readonly held = new Set<number>()
  /** the last note played, so a change is heard where you were playing (C4 until then) */
  lastNote = 60
  /** a note started or stopped (for drawing the keys) */
  onNotes: (held: ReadonlySet<number>) => void = () => {}
  /** the MIDI ports or the chosen one changed */
  onPorts: () => void = () => {}

  constructor() {
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')) } catch { /* defaults */ }
    // to look inside from the console while developing
    if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { playback: Playback }).playback = this
  }

  set(patch: Partial<PlaybackSettings>) {
    Object.assign(this.settings, patch)
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)) } catch { /* private window */ }
    if (patch.model) this.engine?.setModel(patch.model)
    if (patch.volume !== undefined) this.engine?.setGain(patch.volume)
    if (patch.port !== undefined && this.access) { this.output = findOutput(this.access, patch.port); this.volcaHasVoice = false; this.onPorts() }
    if (patch.target && this.toVolca()) { this.sendToVolca(); this.sendEffects() }
    if (patch.model || patch.chorus !== undefined || patch.reverb !== undefined || patch.fmChorus !== undefined) this.applyEffects()
    if (patch.chorus !== undefined && this.fm2ToVolca()) send(this.output, [0xb0 | this.ch(), CC_CHORUS, patch.chorus & 0x7f])
    if (patch.reverb !== undefined && this.fm2ToVolca()) send(this.output, [0xb0 | this.ch(), CC_REVERB, patch.reverb & 0x7f])
  }

  /** MIDI access granted (the outputs can still be none) */
  get midiReady() {
    return this.access !== null
  }

  get outputs(): string[] {
    return this.access ? outputNames(this.access) : []
  }

  get outputName(): string | null {
    return this.output?.name ?? null
  }

  get started() {
    return !!this.engine
  }

  setVoice(v: Voice) {
    this.voice = Uint8Array.from(v)
    this.engine?.setVoice(this.voice)
    this.volcaHasVoice = false
    if (this.toVolca()) {
      clearTimeout(this.sendTimer)
      this.sendTimer = setTimeout(() => this.sendToVolca(), SEND_DELAY)
    }
  }

  private fm2ToVolca = () => this.settings.model === 'fm2' && this.toVolca()

  /** The browser's chorus and reverb as the volca would have them: the fm2's depths, or the fm's chorus button. */
  private applyEffects() {
    const s = this.settings
    this.engine?.setEffects(s.model === 'fm2' ? { chorus: s.chorus / 127, reverb: s.reverb / 127 } : { chorus: s.fmChorus ? 0.6 : 0, reverb: 0 })
  }

  /** The effect depths to the fm2, as they are now. */
  private sendEffects() {
    if (!this.fm2ToVolca()) return
    send(this.output, [0xb0 | this.ch(), CC_CHORUS, this.settings.chorus & 0x7f])
    send(this.output, [0xb0 | this.ch(), CC_REVERB, this.settings.reverb & 0x7f])
  }

  private toBrowser = () => this.settings.target !== 'volca'
  private toVolca = () => this.settings.target !== 'browser' && !!this.output
  private ch = () => (this.settings.channel - 1) & 0x0f

  /** Sends the voice now. */
  sendToVolca() {
    clearTimeout(this.sendTimer)
    if (!this.output || !this.voice) return
    // the fm2 takes either byte 155 (FINDINGS Q1); the volca fm's own form is the operator bits
    send(this.output, vcedMessage(this.voice, { tail: 'opBits' }))
    this.volcaHasVoice = true
  }

  /** Call from a click or key press: browsers start audio only after one. */
  async start() {
    if (this.engine) return
    this.engine = await BrowserEngine.start()
    this.engine.setModel(this.settings.model)
    this.engine.setGain(this.settings.volume)
    this.applyEffects()
    if (this.voice) this.engine.setVoice(this.voice)
  }

  /** Asks for MIDI; null when it worked, else why not. */
  async connect(): Promise<string | null> {
    const why = webMidiUnavailable()
    if (why) return why
    try {
      this.access = await requestWebMidi()
      const fill = () => {
        this.output = findOutput(this.access!, this.settings.port)
        this.volcaHasVoice = false
        // the volca gets the voice on stage and the effect depths as soon as it can
        if (this.voice && this.toVolca()) this.sendToVolca()
        this.sendEffects()
        this.onPorts()
      }
      this.access.onstatechange = fill
      fill()
      return null
    } catch (e) {
      // Firefox grants MIDI through a site permission add-on it offers to install; turned down, it says so
      if (/add-on/i.test((e as Error).message)) return 'No MIDI access: Firefox needs its site permission add-on for this page. Press Connect again and add it.'
      return `No MIDI access: ${(e as Error).message}`
    }
  }

  async noteOn(note: number, velocity: number) {
    if (this.held.has(note)) return
    if (this.toBrowser() && !this.engine) await this.start()
    this.held.add(note)
    this.lastNote = note
    if (this.toBrowser()) this.engine?.noteOn(note, velocity)
    if (this.toVolca()) {
      if (!this.volcaHasVoice) this.sendToVolca()
      send(this.output, [0x90 | this.ch(), note, velocity])
    }
    this.onNotes(this.held)
  }

  noteOff(note: number) {
    if (!this.held.delete(note)) return
    this.engine?.noteOff(note)
    if (this.output) send(this.output, [0x80 | this.ch(), note, 0])
    this.onNotes(this.held)
  }

  allNotesOff() {
    for (const n of [...this.held]) this.noteOff(n)
  }

  /** For tests: an output without Web MIDI. */
  useOutput(output: MIDIOutput | null) {
    this.output = output
    this.volcaHasVoice = false
  }

  /** Plays a note briefly, to hear a new voice without touching the keyboard. */
  audition(note = this.lastNote, velocity = 100, ms = 700) {
    void this.noteOn(note, velocity)
    setTimeout(() => this.noteOff(note), ms)
  }
}
