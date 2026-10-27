// The generator (PLAN §4.4): (choices, seed) → voice, pure and deterministic. The heaviest pin builds the skeleton,
// the other pins take free branches or act as transforms, then the shape and the controls, then loudness and a name.
import { ALGORITHMS, algorithmOf } from '../dx7/algorithms'
import { getOp, initVoice, OP, opBase, setOp, setVc, setVoiceName, VC, type Voice } from '../dx7/voice'
import { opRatio, setRatio } from '../dx7/frequency'
import { MODELS, type Model } from '../engine/models'
import { mixOf, type GeneratorChoices, type MixPart, type Tonality } from './choices'
import { varyVoice } from './explore'
import { applyBrightness, applyComplexity, applyIntensity, applyMotion, applyRegister, applyVelocity, byImportance, complexityResponse } from './controls'
import { normalizeLoudness, SILENT_DB } from './loudness'
import { nameVoice, nameWithNoun } from './naming'
import { rng as makeRng, type Rng } from './random'
import { applyLength, applyPitchBlip, applyShape, clamp99, makeTransient, rolesOf, setEg, type Eg } from './shapes'
import { INSTRUMENTS, variantOf, type Instrument, type InstrumentId } from './instruments'
import { applyOpSpec, choose, fastOps, hasNoiseSource, makeNoise, noiseDb, noiseHostOp, noiseOps, noiseSource as noiseSourceOp, TONALITY_DEFS, useNoiseHost, within, type Skeleton } from './tonalities'

export interface GenerateOptions {
  seed: number
  model?: Model
  /** 0 typical (near the templates' middle) … 1 wild (anywhere in their ranges) */
  wild?: number
  /** Variation, 0 … 1: the voice's details moved a little (explore.ts) */
  vary?: number
  /** the voice's name when not naming it (naming renders the voice once more: skipped while a control is dragged) */
  keepName?: string
}

export interface Generated {
  voice: Voice
  /** the tonalities as read from the pins, heaviest first */
  mix: MixPart[]
  /** how each secondary tonality came in */
  roles: { tonality: Tonality; as: 'skeleton' | 'branch' | 'graft' | 'transform' }[]
  /** loudness of the loudest 20 ms at C4, dB */
  loudness: number
  /** which tonality each sounding operator belongs to (1–6), for drawing */
  opTonality: Partial<Record<number, Tonality>>
  /** the instrument it was started from, if any (the base in place of the heaviest pin) */
  instrument: InstrumentId | null
}

/** How far a voice strays from its template at wild 0 and 1. */
const spreadOf = (wild: number) => 0.3 + 0.7 * Math.max(0, Math.min(1, wild))
/** A secondary needs this share of the dominant's weight to get a branch of its own. */
const BRANCH_SHARE = 0.25
/** Up to this share a tonality that can be grafted (a GraftSpec) goes into the base's tone instead. */
const GRAFT_UNTIL = 0.6

