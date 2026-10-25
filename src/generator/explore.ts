// The three ways on from a voice, by size (PLAN §4.4):
// - Variation, small: the same pins, controls and instrument; the voice's details move (envelope rates and levels,
//   modulator levels, detune, now and then a modulator's fine tuning). A sibling, still recognisable.
// - Mutate, medium: move what made the voice. The pins wander around the wheel and in or out, their weights shift,
//   now and then a pin comes or goes (an instrument without pins always gets a first one); the controls get a push,
//   sometimes another envelope. The generator then makes the voice: still a voice of the wheel, somewhere else.
// - New voice, large: a fresh roll of the wheel. New pins anywhere, the controls back to their defaults (the
//   register stays), no instrument.
import { algorithmOf } from '../dx7/algorithms'
import { getOp, setOp, setVc, VC, type Voice } from '../dx7/voice'
import { DEFAULT_CHOICES, SECTOR, SHAPES, type GeneratorChoices, type Pin } from './choices'
import type { Rng } from './random'
import { noiseSource } from './tonalities'

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

/** `amount` 0…1: how far. The pins keep their order (the first pins stay the first). */
export function mutateChoices(c: GeneratorChoices, rng: Rng, amount = 0.6, maxPins = 3): GeneratorChoices {
  const a = clamp(amount, 0, 1)
  let pins: Pin[] = c.pins.map((p) => ({
    // up to about two sectors either way
    angle: (p.angle + (rng.next() * 2 - 1) * SECTOR * (0.6 + 1.6 * a) + 360) % 360,
    radius: clamp(p.radius + (rng.next() * 2 - 1) * 0.45 * a, 0, 1),
    weight: clamp(p.weight * 2 ** ((rng.next() * 2 - 1) * 1.2 * a), 0.05, 1),
  }))
  // a pin goes (the lightest, never the last) or a new one comes, anywhere on the wheel; an instrument without pins
  // always gets one (otherwise only its controls would move)
  if (c.instrument && !pins.length) {
    pins.push({ angle: rng.range(0, 360), radius: rng.range(0.3, 0.8), weight: rng.range(0.3, 0.6) })
  } else if (pins.length > 1 && rng.chance(0.2 * a)) {
    const lightest = pins.reduce((m, p, i) => (p.weight < pins[m].weight ? i : m), 0)
    pins = pins.filter((_, i) => i !== lightest)
  } else if (pins.length < maxPins && rng.chance(0.25 + 0.3 * a)) {
    pins.push({ angle: rng.range(0, 360), radius: rng.range(0.2, 1), weight: rng.range(0.15, 0.5) })
  }
  const push = (x: number, lo: number, hi: number, by: number) => clamp(x + (rng.next() * 2 - 1) * by * a, lo, hi)
  return {
    ...c,
    pins,
    brightness: push(c.brightness, -1, 1, 0.6),
    complexity: push(c.complexity, 0, 1, 0.45),
    motion: push(c.motion, 0, 1, 0.45),
    length: push(c.length, -1, 1, 0.5),
    shape: rng.chance(0.25 * a) ? rng.pick([null, ...SHAPES]) : c.shape,
  }
}

/** New voice: one to three pins anywhere (one in three times a single pin, two most often), the first the heaviest;
 *  the controls at their defaults but the register, no instrument. */
export function freshChoices(c: GeneratorChoices, rng: Rng): GeneratorChoices {
  const n = rng.chance(0.3) ? 1 : rng.chance(0.7) ? 2 : 3
  const pins: Pin[] = Array.from({ length: n }, (_, i) => ({
    angle: rng.range(0, 360),
    radius: rng.range(0.15, 0.95),
    weight: i === 0 ? rng.range(0.6, 1) : rng.range(0.2, 0.6),
  }))
  return { ...DEFAULT_CHOICES, register: c.register, pins }
}

/** Variation: the voice's details moved by `amount` 0…1, in place. Envelope rates ±5 and inner levels ±4, every
 *  modulator's level ±6, the carriers' detune ±2, most times a modulator's fine tuning a few steps, now and then the
 *  feedback a step. A noise source and a strong feedback loop keep their levels: a step there can tip the sound. */
export function varyVoice(v: Voice, rng: Rng, amount = 1) {
  const a = Math.max(0, Math.min(1, amount))
  if (!a) return
  const nudge = (x: number, by: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x + Math.round((rng.next() * 2 - 1) * by * a)))
  const alg = algorithmOf(v[VC.algorithm])
  const noise = noiseSource(v)
  const loop = v[VC.feedback] >= 6 ? [alg.feedback.from, alg.feedback.to] : []
  const sounding = [1, 2, 3, 4, 5, 6].filter((op) => getOp(v, op, 'outputLevel') > 0)
  const modulators = sounding.filter((op) => !alg.carriers.includes(op) && op !== noise && !loop.includes(op))
  for (const op of sounding) {
    for (const r of ['rate1', 'rate2', 'rate3', 'rate4'] as const) {
      const x = getOp(v, op, r)
      if (x > 0 && x < 99) setOp(v, op, r, nudge(x, 5, 1, 98))
    }
    for (const l of ['level2', 'level3'] as const) {
      const x = getOp(v, op, l)
      if (x > 0 && x < 99 && op !== noise) setOp(v, op, l, nudge(x, 4, 1, 98))
    }
    if (alg.carriers.includes(op)) setOp(v, op, 'detune', nudge(getOp(v, op, 'detune'), 2, 0, 14))
  }
  for (const op of modulators) setOp(v, op, 'outputLevel', nudge(getOp(v, op, 'outputLevel'), 6, 1, 99))
  const tunable = modulators.filter((op) => getOp(v, op, 'oscMode') === 0)
  if (tunable.length && rng.chance(0.7 * a)) {
    const op = rng.pick(tunable)
    setOp(v, op, 'fine', Math.max(0, Math.min(99, getOp(v, op, 'fine') + (rng.chance(0.5) ? 1 : -1) * rng.int(1, 6))))
  }
  const fb = v[VC.feedback]
  if (fb > 0 && fb < 6 && rng.chance(0.4 * a)) setVc(v, 'feedback', fb + (rng.chance(0.5) ? 1 : -1))
}
