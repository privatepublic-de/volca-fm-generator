// The twelve tonalities as data (PLAN §4.1, §4.2): each has a skeleton (algorithm, and per operator its ratio or
// fixed frequency, level, detune), a branch it brings into another tonality's free operators, and a transform it
// applies as a secondary pin. Starting points to tune by ear on the volca: change the numbers here, not the code.
// Measured with the engine (tools/calibrate.ts): a modulator at 1:1 brightens steeply, 60 ≈ a touch, 70 clearly,
// 80 strong, 90+ very bright; feedback 6–7 on an operator at 80–88 is saw-like. Real noise only comes from feedback 7
// on an operator at 96 or more, output level and envelope together (at 92 it is still a periodic tone): `noise`
// operators hold their envelope at the top and leave the shape to the carrier they feed.
import { algorithmOf } from '../dx7/algorithms'
import { getOp, OP, opBase, setOp, setVc, VC, type Voice } from '../dx7/voice'
import { opRatio, setFixed, setRatio } from '../dx7/frequency'
import type { Shape, Tonality } from './choices'
import type { Rng } from './random'
import { applyPitchBlip, clamp99, makeTransient, rolesOf } from './shapes'

/** A list is a choice, a [lo, hi] pair a range (spread around its middle). */
type Choice = number | readonly number[]
type Range = number | readonly [lo: number, hi: number]

export interface OpSpec {
  ratio?: Choice
  /** a fixed frequency in Hz, as a range */
  fixed?: readonly [lo: number, hi: number]
  level: Range
  /** −7 … +7 */
  detune?: Range
  /** 0–7 */
  velocity?: Range
  /** dies away fast whatever the shape */
  fast?: boolean
  /** a feedback-7 noise source: level at least 97, the envelope held at the top (the feedback must be 7) */
  noise?: boolean
}

export interface Skeleton {
  /** 1–32 as the DX7 numbers them; every one listed must keep the operator roles the specs assume */
  algorithms: readonly number[]
  /** operators not listed are silent: free for a branch or for complexity */
  ops: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, OpSpec>>
  feedback?: Range
  shape: Shape
  /** groups of operators [carrier, modulator] another tonality may take over */
  branches?: readonly (readonly [number, number])[]
  /** delayed vibrato: LFO speed, delay, pitch depth (sensitivity 3) */
  vibrato?: readonly [speed: number, delay: number, depth: number]
  /** sometimes a short pitch fall (above) or scoop (below) into the note */
  pitchBlip?: 'above' | 'below'
}

/** What a tonality brings as a second voice inside another: a carrier and its modulator. */
export interface BranchSpec {
  carrier: OpSpec
  modulator: OpSpec
}

export interface TonalityDef {
  skeleton: Skeleton
  branch: BranchSpec
  /** as a secondary pin, at amount 0…1: in place, by role */
  transform: (v: Voice, amount: number, rng: Rng) => void
  /** a word for names: as the noun, and as the adjective */
  noun: string
  adjective: string
}

// ---------- helpers for the transforms ----------

const level = (v: Voice, op: number) => getOp(v, op, 'outputLevel')
const setLevel = (v: Voice, op: number, l: number) => setOp(v, op, 'outputLevel', clamp99(l))
/** The modulators that sound, without a noise source (it stays as it is: tonalities.ts noiseSource). */
const activeModulators = (v: Voice) => rolesOf(v).modulators.filter((op) => level(v, op) > 0 && op !== noiseSource(v))
const activeCarriers = (v: Voice) => rolesOf(v).carriers.filter((op) => level(v, op) > 0)
const feedbackOp = (v: Voice) => rolesOf(v).algorithm.feedback.to
/** An operator's ratio times `factor`; high partials (above 8:1, a glass or tine sparkle) stay where they are. */
const scaleRatio = (v: Voice, op: number, factor: number) => {
  const r = opRatio(v, op)
  if (r !== null && r <= 8) setRatio(v, op, r * factor)
}
/** Slower (positive) or faster rates on one operator's envelope. */
const slower = (v: Voice, op: number, by: number, stages: readonly number[] = [0, 1, 2, 3]) => {
  const b = opBase(op)
  for (const i of stages) if (v[b + OP.rate1 + i] < 99) v[b + OP.rate1 + i] = clamp99(v[b + OP.rate1 + i] - by)
}
const INHARMONIC = [1.41, 1.73, 2.27, 2.62, 3.14, 3.5, 4.24, 5.19]
/** An operator's envelope `a` of the way to a transient's (makeTransient): a little faster at a little. */
const transientBy = (v: Voice, op: number, a: number) => {
  const b = opBase(op)
  const to = (i: number, x: number) => { v[b + i] = clamp99(v[b + i] + (x - v[b + i]) * a) }
  to(OP.rate1, 99)
  to(OP.rate2, Math.max(v[b + OP.rate2], 58))
  to(OP.level2, 0)
  to(OP.level3, 0)
}
/** A pitch blip (applyPitchBlip) as deep as the amount: none below a tenth, 2 semitones at full. In place. */
const pitchBlipBy = (v: Voice, from: 'above' | 'below', a: number) => {
  const depth = Math.round(5 * Math.min(1, a))
  if (depth) v.set([99, 75, 99, 99, 50 + (from === 'above' ? depth : -depth), 50, 50, 50], VC.pitchRate1)
}