export function generate(c: GeneratorChoices, { seed, model = 'fm2', wild = 0, vary = 0, keepName }: GenerateOptions): Generated {
  const rng = makeRng(seed)
  const spread = spreadOf(wild)
  const mix = mixOf(c.pins)
  const inst = c.instrument ? variantOf(INSTRUMENTS[c.instrument], rng, c.variant) : null
  // the base: an instrument (then every pin is a colour on it), else the heaviest pin, else a tonality picked by the
  // seed
  if (!inst && !mix.length) mix.push({ tonality: rng.pick(Object.keys(TONALITY_DEFS) as Tonality[]), weight: 1, intensity: 0.5 })
  const [dominant, ...rest] = inst ? [{ tonality: inst.family, weight: 1, intensity: 0.5 }, ...mix] : mix
  const skeleton: Skeleton = inst ? inst.skeleton : TONALITY_DEFS[dominant.tonality].skeleton
  const roles: Generated['roles'] = [{ tonality: dominant.tonality, as: 'skeleton' }]
  const opTonality: Generated['opTonality'] = {}

  // 1. the skeleton; the pin's distance from the centre deepens or softens its modulation
  const v = buildSkeleton(skeleton, rng, spread)
  const shape = c.shape ?? skeleton.shape
  if (inst?.eg && !c.shape) applyEgs(v, inst.eg, rng, spread)
  else applyShape(v, shape, rng, spread)
  for (const op of fastOps(skeleton.ops)) makeTransient(v, op)
  for (const op of noiseOps(skeleton.ops)) makeNoise(v, op, carrierRelease(v))
  // a tonality's own pitch fall comes now and then, more often the wilder (the Pitch accent switch: always)
  if (skeleton.pitchBlip && rng.chance(0.25 + 0.5 * Math.max(0, Math.min(1, wild)))) applyPitchBlip(v, skeleton.pitchBlip)
  if (inst) applyInstrument(v, inst, !c.shape, rng, spread)
  else applyIntensity(v, dominant.intensity)

  // 2. the other tonalities: a free branch while there is one; from BRANCH_SHARE without one, the pin takes over the
  // base's least important pair (another algorithm if it needs one); else a transform. Each tonality's own operators
  // are noted (the skeleton's, a branch's two, the ones a transform changed), so pure can keep a pair of each
  const owned: number[][] = [[1, 2, 3, 4, 5, 6].filter((op) => getOp(v, op, 'outputLevel') > 0)]
  const freeBranches = [...(skeleton.branches ?? [])]
  for (const part of rest) {
    // on an instrument a pin's weight is its share outright (an instrument has no weight of its own)
    const share = inst ? Math.min(1, part.weight) : part.weight / dominant.weight
    // a noise branch needs the pair whose modulator can be the noise source
    const fits = (br: readonly [number, number]) => !TONALITY_DEFS[part.tonality].branch.modulator.noise || br[1] === noiseHostOp(v)
    const free = freeBranches.findIndex(fits)
    // a graft first while the pin is lighter than GRAFT_UNTIL (a hybrid); heavier, a voice of its own, and a graft
    // only when there's no pair for one
    const takenOps = Object.keys(opTonality).map(Number)
    const until = TONALITY_DEFS[part.tonality].graft?.until ?? GRAFT_UNTIL
    const room = free >= 0 || (share >= until && takeOver(Uint8Array.from(v), TONALITY_DEFS[part.tonality].branch.modulator.noise === true, takenOps))
    const grafted = share >= BRANCH_SHARE && (share < until || !room) ? graft(v, part, share, takenOps, rng) : null
    if (grafted) {
      // the operators as renumbered: who owns which, and no free pair is sure to be one any more
      const { ops, perm } = grafted
      const was = { ...opTonality }
      for (const k of Object.keys(opTonality)) delete opTonality[Number(k) as 1]
      for (const [k, t] of Object.entries(was)) if (!ops.includes(perm[Number(k)])) opTonality[perm[Number(k)] as 1] = t
      owned.forEach((group, i) => { owned[i] = group.map((op) => perm[op]).filter((op) => !ops.includes(op)) })
      if (perm.some((to, from) => from > 0 && to !== from) || ops.some((op) => freeBranches.some((br) => br.includes(op)))) freeBranches.length = 0
      for (const op of ops) opTonality[op as 1] = part.tonality
      owned.push(ops)
      roles.push({ tonality: part.tonality, as: 'graft' })
      continue
    }
    let branch = share >= BRANCH_SHARE && free >= 0 ? freeBranches.splice(free, 1)[0] : null
    const taken = !branch && share >= BRANCH_SHARE ? takeOver(v, TONALITY_DEFS[part.tonality].branch.modulator.noise === true, Object.keys(opTonality).map(Number)) : null
    if (taken) {
      if (taken.algorithm !== v[VC.algorithm]) freeBranches.length = 0
      const fbBefore = algorithmOf(v[VC.algorithm]).feedback.to
      setVc(v, 'algorithm', taken.algorithm)
      // the feedback stays with the operator that had it; on one of the base's that hadn't, none
      const fbNow = algorithmOf(v[VC.algorithm]).feedback.to
      if (fbNow !== fbBefore && !taken.branch.includes(fbNow)) setVc(v, 'feedback', 0)
      // the two start afresh: nothing of the base's settings (fixed frequency, scaling, sensitivities) stays
      const init = initVoice()
      for (const op of taken.branch) v.set(init.subarray(opBase(op), opBase(op) + 21), opBase(op))
      owned[0] = owned[0].filter((op) => !taken.branch.includes(op))
      branch = taken.branch
    }
    if (branch) {
      fillBranch(v, branch, part, share, shape, rng, spread)
      for (const op of branch) opTonality[op] = part.tonality
      owned.push([...branch])
      roles.push({ tonality: part.tonality, as: 'branch' })
    } else {
      const before = Uint8Array.from(v)
      TONALITY_DEFS[part.tonality].transform(v, colourAmount(part, share), rng)
      owned.push([1, 2, 3, 4, 5, 6].filter((op) => getOp(v, op, 'outputLevel') > 0 && v.subarray(opBase(op), opBase(op) + 21).some((b, i) => b !== before[opBase(op) + i])))
      roles.push({ tonality: part.tonality, as: 'transform' })
    }
  }

  // off the usual paths, from half way to Wild up
  goWild(v, wild, rng)

  // 3. the controls
  applyLength(v, c.length)
  applyBrightness(v, c.brightness)
  // a pair per pin (a pin between two tonalities is one pin), the heaviest tonalities first
  applyComplexity(v, complexityResponse(c.complexity), rng, owned.slice(0, Math.max(1, c.pins.length)))
  applyMotion(v, c.motion, rng)
  applyRegister(v, c.register)
  if (MODELS[model].fixedVelocity === null) applyVelocity(v, c.velocity)
  if (c.pitchAccent) applyPitchBlip(v)
  // a sibling of the voice: its details moved (Variation)
  varyVoice(v, rng, vary)

  // 4. audible, and as loud as the others
  ensureAudible(v)
  let db = normalizeLoudness(v)
  if (db < SILENT_DB) { rescue(v); db = normalizeLoudness(v) }
  // named by how it sounds, not by its pins (docs/SOUND.md)
  // an instrument names its voices; coloured by pins, with the sound's most striking trait in front
  setVoiceName(v, keepName ?? (inst ? (c.pins.length ? nameWithNoun(v, inst.label) : inst.label) : nameVoice(v)))
  for (let op = 1; op <= 6; op++) if (getOp(v, op, 'outputLevel') > 0) opTonality[op] ??= dominant.tonality
  return { voice: v, mix, roles, loudness: db, opTonality, instrument: c.instrument ?? null }
}

