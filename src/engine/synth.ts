// A DX7-style 6-operator synth (PLAN §5), in floats, one sample at a time. The arithmetic follows MSFA
// (music-synthesizer-for-android, Apache 2.0; tables.ts) in its own units: EG levels in steps of 1/256 doubling,
// operator gain 2^(level/256 − 14), modulation in cycles. MSFA works in blocks of 64 samples at 44.1 kHz; here
// the same increments are spread per sample and scaled to the sample rate. Plain TypeScript without browser
// globals: the AudioWorklet and the offline renders (tests, measures) run the same code.
import { algorithmOf, type Algorithm } from '../dx7/algorithms'
import { OP, opBase, VC, type Voice } from '../dx7/voice'
import { MODELS, type ModelProfile } from './models'
import {
  AMP_MOD_DEPTH, lfoDelayRates, lfoHz, PITCH_LEVEL, PITCH_MOD_SENS, PITCH_RATE, PITCH_RATE_UNIT, scaleLevel, scaleOutLevel, scaleRate, scaleVelocity,
} from './tables'

/** MSFA's EG ran once per 64 samples at 44.1 kHz. */
const EG_BLOCKS_PER_SECOND = 44100 / 64
/** Below this gain an operator is skipped (MSFA's kLevelThresh, 1120 in Q24). */
const SILENT_GAIN = 1120 / (1 << 24)
/** The voice's output scale: MSFA sums carriers in Q24 and shifts by 4 to full scale, so gain 16 = 1.0. */
const OUTPUT_SCALE = 1 / 16

/** An operator envelope: four rates and levels, in MSFA's level units. */
class Env {
  private rates = [0, 0, 0, 0]
  private levels = [0, 0, 0, 0]
  private outLevel = 0
  private rateScaling = 0
  private ix = 0
  private down = true
  private rising = false
  private target = 0
  private inc = 0
  level = 0

  constructor(private readonly incScale: number) {}

  init(rates: number[], levels: number[], outLevel: number, rateScaling: number) {
    this.rates = rates
    this.levels = levels
    this.outLevel = outLevel
    this.rateScaling = rateScaling
    this.level = 0
    this.down = true
    this.advance(0)
  }

  keyUp() {
    if (!this.down) return
    this.down = false
    this.advance(3)
  }

  /** Done: released and at its final level. */
  get finished() {
    return this.ix >= 4
  }

  private advance(ix: number) {
    this.ix = ix
    if (ix >= 4) return
    const actual = ((scaleOutLevel(this.levels[ix]) >> 1) << 6) + this.outLevel - 4256
    this.target = Math.max(16, actual)
    this.rising = this.target > this.level
    const qrate = Math.min(63, ((this.rates[ix] * 41) >> 6) + this.rateScaling)
    // MSFA: (4 + (qrate & 3)) << (2 + LG_N + (qrate >> 2)) per block in Q24, i.e. this many level units per block
    this.inc = ((4 + (qrate & 3)) * 2 ** (8 + (qrate >> 2))) / 65536 * this.incScale
  }

  next(): number {
    if (this.ix < 3 || (this.ix < 4 && !this.down)) {
      if (this.rising) {
        if (this.level < 1716) this.level = 1716
        this.level += Math.floor(17 - this.level / 256) * this.inc
        if (this.level >= this.target) { this.level = this.target; this.advance(this.ix + 1) }
      } else {
        this.level -= this.inc
        if (this.level <= this.target) { this.level = this.target; this.advance(this.ix + 1) }
      }
    }
    return this.level
  }
}

/** The pitch envelope, in octaves. */
class PitchEnv {
  private rates = [0, 0, 0, 0]
  private levels = [0, 0, 0, 0]
  private ix = 0
  private down = true
  private rising = false
  private target = 0
  private inc = 0
  level = 0

  constructor(private readonly sampleRate: number) {}