/** Whether the feedback operator is a noise source: feedback 7, the operator at 97 or more, its envelope held. Then
 *  nothing may lower the feedback: at 6 it is a tone again. */
export function hasNoiseSource(v: Voice): boolean {
  return noiseSource(v) !== null
}

/** The noise source operator, if there is one: the controls leave its level and envelope alone. */
export function noiseSource(v: Voice): number | null {
  const op = rolesOf(v).algorithm.feedback.to
  const b = opBase(op)
  return v[VC.feedback] === 7 && level(v, op) >= 97 && v[b + OP.level1] === 99 && v[b + OP.level3] === 99 ? op : null
}

/** A feedback-7 noise source: at least 97, its envelope held at the top until the key is released (with the
 *  carrier's release rate, so the noise stops with the note). In place. */
export function makeNoise(v: Voice, op: number, releaseRate = 60) {
  setLevel(v, op, Math.max(level(v, op), 97))
  v.set([99, 99, 99, releaseRate, 99, 99, 99, 0], opBase(op))
}

export const TONALITY_DEFS: Record<Tonality, TonalityDef> = {
  // three stacks at 1:1, gently modulated, an octave below
  warm: {
    noun: 'Sine', adjective: 'Round',
    skeleton: {
      algorithms: [5, 6], shape: 'bowed', feedback: [0, 2], branches: [[5, 6]],
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [1, 2], level: [48, 62] },
        3: { ratio: [1], level: [86, 94], detune: [2, 4] }, 4: { ratio: [1], level: [38, 55] },
        5: { ratio: [0.5, 2], level: [62, 74] }, 6: { ratio: [1], level: [30, 48] },
      },
    },
    branch: { carrier: { ratio: [1, 0.5], level: [80, 90] }, modulator: { ratio: [1], level: [40, 55] } },
    transform(v, a) {
      for (const op of activeModulators(v)) setLevel(v, op, level(v, op) - 14 * a)
      if (!hasNoiseSource(v)) v[VC.feedback] = Math.round(v[VC.feedback] * (1 - 0.6 * a))
      for (const op of activeCarriers(v)) slower(v, op, 6 * a, [0])
    },
  },
  // odd harmonics: modulators at 2× their carrier, a third partial for colour
  reed: {
    noun: 'Reed', adjective: 'Reedy',
    skeleton: {
      algorithms: [5], shape: 'bowed', feedback: [0, 3], branches: [[5, 6]], vibrato: [70, 75, 6],
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [2], level: [72, 80], velocity: [2, 3] },
        3: { ratio: [1], level: [74, 84], detune: [1, 3] }, 4: { ratio: [3, 2], level: [52, 64] },
      },
    },
    branch: { carrier: { ratio: [1], level: [78, 86] }, modulator: { ratio: [2], level: [70, 78] } },
    transform(v, a) {
      const { carriers, algorithm } = rolesOf(v)
      for (const c of carriers) {
        const base = opRatio(v, c)
        if (base === null) continue
        for (const m of algorithm.modulators[c]) if (level(v, m) > 0 && opRatio(v, m) !== null) {
          // twice the carrier (odd harmonics), as deep as the amount: a quiet modulator at a little (a hint of
          // hollowness), deep at full
          setRatio(v, m, base * 2)
          setLevel(v, m, Math.max(54 + 20 * a, level(v, m) - 14 * (1 - a)))
        }
      }
    },
  },
  // brass: two detuned 1:1 pairs with deep modulation, brightness swelling into the note; a third pair (the one
  // with the feedback) free for a second sound
  brass: {
    noun: 'Brass', adjective: 'Brassy',
    skeleton: {
      algorithms: [5], shape: 'swell', feedback: [5, 6], pitchBlip: 'below', branches: [[5, 6]],
      ops: {
        1: { ratio: [1], level: 99, detune: [-3, -1] }, 2: { ratio: [1], level: [82, 88], velocity: [3, 5] },
        3: { ratio: [1], level: [92, 97], detune: [1, 3] }, 4: { ratio: [1, 2], level: [78, 85], velocity: [3, 5] },
        5: { ratio: [1, 2], level: [80, 88] }, 6: { ratio: [1], level: [74, 82] },
      },
    },
    branch: { carrier: { ratio: [1], level: [84, 92] }, modulator: { ratio: [1], level: [78, 86], velocity: [3, 4] } },
    transform(v, a, rng) {
      for (const op of activeModulators(v)) {
        setLevel(v, op, level(v, op) + 6 * a)
        slower(v, op, 10 * a, [0])
      }
      pitchBlipBy(v, 'below', a)
    },
  },
  // three detuned saws side by side, bowed, with vibrato
  string: {
    noun: 'Strings', adjective: 'Bowed',
    skeleton: {
      algorithms: [5], shape: 'bowed', feedback: [6, 7], branches: [[5, 6]], vibrato: [62, 70, 7],
      ops: {
        1: { ratio: [1], level: 99, detune: [-5, -3] }, 2: { ratio: [1], level: [72, 79] },
        3: { ratio: [1], level: [92, 97], detune: [3, 5] }, 4: { ratio: [1], level: [70, 77] },
        5: { ratio: [1, 2], level: [84, 92], detune: [-1, 1] }, 6: { ratio: [1], level: [78, 84] },
      },
    },
    branch: { carrier: { ratio: [1], level: [86, 94], detune: [3, 5] }, modulator: { ratio: [1], level: [72, 78] } },
    transform(v, a) {
      // detuned apart as far as the amount (never closer than they were), and a bowed vibrato as deep (the base's
      // own, if deeper, stays)
      activeCarriers(v).forEach((op, i) => {
        const apart = (i % 2 ? 1 : -1) * Math.round(1 + 4 * a)
        if (Math.abs(apart) > Math.abs(getOp(v, op, 'detune') - 7)) setOp(v, op, 'detune', 7 + apart)
        slower(v, op, 8 * a, [0])
      })
      if (v[VC.lfoPitchDepth] < Math.round(8 * a)) {
        setVc(v, 'lfoPitchDepth', Math.round(8 * a))
        setVc(v, 'lfoSpeed', 62)
        setVc(v, 'lfoDelay', 70)
        setVc(v, 'pitchModSens', Math.max(v[VC.pitchModSens], 3))
      }
    },
  },
  // a tone, and a feedback-noise stack (OP6 at fb 7 over 90) that puffs at the start and stays a little
  breath: {
    noun: 'Flute', adjective: 'Airy',
    skeleton: {
      algorithms: [5], shape: 'bowed', feedback: 7, branches: [[3, 4]], vibrato: [68, 80, 6],
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [1, 2], level: [58, 68] },
        5: { ratio: [1, 2], level: [62, 72] }, 6: { ratio: [3.5, 7.07, 13.3], level: 99, noise: true },
      },
    },
    branch: { carrier: { ratio: [1, 2], level: [58, 68] }, modulator: { ratio: [3.5, 7.07], level: 99, noise: true } },
    transform(v, a) {
      // air: a little noise of its own, quieter at the top than Noise
      addNoise(v, a, -14)
    },
  },
  // noise as the sound: feedback 7 at the top of a stack, fixed-frequency modulators, everything deep
  noise: {
    noun: 'Noise', adjective: 'Noisy',
    skeleton: {
      algorithms: [5, 6], shape: 'struck', feedback: 7,
      ops: {
        1: { ratio: [1, 2], level: [70, 80] }, 2: { fixed: [1500, 6000], level: [84, 94] },
        3: { ratio: [1.41, 2.62], level: [66, 76] }, 4: { fixed: [200, 900], level: [84, 94] },
        5: { ratio: [1, 5.19, 13], level: 99 }, 6: { ratio: [7.07, 3.5, 13.3], level: 99, noise: true },
      },
    },
    branch: { carrier: { ratio: [1, 5.19], level: [86, 94] }, modulator: { ratio: [7.07, 3.5], level: 99, noise: true } },
    transform(v, a) {
      if (!addNoise(v, a)) {
        // no place for a noise source: the feedback operator buzzes instead, as far as it goes without breaking
        const fb = feedbackOp(v)
        if (level(v, fb) > 0) setLevel(v, fb, Math.min(92, Math.max(level(v, fb), 80 + 10 * a)))
        v[VC.feedback] = Math.max(v[VC.feedback], 6)
      }
    },
  },
  // dense inharmonic: three modulators into one carrier, stacked, none at whole ratios
  metallic: {
    noun: 'Metal', adjective: 'Metal',
    skeleton: {
      algorithms: [16], shape: 'struck', feedback: [3, 5],
      ops: {
        1: { ratio: [1, 1.41], level: 99 }, 2: { ratio: [1.41, 2.62], level: [82, 90] },
        3: { ratio: [2.27, 1.73], level: [76, 84] }, 4: { ratio: [5.19, 7.07], level: [64, 74] },
        5: { ratio: [3.14, 4.24], level: [78, 86] }, 6: { ratio: [9.33, 1.41], level: [60, 70] },
      },
    },
    branch: { carrier: { ratio: [1.41, 2.27], level: [76, 86] }, modulator: { ratio: [3.14, 5.19], level: [66, 76] } },
    transform(v, a, rng) {
      // every modulator toward an inharmonic ratio, as far as the amount: a little off (a shimmer) … all the way;
      // past half, the last carrier apart from the first too
      for (const op of activeModulators(v)) scaleRatio(v, op, rng.pick(INHARMONIC) ** a)
      const cs = activeCarriers(v)
      if (a > 0.5) scaleRatio(v, cs[cs.length - 1], 1.41 ** ((a - 0.5) * 2))
    },
  },
  // sparse inharmonic pairs that ring long; a hum below
  bell: {
    noun: 'Bell', adjective: 'Bell',
    skeleton: {
      algorithms: [5], shape: 'struck', feedback: [0, 2], branches: [[5, 6]],
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [3.5, 2.78, 1.41], level: [66, 76] },
        3: { ratio: [2, 3], level: [80, 88], detune: [2, 4] }, 4: { ratio: [7.07, 5.19], level: [56, 68], fast: true },
        5: { ratio: [0.5, 1], level: [66, 78] }, 6: { ratio: [1.41, 3.5], level: [40, 54] },
      },
    },
    branch: { carrier: { ratio: [1, 2], level: [80, 88] }, modulator: { ratio: [3.5, 1.41], level: [62, 72] } },
    transform(v, a, rng) {
      for (const op of activeCarriers(v)) slower(v, op, 10 * a, [1, 2])
      const mods = activeModulators(v)
      // one modulator toward a bell's ratio, as far as the amount
      if (mods.length) scaleRatio(v, rng.pick(mods), rng.pick([3.5, 1.41, 2.78]) ** a)
      for (const op of mods) slower(v, op, -6 * a, [1, 2])
    },
  },
  // clean high partials, a sparkle at the start
  glass: {
    noun: 'Glass', adjective: 'Glassy',
    skeleton: {
      algorithms: [5], shape: 'struck', branches: [[5, 6]],
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [5, 7], level: [46, 58] },
        3: { ratio: [4, 3], level: [72, 80] }, 4: { ratio: [14, 7], level: [44, 56], fast: true },
        5: { ratio: [7, 5], level: [58, 70] },
      },
    },
    branch: { carrier: { ratio: [4, 7], level: [66, 76] }, modulator: { ratio: [14], level: [44, 56], fast: true } },
    transform(v, a, rng) {
      const mods = activeModulators(v)
      const op = mods.length ? mods.sort((x, y) => (opRatio(v, y) ?? 0) - (opRatio(v, x) ?? 0))[0] : 0
      if (!op) return
      const base = opRatio(v, activeCarriers(v)[0]) ?? 1
      setRatio(v, op, base * rng.pick([7, 14, 14]))
      // its highest modulator a sparkle, as loud as the amount: quiet at a little, bright at full
      setLevel(v, op, 50 + 38 * a)
      makeTransient(v, op)
    },
  },
  // the DX7 e-piano: a 1:1 body and a 14:1 tine that dies at once, both on velocity
  tine: {
    noun: 'E.Piano', adjective: 'Tine',
    skeleton: {
      algorithms: [5], shape: 'struck', branches: [[5, 6]],
      ops: {
        1: { ratio: [1], level: 99, velocity: [2, 3] }, 2: { ratio: [1], level: [74, 82], velocity: [3, 5] },
        3: { ratio: [1], level: [86, 94], detune: [2, 4] }, 4: { ratio: [14, 13, 15], level: [70, 80], velocity: [5, 7], fast: true },
      },
    },
    branch: { carrier: { ratio: [1], level: [84, 92] }, modulator: { ratio: [14], level: [70, 80], velocity: [5, 7], fast: true } },
    transform(v, a) {
      const mods = activeModulators(v)
      const op = mods.find((m) => (opRatio(v, m) ?? 0) >= 7) ?? mods[mods.length - 1]
      if (!op) return
      setRatio(v, op, (opRatio(v, activeCarriers(v)[0]) ?? 1) * 14)
      setLevel(v, op, 50 + 30 * a)
      setOp(v, op, 'velocitySens', 6)
      makeTransient(v, op)
    },
  },
  // short and knocky: a low body, fast high partials
  wooden: {
    noun: 'Marimba', adjective: 'Wood',
    skeleton: {
      algorithms: [5], shape: 'pluck', branches: [[5, 6]], pitchBlip: 'above',
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [3, 4], level: [62, 74], fast: true },
        3: { ratio: [4, 3], level: [60, 72] }, 4: { ratio: [1, 2], level: [50, 62], fast: true },
      },
    },
    branch: { carrier: { ratio: [4], level: [62, 72] }, modulator: { ratio: [1], level: [50, 60], fast: true } },
    transform(v, a, rng) {
      for (let op = 1; op <= 6; op++) if (level(v, op) > 0) slower(v, op, -10 * a, [1, 2, 3])
      // the modulators knock: as far toward a transient, and a pitch blip, as the amount
      for (const op of activeModulators(v)) transientBy(v, op, a)
      pitchBlipBy(v, 'above', a)
    },
  },
  // drawbars: six carriers at harmonic ratios
  organ: {
    noun: 'Organ', adjective: 'Organ',
    skeleton: {
      algorithms: [32], shape: 'gate', feedback: [0, 2], vibrato: [80, 0, 3],
      ops: {
        1: { ratio: [0.5], level: [82, 92] }, 2: { ratio: [1], level: 99 }, 3: { ratio: [2], level: [80, 92] },
        4: { ratio: [3], level: [66, 84] }, 5: { ratio: [4], level: [58, 78] }, 6: { ratio: [8, 6], level: [48, 70] },
      },
    },
    branch: { carrier: { ratio: [2], level: [78, 88] }, modulator: { ratio: [1], level: [30, 44] } },
    transform(v, a) {
      for (const op of activeModulators(v)) setLevel(v, op, level(v, op) - 12 * a)
      for (const op of activeCarriers(v)) {
        const b = opBase(op)
        // held: the sustain as far up toward 95 as the amount (a pluck doesn't turn into an organ at a little)
        v[b + OP.level3] = Math.round(v[b + OP.level3] + Math.max(0, 95 - v[b + OP.level3]) * a)
        v[b + OP.level2] = Math.max(v[b + OP.level2], v[b + OP.level3])
      }
    },
  },
}