/** The top half of Wild leaves the textbook: modulators at unusual ratios (whole, odd and inharmonic), other feedback,
 *  carriers detuned; near the top, now and then another algorithm altogether (the operators keep their settings in
 *  new roles). A noise source stays as it is: it only works where it is. In place. */
function goWild(v: Voice, wild: number, rng: Rng) {
  const w = Math.max(0, Math.min(1, wild) - 0.5) * 2
  if (!w) return
  if (!hasNoiseSource(v) && rng.chance(Math.max(0, w - 0.4) * 0.8)) setVc(v, 'algorithm', rng.int(0, 31))
  const { modulators, carriers } = rolesOf(v)
  const noise = noiseSourceOp(v)
  for (const op of modulators) {
    if (op === noise || getOp(v, op, 'outputLevel') === 0 || !rng.chance(0.25 + 0.6 * w)) continue
    setRatio(v, op, rng.pick([0.5, 1, 2, 3, 5, 7, 9, 11, 13, 1.41, 1.73, 2.62, 3.14, 4.24, 5.19, 7.07, 9.33]))
    setOp(v, op, 'outputLevel', getOp(v, op, 'outputLevel') + rng.int(-8, 12))
  }
  for (const op of carriers) if (rng.chance(0.5 * w)) setOp(v, op, 'detune', rng.int(0, 14))
  if (!hasNoiseSource(v) && rng.chance(0.6 * w)) setVc(v, 'feedback', rng.int(0, 7))
}

