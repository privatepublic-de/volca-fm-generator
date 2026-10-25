// The generator (PLAN §4.4): (choices, seed) → voice, pure and deterministic. The heaviest pin builds the skeleton,
// the other pins take free branches or act as transforms, then the shape and the controls, then loudness and a name.
import { algorithmOf } from '../dx7/algorithms'
import { getOp, initVoice, OP, opBase, setOp, setVc, setVoiceName, VC, type Voice } from '../dx7/voice'
import { MODELS, type Model } from '../engine/models'
import { mixOf, type GeneratorChoices, type MixPart, type Tonality } from './choices'
import { applyBrightness, applyComplexity, applyMotion, applyRegister, applyVelocity } from './controls'
import { normalizeLoudness, SILENT_DB } from './loudness'
import { rng as makeRng, type Rng } from './random'
import { applyLength, applyPitchBlip, applyShape, clamp99, makeTransient, rolesOf } from './shapes'
import { applyOpSpec, choose, fastOps, hasNoiseSource, makeNoise, noiseOps, TONALITY_DEFS, within } from './tonalities'

export interface GenerateOptions {
  seed: number
  model?: Model
  /** 0 typical (near the templates' middle) … 1 wild (anywhere in their ranges) */
  wild?: number
}

export interface Generated {
  voice: Voice
  /** the tonalities as read from the pins, heaviest first */
  mix: MixPart[]
  /** how each secondary tonality came in */
  roles: { tonality: Tonality; as: 'skeleton' | 'branch' | 'transform' }[]
  /** loudness of the loudest 20 ms at C4, dB */
  loudness: number
  /** which tonality each sounding operator belongs to (1–6), for drawing */
  opTonality: Partial<Record<number, Tonality>>
}

/** How far a voice strays from its template at wild 0 and 1. */
const spreadOf = (wild: number) => 0.3 + 0.7 * Math.max(0, Math.min(1, wild))
/** A secondary needs this share of the dominant's weight to get a branch of its own. */
const BRANCH_SHARE = 0.25

export function generate(c: GeneratorChoices, { seed, model = 'fm2', wild = 0 }: GenerateOptions): Generated {
  const rng = makeRng(seed)
  const spread = spreadOf(wild)
  const mix = mixOf(c.pins)
  // no pins: a tonality picked by the seed
  if (!mix.length) mix.push({ tonality: rng.pick(Object.keys(TONALITY_DEFS) as Tonality[]), weight: 1, intensity: 0.5 })
  const [dominant, ...rest] = mix
  const def = TONALITY_DEFS[dominant.tonality]
  const roles: Generated['roles'] = [{ tonality: dominant.tonality, as: 'skeleton' }]
  const opTonality: Generated['opTonality'] = {}

  // 1. the skeleton; intensity moves it from mild to extreme like brightness does
  const v = buildSkeleton(dominant.tonality, rng, spread)
  const shape = c.shape ?? def.skeleton.shape
  applyShape(v, shape, rng, spread)
  for (const op of fastOps(def.skeleton.ops)) makeTransient(v, op)
  for (const op of noiseOps(def.skeleton.ops)) makeNoise(v, op, carrierRelease(v))
  // a tonality's own pitch fall comes now and then, more often the wilder (the Pitch accent switch: always)
  if (def.skeleton.pitchBlip && rng.chance(0.25 + 0.5 * Math.max(0, Math.min(1, wild)))) applyPitchBlip(v, def.skeleton.pitchBlip)

  // 2. the other tonalities: a free branch while there is one (and complexity allows), else a transform
  const freeBranches = [...(def.skeleton.branches ?? [])]
  for (const part of rest) {
    const share = part.weight / dominant.weight
    if (share >= BRANCH_SHARE && c.complexity >= 0.35 && freeBranches.length) {
      const branch = freeBranches.shift()!
      fillBranch(v, branch, part, share, shape, rng, spread)
      for (const op of branch) opTonality[op] = part.tonality
      roles.push({ tonality: part.tonality, as: 'branch' })
    } else {
      TONALITY_DEFS[part.tonality].transform(v, Math.min(1, share * (0.4 + 0.6 * part.intensity)), rng)
      roles.push({ tonality: part.tonality, as: 'transform' })
    }
  }

  // 3. the controls
  applyLength(v, c.length)
  applyBrightness(v, Math.max(-1, Math.min(1, c.brightness + (dominant.intensity - 0.5) * 0.6)))
  applyComplexity(v, c.complexity, rng)
  applyMotion(v, c.motion, rng)
  applyRegister(v, c.register)
  if (MODELS[model].fixedVelocity === null) applyVelocity(v, c.velocity)
  if (c.pitchAccent) applyPitchBlip(v)

  // 4. audible, and as loud as the others
  ensureAudible(v)
  let db = normalizeLoudness(v)
  if (db < SILENT_DB) { rescue(v); db = normalizeLoudness(v) }
  setVoiceName(v, nameOf(mix, c))
  for (let op = 1; op <= 6; op++) if (getOp(v, op, 'outputLevel') > 0) opTonality[op] ??= dominant.tonality
  return { voice: v, mix, roles, loudness: db, opTonality }
}