// ---------- building a skeleton ----------

/** A value from a choice list: near the middle (spread 0) the first two, wild (1) any. */
export function choose(c: Choice, rng: Rng, spread: number): number {
  if (typeof c === 'number') return c
  return c[rng.int(0, Math.min(c.length - 1, spread >= 0.6 ? c.length - 1 : 1))]
}

/** A value in a range: around its middle, the wider the spread (1 = anywhere in it, a little beyond). */
export function within(r: Range, rng: Rng, spread: number): number {
  if (typeof r === 'number') return r
  const [lo, hi] = r
  return Math.round((lo + hi) / 2 + (rng.next() - 0.5) * (hi - lo) * Math.min(1.3, spread * 1.3))
}

/** One operator from its spec. */
export function applyOpSpec(v: Voice, op: number, s: OpSpec, rng: Rng, spread: number) {
  if (s.fixed) setFixed(v, op, Math.exp(rng.range(Math.log(s.fixed[0]), Math.log(s.fixed[1]))))
  else setRatio(v, op, choose(s.ratio ?? 1, rng, spread))
  setLevel(v, op, within(s.level, rng, spread))
  setOp(v, op, 'detune', 7 + (s.detune === undefined ? 0 : within(s.detune, rng, spread)))
  setOp(v, op, 'velocitySens', s.velocity === undefined ? 0 : within(s.velocity, rng, spread))
}