/** The dominant tonality's operators, algorithm, feedback and vibrato on top of INIT VOICE. */
function buildSkeleton(s: Skeleton, rng: Rng, spread: number): Voice {
  const v = initVoice()
  setVc(v, 'algorithm', choose(s.algorithms, rng, spread) - 1)
  for (let op = 1; op <= 6; op++) {
    const spec = s.ops[op as 1]
    if (spec) applyOpSpec(v, op, spec, rng, spread)
    else setOp(v, op, 'outputLevel', 0)
  }
  setVc(v, 'feedback', s.feedback === undefined ? 0 : within(s.feedback, rng, spread))
  if (s.vibrato) {
    setVc(v, 'lfoSpeed', s.vibrato[0])
    setVc(v, 'lfoDelay', s.vibrato[1])
    setVc(v, 'lfoPitchDepth', s.vibrato[2])
    setVc(v, 'pitchModSens', 3)
  } else {
    setVc(v, 'lfoPitchDepth', 0)
  }
  return v
}

/** An instrument's own envelopes, by role, the rates a little apart. In place. */
function applyEgs(v: Voice, egs: NonNullable<Instrument['eg']>, rng: Rng, spread: number) {
  const { carriers } = rolesOf(v)
  for (let op = 1; op <= 6; op++) {
    const e = carriers.includes(op) ? egs.carrier : egs.modulator
    setEg(v, op, { rates: e.rates.map((r) => (r === 99 ? r : r + Math.round((rng.next() - 0.5) * 4 * spread))) as unknown as Eg['rates'], levels: e.levels })
  }
}

/** What an instrument needs beyond its skeleton: register, keyboard scaling, tremolo, a drum's pitch drop, an
 *  accent. In place. */
function applyInstrument(v: Voice, inst: Instrument, ownEgs: boolean, rng: Rng, spread: number) {
  if (inst.transpose) setVc(v, 'transpose', 24 + inst.transpose)
  const { carriers, modulators } = rolesOf(v)
  if (inst.rateScaling) for (let op = 1; op <= 6; op++) setOp(v, op, 'rateScaling', inst.rateScaling)
  if (inst.treble) for (const op of modulators) {
    // right of C3: −lin (darker up the keys) or +lin (brighter)
    setOp(v, op, 'breakPoint', 39)
    setOp(v, op, 'rightDepth', Math.round(Math.abs(inst.treble) * 60))
    setOp(v, op, 'rightCurve', inst.treble < 0 ? 0 : 3)
  }
  if (inst.tremolo) {
    setVc(v, 'lfoSpeed', inst.tremolo[0])
    setVc(v, 'lfoAmpDepth', inst.tremolo[1])
    setVc(v, 'lfoWave', 0)
    setVc(v, 'lfoDelay', 0)
    for (const op of carriers) setOp(v, op, 'ampModSens', 1)
  }
  if (inst.pitchDrop) {
    // the pitch jumps up at once and falls to the note; it starts and ends on the note, so a release doesn't glide
    const [level, rate] = inst.pitchDrop
    v.set([99, rate, 99, 99, level, 50, 50, 50], VC.pitchRate1)
  }
  if (inst.lfo) {
    const [speed, delay, pitchDepth, ampDepth, wave, pitchSens] = inst.lfo
    Object.entries({ lfoSpeed: speed, lfoDelay: delay, lfoPitchDepth: pitchDepth, lfoAmpDepth: ampDepth, lfoWave: wave, pitchModSens: pitchSens })
      .forEach(([k, x]) => setVc(v, k as 'lfoSpeed', x))
  }
  if (inst.keySync === false) setVc(v, 'oscKeySync', 0)
  if (inst.pitchEg) v.set([...inst.pitchEg.rates, ...inst.pitchEg.levels], VC.pitchRate1)
  if (inst.accent) applyPitchBlip(v, inst.accent)
  for (const [key, d] of Object.entries(inst.ops ?? {})) {
    const op = Number(key)
    // the original's envelope; the rates move apart only as Wild goes up, up to 4 steps
    if (d.eg && ownEgs) setEg(v, op, { rates: d.eg.rates.map((r) => (r === 99 ? r : r + Math.round((rng.next() - 0.5) * 8 * (spread - 0.3) / 0.7))) as unknown as Eg['rates'], levels: d.eg.levels })
    if (d.rateScaling !== undefined) setOp(v, op, 'rateScaling', d.rateScaling)
    if (d.ams !== undefined) setOp(v, op, 'ampModSens', d.ams)
    if (d.scaling) {
      const [breakPoint, leftDepth, rightDepth, leftCurve, rightCurve] = d.scaling
      Object.entries({ breakPoint, leftDepth, rightDepth, leftCurve, rightCurve }).forEach(([k, x]) => setOp(v, op, k as 'breakPoint', x))
    }
  }
}