  init(rates: number[], levels: number[]) {
    this.rates = rates
    this.levels = levels
    this.level = PITCH_LEVEL[levels[3]] / 32
    this.down = true
    this.advance(0)
  }

  keyUp() {
    if (!this.down) return
    this.down = false
    this.advance(3)
  }

  private advance(ix: number) {
    this.ix = ix
    if (ix >= 4) return
    this.target = PITCH_LEVEL[this.levels[ix]] / 32
    this.rising = this.target > this.level
    this.inc = (PITCH_RATE[this.rates[ix]] * PITCH_RATE_UNIT) / this.sampleRate
  }

  next(): number {
    if (this.ix < 3 || (this.ix < 4 && !this.down)) {
      if (this.rising) {
        this.level += this.inc
        if (this.level >= this.target) { this.level = this.target; this.advance(this.ix + 1) }
      } else {
        this.level -= this.inc
        if (this.level <= this.target) { this.level = this.target; this.advance(this.ix + 1) }
      }
    }
    return this.level
  }
}

/** The one LFO all notes share, as on the DX7: its phase restarts on every key down when sync is on, and so
 *  does its delay. */
class Lfo {
  private phase = 0
  private inc = 0
  private wave = 0
  private sync = true
  private delay: [number, number] | null = null
  private delayState = 0
  private random = 0
  private held = 0.5
  /** 0…1 */
  value = 0.5
  /** 0…1: how far the delay has faded the LFO in */
  delayValue = 1

  constructor(private readonly sampleRate: number) {}

  set(v: Voice) {
    this.inc = lfoHz(v[VC.lfoSpeed]) / this.sampleRate
    this.delay = lfoDelayRates(v[VC.lfoDelay])
    this.wave = v[VC.lfoWave]
    this.sync = v[VC.lfoSync] !== 0
  }

  keyDown() {
    if (this.sync) this.phase = 0.5 - 2 ** -32
    this.delayState = 0
  }

  next() {
    this.phase += this.inc
    const wrapped = this.phase >= 1
    if (wrapped) this.phase -= 1
    const p = this.phase
    switch (this.wave) {
      case 0: this.value = p < 0.5 ? 2 * p : 2 - 2 * p; break // triangle
      case 1: this.value = 1 - p; break // saw down
      case 2: this.value = p; break // saw up
      case 3: this.value = p < 0.5 ? 1 : 0; break // square
      case 4: this.value = 0.5 + 0.5 * Math.sin(2 * Math.PI * p); break
      default: // sample and hold: MSFA's generator, a new value each cycle
        if (wrapped) {
          this.random = (this.random * 179 + 17) & 0xff
          this.held = (((this.random ^ 0x80) + 1) << 16) / (1 << 24)
        }
        this.value = this.held
    }
    if (!this.delay) {
      this.delayValue = 1
    } else if (this.delayState >= 1) {
      this.delayValue = 1
    } else {
      this.delayState += (this.delayState < 0.5 ? this.delay[0] : this.delay[1]) / this.sampleRate
      this.delayValue = this.delayState < 0.5 ? 0 : Math.min(1, (this.delayState - 0.5) * 2)
    }
  }
}

interface OpState {
  env: Env
  /** log2 of the frequency in Hz, without pitch modulation */
  logFreq: number
  phase: number
  ampModSens: number
  /** the last two outputs, when this operator sends feedback */
  out0: number
  out1: number
}

class Note {
  readonly ops: OpState[]
  readonly pitchEnv: PitchEnv
  algorithm: Algorithm = algorithmOf(0)
  fbShift = 16
  pitchModDepth = 0
  pitchModSens = 0
  ampModDepth = 0
  note = -1
  /** the key, as played: noteOff finds the note by it */
  key = -1
  released = false
  active = false
  /** when it started, to steal the oldest */
  age = 0