/** How loud a noise branch is against the tone, in dB, for amount 0…1: a hint of air at the bottom, a lot at the top.
 *  The noise itself is all or nothing (feedback 7 at 96+), so the amount is the level of what carries it. */
export const noiseDb = (amount: number, top = -6) => -40 + (top + 40) * Math.max(0, Math.min(1, amount))

/** Switches to the algorithm with the same operator roles whose feedback can be a noise source: 32 → 31 (OP6 into
 *  OP5); 6 → 5 and 4 → 3 (their feedback is a loop between two operators). In place. */
export function useNoiseHost(v: Voice) {
  v[VC.algorithm] = noiseHostAlgorithm(v[VC.algorithm])
}
const noiseHostAlgorithm = (byte: number) => ({ 31: 30, 5: 4, 3: 2 } as Record<number, number>)[byte] ?? byte

/** The operator that would become the noise source (the feedback one, after useNoiseHost). */
export const noiseHostOp = (v: Voice) => algorithmOf(noiseHostAlgorithm(v[VC.algorithm])).feedback.to

/** Noise into a voice, `amount` 0…1, gradual: the feedback operator becomes a noise source, and how much of it is
 *  heard is set where it goes. Into a carrier: that carrier's level (noiseDb). Into a modulator: that modulator's
 *  level, which sets how far the noise roughens what it modulates. In place; false when this algorithm can't take it
 *  (its feedback operator modulates several). */