/** Where a graft goes: one operator (two for noise: the source above the modulator) into the base's main carrier,
 *  in some algorithm and some numbering of the base's operators (`perm`, old → new; the DX7 ties each operator's
 *  place to its number) where every other sounding operator keeps its place and the base its feedback. Free (silent)
 *  operators first; short of them, the least important give way, never the base's main pair, its noise source or
 *  an earlier pin's operators (`taken`). The fewest operators moved, the base's algorithm if it can. `ops`: the one
 *  into the carrier first, numbered as after. */
function graftSpot(v: Voice, noise: boolean, taken: readonly number[]): { algorithm: number; perm: number[]; ops: number[] } | null {
  const now = algorithmOf(v[VC.algorithm])
  const all = [1, 2, 3, 4, 5, 6]
  const sounding = all.filter((op) => getOp(v, op, 'outputLevel') > 0)
  const source = noiseSourceOp(v)
  if (noise && source !== null) return null
  const order = byImportance(v)
  const main = order.find((op) => now.carriers.includes(op) && !taken.includes(op) && op !== source)
  if (main === undefined) return null
  const protect = [...taken, main, ...byImportance(v, taken).slice(0, 2)]
  if (source !== null) protect.push(source, ...now.carriers.filter((c) => now.modulators[c].includes(source)))
  const need = Math.max(0, (noise ? 2 : 1) - (6 - sounding.length))
  // which of the base's operators give way: every choice of `need` of the unprotected, the least important best
  const spare = order.filter((op) => !protect.includes(op))
  const gives: number[][] = need === 0 ? [[]] : need === 1 ? spare.map((op) => [op]) : spare.flatMap((op, i) => spare.slice(i + 1).map((o) => [op, o]))
  const rank = (op: number) => order.indexOf(op)
  const fb = now.feedback
  const feeds = (a: typeof now, op: number) => all.filter((x) => a.modulators[x].includes(op))
  let best: { algorithm: number; perm: number[]; ops: number[]; score: number } | null = null
  const m: number[] = []
  const tryAlgorithm = (a: typeof now, give: number[]) => {
    const kept = sounding.filter((op) => !give.includes(op))
    const keepFb = v[VC.feedback] > 0 && kept.includes(fb.to) && kept.includes(fb.from)
    // the base's operators to slots, one by one, each keeping its role against the ones placed before it
    const place = (i: number) => {
      if (i < kept.length) {
        for (const slot of all) {
          if (kept.slice(0, i).some((k) => m[k] === slot)) continue
          const k = kept[i]
          m[k] = slot
          const ok = a.carriers.includes(slot) === now.carriers.includes(k) && kept.slice(0, i + 1).every((j) =>
            kept.slice(0, i + 1).every((l) => a.modulators[m[j]].includes(m[l]) === now.modulators[j].includes(l)))
          if (ok) place(i + 1)
        }
        return
      }
      if (keepFb && (a.feedback.from !== m[fb.from] || a.feedback.to !== m[fb.to])) return
      const used = kept.map((k) => m[k])
      const free = all.filter((slot) => !used.includes(slot))
      const into = m[main]
      for (const y of free) {
        if (a.carriers.includes(y) || feeds(a, y).join() !== String(into)) continue
        let ops = [y]
        if (noise) {
          const x = a.modulators[y].length === 1 ? a.modulators[y][0] : 0
          if (!free.includes(x) || x === y || a.feedback.from !== x || a.feedback.to !== x || feeds(a, x).join() !== String(y)) continue
          ops = [y, x]
        } else if (a.modulators[y].some((z) => z !== y)) continue
        // the rest of the base's old numbers into the slots left, in order
        const perm = [0, ...all.map(() => 0)]
        for (const k of kept) perm[k] = m[k]
        const rest = all.filter((op) => !kept.includes(op))
        const left = free.filter((slot) => !ops.includes(slot))
        rest.forEach((op, i) => { perm[op] = i < left.length ? left[i] : ops[i - left.length] })
        const moved = kept.filter((k) => m[k] !== k).length
        const score = 2 * give.reduce((sum, op) => sum + rank(op), 0) - moved - (a === now ? 0 : 0.5)
        if (!best || score > best.score) best = { algorithm: a.number - 1, perm, ops, score }
      }
    }
    place(0)
  }
  for (const give of gives) for (const a of ALGORITHMS) tryAlgorithm(a, give)
  const found = best as { algorithm: number; perm: number[]; ops: number[] } | null
  return found && { algorithm: found.algorithm, perm: found.perm, ops: found.ops }
}

