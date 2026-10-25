// Envelope shapes per role (PLAN §4.3): a carrier's envelope is the loudness, a modulator's the brightness, usually
// a little faster or lower, like a filter closing with the note. The DX7's EG starts at L4 at key-on, runs
// R1 → L1, R2 → L2, R3 → L3, holds L3 while the key is down and runs R4 → L4 after.
// Rates measured with the engine (tools/calibrate.ts, docs/SOUND.md): attack (R1, to 90 %) 30 ≈ 1.5 s, 40 ≈ 0.55 s,
// 50 ≈ 0.17 s, 60 ≈ 0.06 s, 70 and up nearly instant; a fall to −40 dB at 30 ≈ 5.5 s, 40 ≈ 2 s, 50 ≈ 0.6 s,
// 60 ≈ 0.2 s, 70 ≈ 0.08 s. About ×3 per 10.
import { algorithmOf } from '../dx7/algorithms'
import { OP, opBase, VC, type Voice } from '../dx7/voice'
import type { Shape } from './choices'
import type { Rng } from './random'

export interface Eg {
  rates: readonly [number, number, number, number]
  levels: readonly [number, number, number, number]
}

interface ShapeSpec {
  carrier: Eg
  modulator: Eg
}

export const SHAPE_SPECS: Record<Shape, ShapeSpec> = {
  // rings out in ~2 s, the brightness in ~0.7 s; release ~0.6 s
  pluck: { carrier: { rates: [99, 42, 30, 50], levels: [99, 0, 0, 0] }, modulator: { rates: [99, 50, 30, 50], levels: [99, 0, 0, 0] } },
  // a quick drop to −8 dB, then a fade of ~4 s, brighter at the start
  struck: { carrier: { rates: [99, 60, 34, 50], levels: [99, 88, 0, 0] }, modulator: { rates: [99, 56, 38, 50], levels: [99, 78, 0, 0] } },
  // attack ~0.15 s, the brightness ~0.4 s; release ~0.6 s
  bowed: { carrier: { rates: [52, 45, 40, 50], levels: [99, 95, 93, 0] }, modulator: { rates: [44, 42, 40, 50], levels: [95, 92, 90, 0] } },
  // attack ~1 s, the brightness ~1.5 s; release ~2.5 s
  pad: { carrier: { rates: [34, 38, 40, 38], levels: [99, 97, 95, 0] }, modulator: { rates: [30, 34, 40, 38], levels: [92, 88, 86, 0] } },
  // the carriers in ~0.05 s, the brightness in ~0.25 s: it rises into the note; release ~0.4 s
  swell: { carrier: { rates: [62, 50, 45, 55], levels: [99, 95, 93, 0] }, modulator: { rates: [48, 45, 45, 55], levels: [99, 92, 90, 0] } },
  gate: { carrier: { rates: [99, 99, 99, 70], levels: [99, 99, 99, 0] }, modulator: { rates: [99, 99, 99, 70], levels: [99, 99, 99, 0] } },
  // a swell to the top in ~1 s, then cut off at once
  reverse: { carrier: { rates: [36, 99, 50, 99], levels: [99, 0, 0, 0] }, modulator: { rates: [38, 99, 50, 99], levels: [99, 0, 0, 0] } },
}

export function setEg(v: Voice, op: number, eg: Eg) {
  const b = opBase(op)
  eg.rates.forEach((r, i) => (v[b + OP.rate1 + i] = clamp99(r)))
  eg.levels.forEach((l, i) => (v[b + OP.level1 + i] = clamp99(l)))
}

export const clamp99 = (x: number) => Math.max(0, Math.min(99, Math.round(x)))

/** Carriers and modulators of the voice's algorithm. */
export function rolesOf(v: Voice) {
  const alg = algorithmOf(v[VC.algorithm])
  const carriers = [...alg.carriers]
  return { carriers, modulators: [1, 2, 3, 4, 5, 6].filter((o) => !carriers.includes(o)), algorithm: alg }
}

/** Every operator's envelope for `shape` by its role, the rates a little apart. In place. */
export function applyShape(v: Voice, shape: Shape, rng: Rng, spread: number) {
  const spec = SHAPE_SPECS[shape]
  const { carriers } = rolesOf(v)
  for (let op = 1; op <= 6; op++) {
    const eg = carriers.includes(op) ? spec.carrier : spec.modulator
    setEg(v, op, { rates: eg.rates.map((r) => (r === 99 ? r : r + Math.round((rng.next() - 0.5) * 6 * spread))) as unknown as Eg['rates'], levels: eg.levels })
  }
}

/** A transient dies away fast whatever the shape (a tine, a bell's clang, breath): ~0.2 s. In place. */
export function makeTransient(v: Voice, op: number) {
  const b = opBase(op)
  v[b + OP.rate1] = 99
  v[b + OP.rate2] = Math.max(v[b + OP.rate2], 58)
  v[b + OP.level2] = 0
  v[b + OP.level3] = 0
}

/** Short (−1) … long (+1): every rate but the instant ones by up to 12 (about 3× the time either way). In place. */
export function applyLength(v: Voice, length: number) {
  if (!length) return
  for (let op = 1; op <= 6; op++) {
    const b = opBase(op)
    for (let i = 0; i < 4; i++) if (v[b + OP.rate1 + i] < 99) v[b + OP.rate1 + i] = clamp99(v[b + OP.rate1 + i] - 12 * length)
  }
}
