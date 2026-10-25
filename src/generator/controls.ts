// What the controls next to the wheel do to a voice (PLAN §4.3). Each works in place and by role: a carrier's level
// is loudness, a modulator's brightness. Steps are small: ±10 on a modulator is a big change (tonalities.ts).
import { opRatio, setRatio } from '../dx7/frequency'
import { getOp, OP, opBase, setOp, setVc, VC, type Voice } from '../dx7/voice'
import type { Register } from './choices'
import type { Rng } from './random'
import { clamp99, rolesOf } from './shapes'
import { hasNoiseSource, noiseSource } from './tonalities'

const level = (v: Voice, op: number) => getOp(v, op, 'outputLevel')
const setLevel = (v: Voice, op: number, l: number) => setOp(v, op, 'outputLevel', clamp99(l))

/** Mellow (−1) … bright (+1): the modulators' levels and the feedback. The curve is flat below ~60 and steep
 *  above, so a quiet modulator goes up further (up to 22) than a deep one (10); down up to 18. Without modulators
 *  (the organ) the carriers above the lowest, like drawbars. */
export function applyBrightness(v: Voice, b: number) {
  if (!b) return
  const { carriers, modulators } = rolesOf(v)
  const mods = modulators.filter((op) => level(v, op) > 0 && op !== noiseSource(v))
  for (const op of mods) setLevel(v, op, level(v, op) + (b > 0 ? 10 + Math.max(0, 75 - level(v, op)) * 0.5 : 18) * b)
  if (!mods.length) {
    const ratios = carriers.map((op) => opRatio(v, op) ?? 1)
    const lowest = Math.min(...ratios)
    carriers.forEach((op, i) => { if (ratios[i] > lowest && level(v, op) > 0) setLevel(v, op, level(v, op) + (b > 0 ? 10 : 20) * b) })
  }
  if (v[VC.feedback] && Math.abs(b) > 0.4 && !hasNoiseSource(v)) setVc(v, 'feedback', v[VC.feedback] + Math.sign(b))
}

/** A pin's distance from the centre, 0 … 1 (½ the tonality as it comes): the depth of its modulation, mild to
 *  extreme, ±16 levels on every modulator and a step of feedback past a quarter. Its own axis, not folded into the
 *  brightness, so it is heard whatever the Brightness slider says (from Init, at its lowest, too). In place. */
export function applyIntensity(v: Voice, intensity: number) {
  const x = (Math.max(0, Math.min(1, intensity)) - 0.5) * 2
  if (!x) return
  const { carriers, modulators } = rolesOf(v)
  const mods = modulators.filter((op) => level(v, op) > 0 && op !== noiseSource(v))
  for (const op of mods) setLevel(v, op, level(v, op) + 16 * x)
  if (!mods.length) {
    // carriers side by side (drawbars): the ones above the lowest come in or fall back
    const ratios = carriers.map((op) => opRatio(v, op) ?? 1)
    const lowest = Math.min(...ratios)
    carriers.forEach((op, i) => { if (ratios[i] > lowest && level(v, op) > 0) setLevel(v, op, level(v, op) + 16 * x) })
  }
  if (v[VC.feedback] && Math.abs(x) > 0.5 && !hasNoiseSource(v)) setVc(v, 'feedback', v[VC.feedback] + Math.sign(x))
}

/** How many operators sound for complexity 0 … 1 (½ keeps the tonality's own). */
export const targetOperators = (complexity: number) => Math.round(2 + 4 * complexity)

/** Pure (0) … dense (1). Below ½ operators fall silent, the least important first, but each pinned tonality keeps an
 *  FM pair of its own (`owned`: per tonality, the operators it made or changed); above, silent operators come in as
 *  extra carriers and gentle modulators at whole ratios, and the stacks get a little deeper. */