/** A tonality grafted into the base (graftSpot): its modulator in the main carrier at its ratio to it, as deep as
 *  the share (and ±16 by radius, as a branch), with the carrier's envelope; a noise source above it for noise. The
 *  base's operators may be renumbered: the numbering, old → new, is returned with the graft's operators, or null
 *  when there is no place. In place. */
function graft(v: Voice, part: MixPart, share: number, taken: readonly number[], rng: Rng): { ops: number[]; perm: number[] } | null {
  const spec = TONALITY_DEFS[part.tonality].graft
  if (!spec) return null
  const spot = graftSpot(v, !!spec.noise, taken)
  if (!spot) return null
  const before = Uint8Array.from(v)
  const fbBefore = spot.perm[algorithmOf(v[VC.algorithm]).feedback.to]
  for (let op = 1; op <= 6; op++) v.set(before.subarray(opBase(op), opBase(op) + 21), opBase(spot.perm[op]))
  setVc(v, 'algorithm', spot.algorithm)
  if (!spec.noise && algorithmOf(v[VC.algorithm]).feedback.to !== fbBefore) setVc(v, 'feedback', 0)
  const init = initVoice()
  for (const op of spot.ops) v.set(init.subarray(opBase(op), opBase(op) + 21), opBase(op))
  const [mod, source] = spot.ops
  const target = [1, 2, 3, 4, 5, 6].find((c) => algorithmOf(v[VC.algorithm]).modulators[c].includes(mod))!
  setRatio(v, mod, (opRatio(v, target) ?? 1) * rng.pick(spec.ratio))
  // over the graft's own stretch of the weight, BRANCH_SHARE … GRAFT_UNTIL (heavier only where nothing else fits)
  const t = Math.max(0, Math.min(1, (share - BRANCH_SHARE) / ((spec.until ?? GRAFT_UNTIL) - BRANCH_SHARE)))
  const x = (Math.max(0, Math.min(1, part.intensity)) - 0.5) * 2
  setOp(v, mod, 'outputLevel', clamp99(spec.level[0] + (spec.level[1] - spec.level[0]) * t + 16 * x))
  v.set(v.subarray(opBase(target) + OP.rate1, opBase(target) + OP.rate1 + 8), opBase(mod) + OP.rate1)
  if (spec.fast) makeTransient(v, mod)
  if (spec.velocity) setOp(v, mod, 'velocitySens', spec.velocity)
  if (source) {
    setRatio(v, source, rng.pick([7.07, 3.5]))
    setVc(v, 'feedback', 7)
    makeNoise(v, source, carrierRelease(v))
  }
  return { ops: spot.ops, perm: spot.perm }
}