/** The dominant tonality's operators, algorithm, feedback and vibrato on top of INIT VOICE. */
function buildSkeleton(t: Tonality, rng: Rng, spread: number): Voice {
  const s = TONALITY_DEFS[t].skeleton
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

/** A secondary tonality as a second voice in the dominant's free operators, as loud as its share (−6 dB at half). */
function fillBranch(v: Voice, [carrier, modulator]: readonly [number, number], part: MixPart, share: number, shape: GeneratorChoices['shape'], rng: Rng, spread: number) {
  const b = TONALITY_DEFS[part.tonality].branch
  applyOpSpec(v, carrier, b.carrier, rng, spread)
  applyOpSpec(v, modulator, b.modulator, rng, spread)
  const steps = Math.round((20 * Math.log10(Math.min(1, share))) / 0.75)
  setOp(v, carrier, 'outputLevel', clamp99(getOp(v, carrier, 'outputLevel') + steps))
  setOp(v, modulator, 'outputLevel', clamp99(getOp(v, modulator, 'outputLevel') - 8 * (1 - part.intensity)))
  // the branch plays its own tonality's envelope only when no shape was chosen
  const own = shape ?? TONALITY_DEFS[part.tonality].skeleton.shape
  const tmp = initVoice()
  tmp[VC.algorithm] = v[VC.algorithm]
  applyShape(tmp, own, rng, spread)
  for (const op of [carrier, modulator]) v.set(tmp.subarray(opBase(op), opBase(op) + 8), opBase(op))
  if (b.carrier.fast) makeTransient(v, carrier)
  if (b.modulator.fast) makeTransient(v, modulator)
  if (b.modulator.noise) makeNoise(v, modulator, carrierRelease(v))
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

// ---------- names: within the DX7's 10 characters ----------

const SHAPE_WORD: Partial<Record<NonNullable<GeneratorChoices['shape']>, string>> = { pad: 'Pad', pluck: 'Pluck', swell: 'Swell', reverse: 'Rev' }

export function nameOf(mix: readonly MixPart[], c: GeneratorChoices): string {
  const noun = TONALITY_DEFS[mix[0].tonality].noun
  const words = [
    ...mix.slice(1).map((p) => TONALITY_DEFS[p.tonality].adjective),
    ...(c.brightness <= -0.4 ? ['Soft', 'Dark'] : c.brightness >= 0.4 ? ['Bright'] : []),
    ...(c.shape && SHAPE_WORD[c.shape] ? [SHAPE_WORD[c.shape]!] : []),
    ...(c.register === 'sub' || c.register === 'bass' ? ['Bass'] : []),
  ]
  for (const w of words) if (w !== noun && `${w} ${noun}`.length <= 10) return `${w} ${noun}`
  return noun
}

// ---------- variations ----------

/** Small random changes, `amount` 0…1: levels and rates jitter, ratios rarely move. Name and algorithm stay. */
export function mutate(source: Voice, amount: number, seed: number): Voice {
  const v = Uint8Array.from(source)
  const rng = makeRng(seed)
  const a = Math.max(0, Math.min(1, amount))
  const jitter = (x: number, range: number) => clamp99(x + (rng.next() * 2 - 1) * a * range)
  const { carriers } = rolesOf(v)
  for (let op = 1; op <= 6; op++) {
    const b = opBase(op)
    if (v[b + OP.outputLevel] === 0) continue
    for (let i = 0; i < 4; i++) if (v[b + OP.rate1 + i] < 99 && rng.chance(0.5)) v[b + OP.rate1 + i] = jitter(v[b + OP.rate1 + i], 12)
    if (!carriers.includes(op)) v[b + OP.outputLevel] = jitter(v[b + OP.outputLevel], 10)
    if (rng.chance(a * 0.25) && !v[b + OP.oscMode]) v[b + OP.coarse] = Math.max(0, Math.min(31, v[b + OP.coarse] + rng.pick([-1, 1])))
    if (rng.chance(a * 0.5)) v[b + OP.detune] = Math.max(0, Math.min(14, v[b + OP.detune] + rng.pick([-1, 1])))
  }
  if (rng.chance(a * 0.5) && v[VC.feedback] && !hasNoiseSource(v)) setVc(v, 'feedback', v[VC.feedback] + rng.pick([-1, 1]))
  ensureAudible(v)
  if (normalizeLoudness(v) < SILENT_DB) { rescue(v); normalizeLoudness(v) }
  return v
}

/** Which algorithm and how it was built, for display. */
export const describe = (v: Voice) => {
  const alg = algorithmOf(v[VC.algorithm])
  return { algorithm: alg.number, carriers: alg.carriers, sounding: [1, 2, 3, 4, 5, 6].filter((op) => getOp(v, op, 'outputLevel') > 0) }
}
