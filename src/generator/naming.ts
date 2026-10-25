// Names from what a voice sounds like, not from the pins that made it (a wild or mutated voice often doesn't sound
// like its pins any more): one render of a held note gives its shape and its most striking trait, in 10
// characters as the DX7 allows. "Airy Pad", "Clang Keys", "Wavy Bass".
import { algorithmOf } from '../dx7/algorithms'
import { getOp, VC, type Voice } from '../dx7/voice'
import { centroid, envelope, flatness, periodicity, pitch, slice, spectrum, type Segment } from '../engine/measure'
import { renderNote } from '../engine/render'
import { PITCH_MOD_SENS } from '../engine/tables'
import { noiseSource } from './tonalities'

/** 16 kHz: lower, aliasing reads as air on metal and bells. 2.5 s: a slow bell's fade must fit. */
const SAMPLE_RATE = 16000
const HOLD = 2.5

export interface SoundTraits {
  /** seconds to 90 % of the loudest */
  attack: number
  /** seconds to half the loudest: a pad that blooms late reaches its body long before its loudest */
  rise: number
  /** seconds from the loudest to −20 dB while held; Infinity: it holds */
  decay: number
  /** still getting louder late in the held note */
  rising: boolean
  /** the fundamental in Hz (C4 played), as measured: an octave-down carrier can make it lower than the note */
  f0: number
  /** the note's own pitch in Hz: C4 moved by the voice's transpose (what decides bass) */
  noteHz: number
  /** sounding operators at non-whole ratios or fixed frequencies (by their level): partials off the harmonic series,
   *  which the periodicity can miss (a 3.5:1 bell is periodic at half the note) */
  inharmonic: number
  /** centre of the spectrum ÷ the fundamental */
  brightness: number
  /** spectral flatness: 0 tone … 0.55 white noise */
  noise: number
  /** 1 a steady harmonic tone, lower for inharmonic sounds */
  periodicity: number
  /** odd harmonics far stronger than even ones */
  hollow: boolean
  /** three or more carriers side by side with hardly any modulation: drawbars */
  additive: boolean
  /** the LFO and pitch envelope move the pitch, in semitones */
  wobble: number
  /** carriers detuned apart, in detune steps */
  spread: number
}

export function soundTraits(v: Voice): SoundTraits {
  const seg: Segment = { samples: renderNote(v, { note: 60, sampleRate: SAMPLE_RATE, holdSeconds: HOLD }), sampleRate: SAMPLE_RATE }
  const win = 0.02
  const env = envelope(seg, win)
  let top = 0
  for (let i = 1; i < env.length; i++) if (env[i] > env[top]) top = i
  const peak = env[top] || 1e-9
  const attack = env.findIndex((x) => x >= 0.9 * peak) * win
  const rise = env.findIndex((x) => x >= 0.5 * peak) * win
  const fall = env.findIndex((x, i) => i > top && x < peak / 10)
  const decay = fall < 0 ? Infinity : (fall - top) * win
  // still clearly growing late in the note: louder at the end than around 60 % by 6 dB (a steady tone's top can be
  // anywhere, and a pad that blooms as its modulators open grows a few dB)
  // (averages over stretches, so beating between detuned carriers doesn't decide it)
  const mean = (from: number, to: number) => {
    const part = env.slice(Math.floor(env.length * from), Math.ceil(env.length * to))
    return part.reduce((sum, x) => sum + x, 0) / Math.max(1, part.length)
  }
  // (and slow from the start: a pad whose modulators open late gets louder too, but reaches its body early)
  const rising = rise > 0.8 && mean(0.85, 1) > mean(0.5, 0.65) * 2
  // the body: after the attack, before a fast decay is over
  const from = Math.min(Math.max(0.15, attack), HOLD - 0.6)
  // 4096 samples are enough for every measure here, and quicker than more
  const body = slice(seg, from, from + Math.min(4096 / SAMPLE_RATE, decay < 0.6 ? Math.max(0.12, decay) : 0.5))
  const f0 = pitch(body) || 261.6 * 2 ** ((v[VC.transpose] - 24) / 12)
  const spec = spectrum(body)
  return {
    attack, rise, decay, rising, f0,
    noteHz: 261.6 * 2 ** ((v[VC.transpose] - 24) / 12),
    inharmonic: inharmonicOf(v),
    additive: additiveOf(v),
    brightness: centroid(body, spec) / f0,
    noise: flatness(body, spec),
    periodicity: periodicity(body),
    hollow: hollowness(spec, f0),
    wobble: wobbleOf(v),
    spread: spreadOf(v),
  }
}