/** A pair of the base's operators a pin can take over when no free branch fits: the least important two (silent
 *  ones first) that some algorithm makes a stack of their own (modulator → carrier, nothing else in or out), while
 *  every other sounding operator keeps its place and the base its feedback. For a noise pin the modulator must be
 *  the feedback operator. The base keeps its most important pair, a noise source of its own, and earlier pins'
 *  branches (`taken`). Null when no algorithm fits: the pin colours instead. */
function takeOver(v: Voice, noise: boolean, taken: readonly number[]): { algorithm: number; branch: [number, number] } | null {
  const now = algorithmOf(v[VC.algorithm])
  const sounding = (op: number) => getOp(v, op, 'outputLevel') > 0
  const source = noiseSourceOp(v)
  if (noise && source !== null) return null
  const protect = [...taken, ...byImportance(v, taken).slice(0, 2)]
  if (source !== null) protect.push(source, ...now.carriers.filter((c) => now.modulators[c].includes(source)))
  const order = byImportance(v)
  const rank = (op: number) => (sounding(op) ? order.indexOf(op) : 9)
  const roles = (a: typeof now, op: number, kept: number[]) => `${a.carriers.includes(op)}:${a.modulators[op].filter((m) => kept.includes(m)).join()}`
  let best: { algorithm: number; branch: [number, number]; score: number } | null = null
  for (const a of ALGORITHMS) for (let c = 1; c <= 6; c++) for (let m = 1; m <= 6; m++) {
    if (c === m || protect.includes(c) || protect.includes(m)) continue
    // a stack of their own
    if (!a.carriers.includes(c) || a.modulators[c].join() !== String(m) || a.modulators[m].some((x) => x !== m)) continue
    if ([1, 2, 3, 4, 5, 6].some((x) => x !== c && a.modulators[x].includes(m))) continue
    if (noise && (a.feedback.from !== m || a.feedback.to !== m)) continue
    // the rest as it was
    const kept = [1, 2, 3, 4, 5, 6].filter((x) => x !== c && x !== m && sounding(x))
    if (kept.some((x) => roles(a, x, kept) !== roles(now, x, kept))) continue
    const fb = now.feedback
    if (!noise && v[VC.feedback] > 0 && kept.includes(fb.to) && (a.feedback.from !== fb.from || a.feedback.to !== fb.to)) continue
    const score = rank(c) + rank(m) + (a === now ? 0.5 : 0)
    if (!best || score > best.score) best = { algorithm: a.number - 1, branch: [c, m], score }
  }
  return best && { algorithm: best.algorithm, branch: best.branch }
}

/** How far a pin colours the voice as a transform, 0 … 1: its share by the square root (a light pin is heard, an
 *  equal one goes far) times its radius around the middle (a quarter at the centre, 1¾ at the rim). Before, share ×
 *  0.4–1: a pin up to a quarter of the base's weight moved the sound less than a notch of Brightness
 *  (docs/SOUND.md). Noise keeps its own curve, set by ear on the volca. */
function colourAmount(part: MixPart, share: number): number {
  if (part.tonality === 'noise') return Math.min(1, share * (0.4 + 0.6 * part.intensity))
  return Math.min(1, Math.sqrt(Math.min(1, share)) * (0.25 + 1.5 * part.intensity))
}