export function addNoise(v: Voice, amount: number, top = -6): boolean {
  useNoiseHost(v)
  const { algorithm, carriers } = rolesOf(v)
  const fb = algorithm.feedback
  if (fb.from !== fb.to) return false
  const into = [1, 2, 3, 4, 5, 6].filter((c) => algorithm.modulators[c].includes(fb.to))
  if (into.length !== 1) return false
  const target = into[0]
  const main = carriers.find((c) => c !== target && level(v, c) > 0) ?? carriers[0]
  makeNoise(v, fb.to, getOp(v, main, 'rate4'))
  v[VC.feedback] = 7
  if (carriers.includes(target)) {
    // the carrier only carries the noise: no other modulators, the main carrier's envelope, level by amount
    for (const m of algorithm.modulators[target]) if (m !== fb.to) setLevel(v, m, 0)
    if (opRatio(v, target) === null) setRatio(v, target, 1)
    v.copyWithin(opBase(target) + OP.rate1, opBase(main) + OP.rate1, opBase(main) + OP.rate1 + 8)
    setLevel(v, target, level(v, main) + Math.round(noiseDb(amount, top) / 0.75))
  } else {
    // 45 barely roughens, 85 is all noise
    setLevel(v, target, 45 + 40 * Math.max(0, Math.min(1, amount)) * ((top + 40) / 34))
  }
  return true
}

/** The transient operators of a skeleton or branch. */
export const fastOps = (ops: Skeleton['ops']) => Object.entries(ops).flatMap(([op, s]) => (s?.fast ? [Number(op)] : []))
/** Its noise operators. */
export const noiseOps = (ops: Skeleton['ops']) => Object.entries(ops).flatMap(([op, s]) => (s?.noise ? [Number(op)] : []))