/** Odd harmonics 3, 5, 7 present and the even ones 2, 4, 6 far weaker: a clarinet's, a square's hollowness. */
function hollowness({ magnitudes, binHz }: ReturnType<typeof spectrum>, f0: number): boolean {
  const at = (k: number) => {
    const bin = Math.round((k * f0) / binHz)
    let m = 0
    for (let b = bin - 1; b <= bin + 1; b++) if (b > 0 && b < magnitudes.length) m = Math.max(m, magnitudes[b])
    return m * m
  }
  const odd = at(3) + at(5) + at(7)
  const even = at(2) + at(4) + at(6)
  return odd > at(1) * 0.05 && even < odd * 0.12
}

/** 0…1: how strongly sounding operators sit off the whole-number ratios (or at fixed frequencies), weighted by
 *  their level: a modulator at 3.5 or 1.41 counts, one at 2 or 0.5 doesn't. */
function inharmonicOf(v: Voice): number {
  // a noise source and the carrier it feeds are noise, whatever their ratios
  const noise = noiseSource(v)
  const alg = algorithmOf(v[VC.algorithm])
  const noiseCarrier = noise === null ? null : [1, 2, 3, 4, 5, 6].find((c) => alg.modulators[c].includes(noise))
  let score = 0
  for (let op = 1; op <= 6; op++) {
    const level = getOp(v, op, 'outputLevel')
    if (level < 50 || op === noise || op === noiseCarrier) continue
    const fixed = getOp(v, op, 'oscMode') === 1
    const coarse = getOp(v, op, 'coarse')
    const ratio = (coarse === 0 ? 0.5 : coarse) * (1 + getOp(v, op, 'fine') / 100)
    const off = Math.abs(ratio * 2 - Math.round(ratio * 2)) > 0.08 || (ratio > 1 && Math.abs(ratio - Math.round(ratio)) > 0.08)
    if (fixed || off) score = Math.max(score, (level - 50) / 49)
  }
  return score
}

function additiveOf(v: Voice): boolean {
  const alg = algorithmOf(v[VC.algorithm])
  const sounding = (op: number) => getOp(v, op, 'outputLevel') > 0
  const carriers = alg.carriers.filter(sounding).length
  const modulation = [1, 2, 3, 4, 5, 6].filter((op) => !alg.carriers.includes(op) && getOp(v, op, 'outputLevel') >= 45).length
  return carriers >= 3 && modulation <= 1
}

/** How far the LFO swings the pitch, in semitones (the engine's formula, at full delay), plus a pitch drift. */
function wobbleOf(v: Voice): number {
  const depth = (v[VC.lfoPitchDepth] * 165) >> 6
  const sens = PITCH_MOD_SENS[v[VC.pitchModSens] & 7]
  const lfo = (depth * sens * 0.5) / 32768 * 12
  const drift = Math.max(...[v[VC.pitchLevel1], v[VC.pitchLevel2], v[VC.pitchLevel3]].map((l) => Math.abs(l - 50))) * 0.375
  // a pitch envelope that settles fast is an accent, not a drift
  return lfo + (v[VC.pitchRate1] < 50 ? drift : 0)
}