export function applyComplexity(v: Voice, complexity: number, rng: Rng, owned: readonly (readonly number[])[] = []) {
  if (complexity === 0.5) return
  const { carriers, algorithm } = rolesOf(v)
  const sounding = () => [1, 2, 3, 4, 5, 6].filter((op) => level(v, op) > 0)
  const target = targetOperators(complexity)
  // a noise source and the carrier it feeds are the noise, not the tonality: they stay, and the count is of the rest
  // (otherwise a voice with a little noise, made pure, was nothing but noise)
  const noise = noiseSource(v)
  const kept = noise === null ? [] : [noise, ...carriers.filter((c) => algorithm.modulators[c].includes(noise))]
  const own = () => sounding().filter((op) => !kept.includes(op))
  if (complexity < 0.5) {
    // importance: the loudest carrier, then what modulates it (deepest first, down its stack), then the next carrier
    // and its stack
    const order: number[] = []
    const visit = (op: number) => {
      if (order.includes(op) || kept.includes(op) || level(v, op) === 0) return
      order.push(op)
      for (const m of [...algorithm.modulators[op]].sort((x, y) => level(v, y) - level(v, x))) visit(m)
    }
    for (const c of [...carriers].sort((x, y) => level(v, y) - level(v, x))) visit(c)
    // every pinned tonality keeps one FM pair of its own operators, so a pure mix is still the mix: its most
    // important operator, with the strongest modulator it has (a carrier) or the operator it modulates (a modulator)
    const keep = new Set<number>()
    for (const group of owned) {
      const top = order.find((op) => group.includes(op))
      if (top === undefined) continue
      keep.add(top)
      const partner = carriers.includes(top)
        ? order.find((m) => algorithm.modulators[top].includes(m))
        : order.find((t) => algorithm.modulators[t].includes(top))
      if (partner !== undefined) keep.add(partner)
    }
    // then by importance up to the count (pure: one pair, when nothing else asked for more)
    for (const op of order) if (keep.size < Math.max(2, target)) keep.add(op)
    for (const op of order) if (!keep.has(op)) setLevel(v, op, 0)
    return
  }
  const depth = (complexity - 0.5) * 2
  // the top half is about intensity, not only count: modulation deepens a lot, the brightness stops dying away,
  // and near the top the added operators come in strong and inharmonic, with more feedback
  const intense = Math.max(0, depth - 0.5) * 2
  for (const op of sounding()) {
    if (carriers.includes(op) || op === noise) continue
    // a quiet modulator further (the curve is flat below ~60), a deep one less
    setLevel(v, op, level(v, op) + 5 * depth + intense * (10 + Math.max(0, 72 - level(v, op)) * 0.5))
    // the envelope holds the brightness instead of fading it out
    const b = opBase(op)
    v[b + OP.level2] = clamp99(v[b + OP.level2] + (v[b + OP.level1] - v[b + OP.level2]) * intense)
    v[b + OP.level3] = clamp99(v[b + OP.level3] + (v[b + OP.level1] - v[b + OP.level3]) * intense)
  }
  if (v[VC.feedback] && !hasNoiseSource(v)) setVc(v, 'feedback', v[VC.feedback] + Math.round(3 * intense))
  // silent carriers first (an octave or a unison against the main one, quieter), then silent modulators where
  // what they modulate sounds
  const main = carriers.find((op) => level(v, op) > 0 && !kept.includes(op)) ?? carriers.find((op) => level(v, op) > 0)!
  for (const op of carriers) {
    if (own().length >= target) break
    if (level(v, op) > 0) continue
    setRatio(v, op, (opRatio(v, main) ?? 1) * rng.pick([1, 2, 0.5]))
    setOp(v, op, 'detune', 7 + rng.pick([-3, 3]))
    setLevel(v, op, 72 + 8 * depth)
    v.copyWithin(opBase(op) + OP.rate1, opBase(main) + OP.rate1, opBase(main) + OP.rate1 + 8)
  }
  const feeds = (m: number) => [1, 2, 3, 4, 5, 6].some((c) => algorithm.modulators[c].includes(m) && level(v, c) > 0)
  for (const op of [1, 2, 3, 4, 5, 6]) {
    if (own().length >= target) break
    if (level(v, op) > 0 || carriers.includes(op) || !feeds(op)) continue
    setRatio(v, op, rng.chance(intense) ? rng.pick([1.41, 2.62, 3.5, 5.19, 7.07, 9.33]) : rng.pick([1, 2, 3, 4]))
    setLevel(v, op, 45 + 20 * depth + 20 * intense)
    // its envelope from the operator it feeds
    const into = [1, 2, 3, 4, 5, 6].find((c) => algorithm.modulators[c].includes(op))!
    v.copyWithin(opBase(op) + OP.rate1, opBase(into) + OP.rate1, opBase(into) + OP.rate1 + 8)
  }
}

/** Still (0) … alive (1): vibrato, detune shimmer between the carriers, the modulators drifting while the note is
 *  held, and a slow LFO on the brightness. */