  constructor(sampleRate: number) {
    const incScale = EG_BLOCKS_PER_SECOND / sampleRate
    this.ops = Array.from({ length: 7 }, () => ({ env: new Env(incScale), logFreq: 0, phase: 0, ampModSens: 0, out0: 0, out1: 0 }))
    this.pitchEnv = new PitchEnv(sampleRate)
  }

  start(v: Voice, key: number, velocity: number, age: number) {
    // transpose moves the key: 24 is none
    const note = key + v[VC.transpose] - 24
    this.key = key
    this.note = note
    this.age = age
    this.released = false
    this.active = true
    const keySync = v[VC.oscKeySync] !== 0
    for (let op = 1; op <= 6; op++) {
      const b = opBase(op)
      const s = this.ops[op]
      let outLevel = scaleOutLevel(v[b + OP.outputLevel])
      outLevel += scaleLevel(note, v[b + OP.breakPoint], v[b + OP.leftDepth], v[b + OP.rightDepth], v[b + OP.leftCurve], v[b + OP.rightCurve])
      outLevel = Math.min(127, outLevel) << 5
      outLevel = Math.max(0, outLevel + scaleVelocity(velocity, v[b + OP.velocitySens]))
      s.env.init(
        [v[b + OP.rate1], v[b + OP.rate2], v[b + OP.rate3], v[b + OP.rate4]],
        [v[b + OP.level1], v[b + OP.level2], v[b + OP.level3], v[b + OP.level4]],
        outLevel, scaleRate(note, v[b + OP.rateScaling]))
      s.logFreq = opLogFreq(note, v[b + OP.oscMode], v[b + OP.coarse], v[b + OP.fine], v[b + OP.detune])
      s.ampModSens = v[b + OP.ampModSens]
      if (keySync) s.phase = 0
      s.out0 = s.out1 = 0
    }
    this.pitchEnv.init(
      [v[VC.pitchRate1], v[VC.pitchRate2], v[VC.pitchRate3], v[VC.pitchRate4]],
      [v[VC.pitchLevel1], v[VC.pitchLevel2], v[VC.pitchLevel3], v[VC.pitchLevel4]])
    this.algorithm = algorithmOf(v[VC.algorithm])
    const fb = v[VC.feedback]
    this.fbShift = fb ? 8 - fb : 16
    this.pitchModDepth = (v[VC.lfoPitchDepth] * 165) >> 6
    this.pitchModSens = PITCH_MOD_SENS[v[VC.pitchModSens] & 7]
    this.ampModDepth = v[VC.lfoAmpDepth] / 99
  }

  release() {
    this.released = true
    for (let op = 1; op <= 6; op++) this.ops[op].env.keyUp()
    this.pitchEnv.keyUp()
  }

  /** One sample. */
  next(lfo: Lfo, sampleRate: number): number {
    // pitch modulation in octaves: MSFA's (pmd × delay) × (sens × (lfo − ½)) >> 39 in Q24
    const pitchMod = this.pitchEnv.next() + (this.pitchModDepth * lfo.delayValue * this.pitchModSens * (lfo.value - 0.5)) / 32768
    // amplitude modulation: how far the LFO is from its top, at full depth (own model, tables.ts)
    const ampMod = this.ampModDepth * lfo.delayValue * (1 - lfo.value)
    let bus1 = 0
    let bus2 = 0
    let out = 0
    let fbIn = 0
    const fbOp = this.algorithm.feedback.from
    if (this.fbShift < 16) {
      const s = this.ops[fbOp]
      fbIn = (s.out0 + s.out1) / 2 / 2 ** this.fbShift
    }
    let allQuiet = true
    for (const step of this.algorithm.steps) {
      const s = this.ops[step.op]
      let level = s.env.next()
      if (s.ampModSens) level -= ampMod * AMP_MOD_DEPTH[s.ampModSens]
      const gain = 2 ** (level / 256 - 14)
      s.phase += 2 ** (s.logFreq + pitchMod) / sampleRate
      s.phase -= Math.floor(s.phase)
      let y = 0
      if (gain >= SILENT_GAIN) {
        allQuiet = false
        let mod = step.inBus === 1 ? bus1 : step.inBus === 2 ? bus2 : 0
        if (step.fbIn) mod += fbIn
        y = Math.sin(2 * Math.PI * (s.phase + mod)) * gain
      }
      if (step.fbOut) { s.out0 = s.out1; s.out1 = y }
      if (step.outBus === 0) out = step.add ? out + y : y
      else if (step.outBus === 1) bus1 = step.add ? bus1 + y : y
      else bus2 = step.add ? bus2 + y : y
    }
    if (this.released && (allQuiet || this.algorithm.carriers.every((c) => this.ops[c].env.finished && this.ops[c].env.level <= 16))) {
      this.active = false
    }
    return out * OUTPUT_SCALE
  }
}