/** The widest detune between sounding carriers, in steps (each about a cent). */
function spreadOf(v: Voice): number {
  const detunes = algorithmOf(v[VC.algorithm]).carriers.filter((op) => getOp(v, op, 'outputLevel') > 0).map((op) => getOp(v, op, 'detune'))
  return detunes.length > 1 ? Math.max(...detunes) - Math.min(...detunes) : 0
}

// ---------- traits → words ----------

const isInharmonic = (t: SoundTraits) => t.periodicity < 0.9 || t.inharmonic > 0.3

/** The shape, in order of precedence. */
export function nounOf(t: SoundTraits): string {
  if (t.noise > 0.2) return t.decay <= 0.6 ? 'Hit' : 'Noise'
  // a slow rise that ends (the Reverse envelope)
  if (t.rise > 0.4 && t.decay < Infinity) return 'Swell'
  if (t.decay <= 1) return 'Pluck'
  if (t.decay < Infinity) return isInharmonic(t) ? (t.noteHz < 160 || t.f0 < 100 ? 'Gong' : 'Bell') : 'Keys'
  if (t.rising || t.rise > 1) return 'Swell'
  if (t.noteHz < 140 && t.attack < 0.3) return 'Bass'
  if (t.attack >= 0.08) return 'Pad'
  if (t.brightness < 1.1 && t.periodicity > 0.99 && t.noise < 1e-5) return 'Sine'
  return t.additive && !isInharmonic(t) ? 'Organ' : 'Lead'
}

/** The most striking trait, as one word in a long and a short form; none when nothing stands out. Bells and gongs
 *  are inharmonic by name, noise is noisy by name: no word for what the noun says. */
export function adjectiveOf(t: SoundTraits, noun: string): [string, string] | null {
  const noisy = noun === 'Noise' || noun === 'Hit'
  const candidates: [boolean, [string, string]][] = [
    [t.noise > 0.02 && !noisy, ['Noisy', 'Noisy']],
    [t.wobble > 0.4, ['Wobbly', 'Wavy']],
    [isInharmonic(t) && noun !== 'Bell' && noun !== 'Gong', [noun === 'Pluck' || noun === 'Keys' || noisy ? 'Clang' : 'Metal', 'Metal']],
    [t.noise > 1e-5 && !noisy, ['Airy', 'Airy']],
    [t.hollow, ['Hollow', 'Reedy']],
    [t.brightness > 4, ['Bright', 'Shiny']],
    [t.brightness < 1.15 && !noisy && noun !== 'Sine', ['Soft', 'Soft']],
    [t.wobble > 0.12, ['Drift', 'Drift']],
    [t.spread >= 10, ['Wide', 'Wide']],
  ]
  return candidates.find(([yes]) => yes)?.[1] ?? null
}

/** Within 10 characters: adjective and noun, the adjective's short form if needed, else the noun alone. */
export function nameOfSound(t: SoundTraits): string {
  const noun = nounOf(t)
  const adjective = adjectiveOf(t, noun)
  if (!adjective) return noun
  for (const a of adjective) if (`${a} ${noun}`.length <= 10) return `${a} ${noun}`
  return noun
}

export const nameVoice = (v: Voice) => nameOfSound(soundTraits(v))

/** `noun` (an instrument's name) with the sound's most striking trait in front, if both fit 10 characters. */
export function nameWithNoun(v: Voice, noun: string): string {
  const adjective = adjectiveOf(soundTraits(v), noun)
  if (!adjective) return noun
  for (const a of adjective) if (`${a} ${noun}`.length <= 10) return `${a} ${noun}`
  return noun
}

/** `name` made distinct from `taken` by a number: "Airy Pad 2" (the short form, or the noun alone, to fit 10). */
export function distinctName(name: string, taken: readonly string[]): string {
  if (!taken.includes(name)) return name
  // the whole name with a number while it fits, else the noun with one
  for (const base of [name, name.split(' ').at(-1)!]) {
    for (let n = 2; n < 100 && `${base} ${n}`.length <= 10; n++) {
      if (!taken.includes(`${base} ${n}`)) return `${base} ${n}`
    }
  }
  return name
}
