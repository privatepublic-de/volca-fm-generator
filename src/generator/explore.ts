// Mutate (PLAN §4.4): instead of nudging a voice's bytes, move what made it. The pins wander around the wheel and in
// or out, their weights shift, now and then a pin comes or goes; the controls get a push, sometimes another
// envelope. The generator then makes the voice, so a mutation is still a voice of the wheel, just somewhere else.
import { SECTOR, SHAPES, type GeneratorChoices, type Pin } from './choices'
import type { Rng } from './random'

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
  // a pin goes (the lightest, never the last) or a new one comes, anywhere on the wheel
  if (pins.length > 1 && rng.chance(0.2 * a)) {
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