/** A secondary tonality as a second voice in the dominant's free operators, as loud against the base as its share. */
function fillBranch(v: Voice, [carrier, modulator]: readonly [number, number], part: MixPart, share: number, shape: GeneratorChoices['shape'], rng: Rng, spread: number) {
  const b = TONALITY_DEFS[part.tonality].branch
  applyOpSpec(v, carrier, b.carrier, rng, spread)
  applyOpSpec(v, modulator, b.modulator, rng, spread)
  // a noise branch is far louder to the ear than a tone at the same level: its own, wider curve (noiseDb)
  if (b.modulator.noise) {
    setOp(v, carrier, 'outputLevel', clamp99(99 + Math.round(noiseDb(share * (0.4 + 0.6 * part.intensity)) / 0.75)))
  } else {
    // against the base's carriers together, not one of them: its power to theirs as share², so at equal weights
    // the two are equal (before, a full share was one carrier among the base's two or three, and the weight from a
    // quarter up hardly moved the sound). The branch gives way when quieter, the base when louder
    const power = (op: number) => 10 ** ((getOp(v, op, 'outputLevel') - 99) * 0.075)
    const base = rolesOf(v).carriers.filter((op) => op !== carrier && getOp(v, op, 'outputLevel') > 0)
    const db = 20 * Math.log10(Math.min(1, share)) + 10 * Math.log10(base.reduce((sum, op) => sum + power(op), 0) || 1) - 10 * Math.log10(power(carrier))
    if (db <= 0) setOp(v, carrier, 'outputLevel', clamp99(getOp(v, carrier, 'outputLevel') + Math.round(db / 0.75)))
    else for (const op of base) setOp(v, op, 'outputLevel', clamp99(getOp(v, op, 'outputLevel') - Math.round(db / 0.75)))
  }
  // its radius as the base's: ±16 levels on its modulator, mild to extreme
  setOp(v, modulator, 'outputLevel', clamp99(getOp(v, modulator, 'outputLevel') + 16 * (Math.max(0, Math.min(1, part.intensity)) - 0.5) * 2))
  // the branch plays its own tonality's envelope only when no shape was chosen
  const own = shape ?? TONALITY_DEFS[part.tonality].skeleton.shape
  const tmp = initVoice()
  tmp[VC.algorithm] = v[VC.algorithm]
  applyShape(tmp, own, rng, spread)
  for (const op of [carrier, modulator]) v.set(tmp.subarray(opBase(op), opBase(op) + 8), opBase(op))
  if (b.carrier.fast) makeTransient(v, carrier)
  if (b.modulator.fast) makeTransient(v, modulator)
  if (b.modulator.noise) { useNoiseHost(v); makeNoise(v, modulator, carrierRelease(v)) }
  // the feedback belongs to whoever has its operator
  const fbOp = algorithmOf(v[VC.algorithm]).feedback.to
  const fb = TONALITY_DEFS[part.tonality].skeleton.feedback
  if (fbOp === carrier || fbOp === modulator) setVc(v, 'feedback', fb === undefined ? 0 : within(fb, rng, spread))
}

/** The first sounding carrier's release rate. */
function carrierRelease(v: Voice): number {
  const op = rolesOf(v).carriers.find((c) => getOp(v, c, 'outputLevel') > 0) ?? 1
  return getOp(v, op, 'rate4')
}

/** Some carrier sounds: a level that's heard and an envelope that rises. In place. */
export function ensureAudible(v: Voice) {
  const { carriers } = rolesOf(v)
  const audible = (op: number) => {
    const b = opBase(op)
    return v[b + OP.outputLevel] >= 50 && Math.max(v[b + OP.level1], v[b + OP.level2], v[b + OP.level3]) >= 50
  }
  if (!carriers.some(audible)) {
    const op = carriers.reduce((a, x) => (getOp(v, x, 'outputLevel') > getOp(v, a, 'outputLevel') ? x : a), carriers[0])
    setOp(v, op, 'outputLevel', Math.max(getOp(v, op, 'outputLevel'), 90))
    const b = opBase(op)
    if (Math.max(v[b + OP.level1], v[b + OP.level2], v[b + OP.level3]) < 50) v[b + OP.level1] = 99
  }
}

/** When the engine still hears nothing: the first carrier at full level with a plain envelope. In place. */
function rescue(v: Voice) {
  const op = rolesOf(v).carriers[0]
  setOp(v, op, 'outputLevel', 99)
  v.set([99, 60, 40, 50, 99, 90, 85, 0], opBase(op))
}

/** Which algorithm and how it was built, for display. */
export const describe = (v: Voice) => {
  const alg = algorithmOf(v[VC.algorithm])
  return { algorithm: alg.number, carriers: alg.carriers, sounding: [1, 2, 3, 4, 5, 6].filter((op) => getOp(v, op, 'outputLevel') > 0) }
}
