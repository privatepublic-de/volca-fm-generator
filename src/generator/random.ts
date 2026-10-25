// A seeded random generator (mulberry32): the same seed gives the same voice, so tests
// are exact and Generate is just a new seed.

export interface Rng {
  /** 0 ≤ n < 1 */
  next(): number
  /** a number from `lo` to `hi` */
  range(lo: number, hi: number): number
  /** a whole number from `lo` to `hi`, both included */
  int(lo: number, hi: number): number
  pick<T>(items: readonly T[]): T
  /** true with probability `p` */
  chance(p: number): boolean
}

export function rng(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
  }
}

export const newSeed = () => Math.floor(Math.random() * 2 ** 31)