export function applyMotion(v: Voice, m: number, rng: Rng) {
  if (!m) return
  const { carriers, modulators } = rolesOf(v)
  // up to ½ alive in the usual way; above, it goes further: fast deep vibrato, tremolo, random steps or a square
  // wobble, the timbre swaying with the LFO, a slow pitch drift, carriers far apart
  const gentle = Math.min(1, m * 2)
  const wild = Math.max(0, m - 0.5) * 2
  setVc(v, 'lfoWave', wild > 0.5 && rng.chance(wild) ? rng.pick([5, 3, 1]) : rng.pick([0, 4]))
  setVc(v, 'lfoSpeed', 28 + 8 * gentle + 34 * wild)
  setVc(v, 'lfoDelay', wild > 0.3 ? 0 : Math.min(v[VC.lfoDelay] || 99, 60))
  setVc(v, 'lfoPitchDepth', Math.max(v[VC.lfoPitchDepth], 3 + 6 * gentle + 40 * wild))
  setVc(v, 'pitchModSens', Math.max(v[VC.pitchModSens], 3 + Math.round(2 * wild)))
  setVc(v, 'lfoAmpDepth', Math.round(25 * gentle + 60 * wild))
  const sounding = carriers.filter((op) => level(v, op) > 0)
  sounding.forEach((op, i) => { if (sounding.length > 1) setOp(v, op, 'detune', 7 + (i % 2 ? 1 : -1) * Math.round(1 + 2 * gentle + 4 * wild)) })
  const noise = noiseSource(v)
  modulators.filter((op) => level(v, op) > 0 && op !== noise).forEach((op, k) => {
    const b = opBase(op)
    setOp(v, op, 'ampModSens', wild > 0.3 ? 3 : m > 0.25 ? 2 : 1)
    // later stages slow and apart: fading out, or growing in
    v[b + OP.rate3] = clamp99(Math.min(v[b + OP.rate3], 60) - 6 * gentle * (k + 1) - 10 * wild)
    const swing = 0.3 * gentle + 0.4 * wild
    const [lo, hi] = rng.chance(0.5) ? [1 - swing, 1] : [1, 1 - swing]
    v[b + OP.level2] = clamp99(v[b + OP.level1] * lo)
    v[b + OP.level3] = clamp99(v[b + OP.level1] * hi)
  })
  // a slow pitch drift over seconds, a little under then over, settling on the note (no glide on release)
  if (wild > 0.4 && v[VC.pitchLevel1] === 50) v.set([25, 20, 18, 99, Math.round(50 - 2 * wild), Math.round(50 + 3 * wild), 50, 50], VC.pitchRate1)
}

/** Transpose (24 = none) and timbre per register. */
const REGISTER_TRANSPOSE: Record<Register, number> = { sub: -24, bass: -12, mid: 0, lead: 12, high: 24 }

export function applyRegister(v: Voice, r: Register | null) {
  if (!r) return
  setVc(v, 'transpose', 24 + REGISTER_TRANSPOSE[r])
  const { modulators } = rolesOf(v)
  const mods = modulators.filter((op) => level(v, op) > 0 && op !== noiseSource(v))
  // sub: purer, so it stays a weight under the music; bass: a little brighter for presence; high: tamer and
  // darker up the keys, so it doesn't turn shrill
  const shift = { sub: -10, bass: 3, mid: 0, lead: 2, high: -6 }[r]
  for (const op of mods) setLevel(v, op, level(v, op) + shift)
  if (r === 'high' || r === 'lead') for (const op of mods) {
    setOp(v, op, 'breakPoint', 39)
    setOp(v, op, 'rightDepth', r === 'high' ? 40 : 20)
    setOp(v, op, 'rightCurve', 0)
  }
  if (r === 'sub') for (const op of mods) { const ratio = opRatio(v, op); if (ratio !== null && ratio > 8) setLevel(v, op, level(v, op) - 15) }
}

/** Velocity: on the modulators (brightness, the FM touch) and less on the carriers (loudness). */
export function applyVelocity(v: Voice, x: number) {
  if (!x) return
  const { carriers, modulators } = rolesOf(v)
  for (const op of modulators) setOp(v, op, 'velocitySens', Math.max(getOp(v, op, 'velocitySens'), Math.round(2 + 5 * x)))
  for (const op of carriers) setOp(v, op, 'velocitySens', Math.max(getOp(v, op, 'velocitySens'), Math.round(1 + 2 * x)))
}