/** log2 of an operator's frequency in Hz (dx7note.cc osc_freq): ratio from the key, or fixed. */
export function opLogFreq(note: number, mode: number, coarse: number, fine: number, detune: number): number {
  if (mode === 0) {
    let lf = Math.log2(440) + (note - 69) / 12
    lf += coarse === 0 ? -1 : Math.log2(coarse)
    if (fine) lf += Math.log2(1 + 0.01 * fine)
    return lf + (12606 * (detune - 7)) / (1 << 24)
  }
  // 10 ^ (coarse & 3 + fine / 100): 1, 10, 100, 1000 Hz and up
  const lf = (((coarse & 3) * 100 + fine) * Math.log2(10)) / 100
  return lf + (detune > 7 ? (13457 * (detune - 7)) / (1 << 24) : 0)
}

export class Synth {
  private voice: Voice
  private notes: Note[] = []
  private readonly lfo: Lfo
  private profile: ModelProfile = MODELS.fm2
  private clock = 0

  constructor(readonly sampleRate: number, voice: Voice, profile: ModelProfile = MODELS.fm2) {
    this.voice = voice
    this.lfo = new Lfo(sampleRate)
    this.lfo.set(voice)
    this.setProfile(profile)
  }

  setProfile(profile: ModelProfile) {
    this.profile = profile
    while (this.notes.length < profile.voices) this.notes.push(new Note(this.sampleRate))
    this.notes.length = profile.voices
  }

  /** The voice for the next notes; sounding notes keep theirs. */
  setVoice(v: Voice) {
    this.voice = Uint8Array.from(v)
    this.lfo.set(this.voice)
  }

  noteOn(key: number, velocity = 100) {
    const vel = this.profile.fixedVelocity ?? velocity
    // the same key again takes its own note; otherwise a free one, else the oldest released, else the oldest
    const n = this.notes.find((x) => x.active && x.key === key)
      ?? this.notes.find((x) => !x.active)
      ?? oldest(this.notes.filter((x) => x.released))
      ?? oldest(this.notes)!
    this.lfo.keyDown()
    n.start(this.voice, key, vel, this.clock++)
  }

  noteOff(key: number) {
    for (const n of this.notes) if (n.active && !n.released && n.key === key) n.release()
  }

  allNotesOff() {
    for (const n of this.notes) if (n.active) n.release()
  }

  /** Silence at once. */
  reset() {
    for (const n of this.notes) n.active = false
  }

  get activeNotes() {
    return this.notes.filter((n) => n.active).length
  }

  /** Adds nothing: fills `out` from `start` for `length` samples. */
  render(out: Float32Array, start = 0, length = out.length - start) {
    for (let i = start; i < start + length; i++) {
      this.lfo.next()
      let sum = 0
      for (const n of this.notes) if (n.active) sum += n.next(this.lfo, this.sampleRate)
      out[i] = sum
    }
  }
}

const oldest = (notes: Note[]) => notes.reduce<Note | undefined>((a, n) => (!a || n.age < a.age ? n : a), undefined)
