// The generator (PLAN §4.4): (choices, seed) → voice, pure and deterministic. The heaviest pin builds the skeleton,
// the other pins take free branches or act as transforms, then the shape and the controls, then loudness and a name.
import { algorithmOf } from '../dx7/algorithms'
import { getOp, initVoice, OP, opBase, setOp, setVc, setVoiceName, VC, type Voice } from '../dx7/voice'
import { setRatio } from '../dx7/frequency'
import { MODELS, type Model } from '../engine/models'
import { mixOf, type GeneratorChoices, type MixPart, type Tonality } from './choices'
import { applyBrightness, applyComplexity, applyMotion, applyRegister, applyVelocity } from './controls'
import { normalizeLoudness, SILENT_DB } from './loudness'
import { nameVoice } from './naming'
import { rng as makeRng, type Rng } from './random'
import { applyLength, applyPitchBlip, applyShape, clamp99, makeTransient, rolesOf } from './shapes'
import { applyOpSpec, choose, fastOps, hasNoiseSource, makeNoise, noiseDb, noiseHostOp, noiseOps, noiseSource as noiseSourceOp, TONALITY_DEFS, useNoiseHost, within } from './tonalities'

export interface GenerateOptions {
  seed: number
  model?: Model
  /** 0 typical (near the templates' middle) … 1 wild (anywhere in their ranges) */
  wild?: number
  /** the voice's name when not naming it (naming renders the voice once more: skipped while a control is dragged) */
  keepName?: string
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

export function generate(c: GeneratorChoices, { seed, model = 'fm2', wild = 0, keepName }: GenerateOptions): Generated {
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

  // 2. the other tonalities: a free branch while there is one, else a transform. Each tonality's own operators are
  // noted (the skeleton's, a branch's two, the ones a transform changed), so pure can keep a pair of each
  const owned: number[][] = [[1, 2, 3, 4, 5, 6].filter((op) => getOp(v, op, 'outputLevel') > 0)]
  const freeBranches = [...(def.skeleton.branches ?? [])]
  for (const part of rest) {
    const share = part.weight / dominant.weight
    // a noise branch needs the pair whose modulator can be the noise source
    const fits = (br: readonly [number, number]) => !TONALITY_DEFS[part.tonality].branch.modulator.noise || br[1] === noiseHostOp(v)
    const free = freeBranches.findIndex(fits)
    if (share >= BRANCH_SHARE && free >= 0) {
      const [branch] = freeBranches.splice(free, 1)
      fillBranch(v, branch, part, share, shape, rng, spread)
      for (const op of branch) opTonality[op] = part.tonality
      owned.push([...branch])
      roles.push({ tonality: part.tonality, as: 'branch' })
    } else {
      const before = Uint8Array.from(v)
      TONALITY_DEFS[part.tonality].transform(v, Math.min(1, share * (0.4 + 0.6 * part.intensity)), rng)
      owned.push([1, 2, 3, 4, 5, 6].filter((op) => getOp(v, op, 'outputLevel') > 0 && v.subarray(opBase(op), opBase(op) + 21).some((b, i) => b !== before[opBase(op) + i])))
      roles.push({ tonality: part.tonality, as: 'transform' })
    }
  }

  // off the usual paths, from half way to Wild up
  goWild(v, wild, rng)

  // 3. the controls
  applyLength(v, c.length)
  applyBrightness(v, Math.max(-1, Math.min(1, c.brightness + (dominant.intensity - 0.5) * 0.6)))
  // a pair per pin (a pin between two tonalities is one pin), the heaviest tonalities first
  applyComplexity(v, c.complexity, rng, owned.slice(0, Math.max(1, c.pins.length)))
  applyMotion(v, c.motion, rng)
  applyRegister(v, c.register)
  if (MODELS[model].fixedVelocity === null) applyVelocity(v, c.velocity)
  if (c.pitchAccent) applyPitchBlip(v)

  // 4. audible, and as loud as the others
  ensureAudible(v)
  let db = normalizeLoudness(v)
  if (db < SILENT_DB) { rescue(v); db = normalizeLoudness(v) }
  // named by how it sounds, not by its pins (docs/SOUND.md)
  setVoiceName(v, keepName ?? nameVoice(v))
  for (let op = 1; op <= 6; op++) if (getOp(v, op, 'outputLevel') > 0) opTonality[op] ??= dominant.tonality
  return { voice: v, mix, roles, loudness: db, opTonality }
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
  // a noise branch is far louder to the ear than a tone at the same level: its own, wider curve (noiseDb)
  const db = b.modulator.noise ? noiseDb(share * (0.4 + 0.6 * part.intensity)) : 20 * Math.log10(Math.min(1, share))
  setOp(v, carrier, 'outputLevel', clamp99((b.modulator.noise ? 99 : getOp(v, carrier, 'outputLevel')) + Math.round(db / 0.75)))
  setOp(v, modulator, 'outputLevel', clamp99(getOp(v, modulator, 'outputLevel') - 8 * (1 - part.intensity)))
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
