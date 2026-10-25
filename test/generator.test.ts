import { describe, expect, it } from 'vitest'
import { getOp, isValidVoice, VC, voiceName, type Voice } from '../src/dx7/voice'
import { centroid, decayTime, flatness, peak, periodicity, pitch, slice, attackTime, type Segment } from '../src/engine/measure'
import { renderNote } from '../src/engine/render'
import { angleOf, DEFAULT_CHOICES, mixOf, REGISTERS, SHAPES, TONALITIES, type GeneratorChoices, type Tonality } from '../src/generator/choices'
import { generate } from '../src/generator/generate'
import { loudness, TARGET_DB } from '../src/generator/loudness'
import { algorithmOf } from '../src/dx7/algorithms'
const rolesOfVoice = (v: Voice) => algorithmOf(v[VC.algorithm])
import { rng } from '../src/generator/random'
import { mutateChoices } from '../src/generator/explore'
import { touchOf } from '../src/generator/controls'
import { INSTRUMENT_IDS, INSTRUMENTS } from '../src/generator/instruments'

const SR = 24000
const play = (v: Voice, holdSeconds = 2, note = 60): Segment => ({ samples: renderNote(v, { sampleRate: SR, holdSeconds, note }), sampleRate: SR })
const pin = (t: Tonality, weight = 1, radius = 0.5) => ({ angle: angleOf(t), radius, weight })
const only = (t: Tonality, more: Partial<GeneratorChoices> = {}): GeneratorChoices => ({ ...DEFAULT_CHOICES, pins: [pin(t)], ...more })
/** Averaged over a few seeds, so a test is about the tonality and not one roll. */
const avg = (c: GeneratorChoices, m: (s: Segment, v: Voice) => number, seeds = [1, 2, 3]) =>
  seeds.reduce((sum, seed) => { const v = generate(c, { seed }).voice; return sum + m(play(v), v) }, 0) / seeds.length
const bright = (s: Segment) => centroid(slice(s, 0.3, 0.8))
const sounding1 = (v: Voice) => [1, 2, 3, 4, 5, 6].filter((op) => getOp(v, op, 'outputLevel') > 0).length
const sounding = (v: Voice) => [1, 2, 3, 4, 5, 6].filter((op) => getOp(v, op, 'outputLevel') > 0).length

describe('pins', () => {
  it('a pin near a tonality is that tonality alone', () => {
    expect(mixOf([{ angle: angleOf('bell') + 3, radius: 0.5, weight: 1 }])).toEqual([{ tonality: 'bell', weight: 1, intensity: 0.5 }])
  })

  it('a pin between two belongs to both, in proportion', () => {
    const m = mixOf([{ angle: angleOf('bell') + 15, radius: 0.5, weight: 1 }])
    expect(m.map((p) => p.tonality).sort()).toEqual(['bell', 'glass'])
    expect(m[0].weight).toBeCloseTo(0.5)
  })

  it('pins add up, heaviest first; the wheel wraps around', () => {
    const m = mixOf([pin('warm', 0.4), pin('bell', 0.6), pin('warm', 0.3), { angle: 358, radius: 1, weight: 0.1 }])
    expect(m.map((p) => p.tonality)).toEqual(['warm', 'bell', 'noise'])
    expect(m[0].weight).toBeCloseTo(0.7)
  })

  it('the distance from the centre is heard, from Init too (Brightness at its lowest)', () => {
    const init = { ...DEFAULT_CHOICES, shape: 'gate' as const, brightness: -1, complexity: 0 }
    const bright = (t: Tonality, radius: number) =>
      centroid(slice(play(generate({ ...init, pins: [{ angle: angleOf(t), radius, weight: 1 }] }, { seed: 7 }).voice, 1), 0.2, 0.7))
    for (const t of ['metallic', 'bell', 'tine', 'reed', 'brass'] as Tonality[]) {
      expect(bright(t, 0.95), t).toBeGreaterThan(bright(t, 0.5) * 1.15)
      expect(bright(t, 0.5), t).toBeGreaterThan(bright(t, 0.05) * 1.05)
    }
  })
})

describe('every tonality alone', () => {
  for (const t of TONALITIES) {
    it(`${t}: a valid voice at the target loudness, named, the same for the same seed`, () => {
      const g = generate(only(t), { seed: 7 })
      expect(isValidVoice(g.voice)).toBe(true)
      expect(Math.abs(g.loudness - TARGET_DB)).toBeLessThan(3)
      expect(voiceName(g.voice).length).toBeGreaterThan(2)
      expect(generate(only(t), { seed: 7 }).voice).toEqual(g.voice)
      expect(generate(only(t), { seed: 8 }).voice).not.toEqual(g.voice)
    })
  }
})

describe('tonalities sound like themselves', () => {
  it('noise is noise; breath has some air; the others are tones', () => {
    const flat = (t: Tonality) => avg(only(t), (s) => flatness(slice(s, 0.1, 0.6)))
    expect(flat('noise')).toBeGreaterThan(0.3)
    expect(flat('breath')).toBeGreaterThan(flat('warm') * 10)
    expect(flat('organ')).toBeLessThan(0.01)
  })

  it('metallic is less periodic than the harmonic tonalities', () => {
    const per = (t: Tonality) => avg(only(t), (s) => periodicity(slice(s, 0.2, 0.5)))
    expect(per('metallic')).toBeLessThan(per('warm') - 0.03)
    expect(per('metallic')).toBeLessThan(per('organ') - 0.03)
  })

  it('brass and strings are brighter than warm', () => {
    expect(avg(only('brass'), bright)).toBeGreaterThan(avg(only('warm'), bright) * 1.6)
    expect(avg(only('string'), bright)).toBeGreaterThan(avg(only('warm'), bright) * 1.6)
  })

  it('struck and plucked tonalities fade, organ and warm hold; wood is shorter than bell', () => {
    const decay = (t: Tonality) => avg(only(t), (s) => decayTime(s))
    expect(decay('organ')).toBe(Infinity)
    expect(decay('warm')).toBe(Infinity)
    expect(decay('bell')).toBeLessThan(3)
    expect(decay('wooden')).toBeLessThan(decay('bell'))
  })
})

describe('mixing', () => {
  it('a strong second pin takes a free branch, a weak one transforms', () => {
    const strong = generate({ ...DEFAULT_CHOICES, pins: [pin('bell', 0.6), pin('warm', 0.4)] }, { seed: 1 })
    expect(strong.roles).toEqual([{ tonality: 'bell', as: 'skeleton' }, { tonality: 'warm', as: 'branch' }])
    const weak = generate({ ...DEFAULT_CHOICES, pins: [pin('bell', 0.9), pin('warm', 0.1)] }, { seed: 1 })
    expect(weak.roles[1].as).toBe('transform')
    // the organ has no free branch (six drawbars)
    expect(generate({ ...DEFAULT_CHOICES, pins: [pin('organ', 0.6), pin('bell', 0.4)] }, { seed: 1 }).roles[1].as).toBe('transform')
  })

  it('a second tonality changes the sound', () => {
    const alone = generate(only('warm'), { seed: 3 }).voice
    for (const t of ['metallic', 'noise', 'brass', 'glass'] as const) {
      const mixed = generate({ ...DEFAULT_CHOICES, pins: [pin('warm', 0.7), pin(t, 0.3)] }, { seed: 3 }).voice
      expect(mixed.subarray(0, VC.name), t).not.toEqual(alone.subarray(0, VC.name))
    }
  })

  it('a noise branch stays noise whatever comes after it', () => {
    for (const brightness of [-1, 0, 1]) {
      const c = { ...DEFAULT_CHOICES, brightness, pins: [pin('bell', 0.6), pin('noise', 0.5), pin('warm', 0.4)] }
      const g = generate(c, { seed: 1 })
      expect(g.roles[1]).toEqual({ tonality: 'noise', as: 'branch' })
      expect(g.voice[VC.feedback], `brightness ${brightness}`).toBe(7)
    }
  })

  it('noise and breath keep their noise when pure', () => {
    expect(avg(only('noise', { complexity: 0 }), (s) => flatness(slice(s, 0.1, 0.6)))).toBeGreaterThan(0.3)
    const breath = generate(only('breath', { complexity: 0 }), { seed: 1 }).voice
    expect(breath[VC.feedback]).toBe(7)
    expect(getOp(breath, 6, 'outputLevel')).toBeGreaterThanOrEqual(97)
  })

  it('noise comes in gradually: a hint at a small weight, more step by step, as a colour and as a branch', () => {
    for (const base of ['warm', 'bell', 'brass', 'organ', 'metallic'] as const) {
      const noisiness = (w: number) => avg({ ...DEFAULT_CHOICES, pins: [pin(base, 1), pin('noise', w)] }, (s) => Math.log10(flatness(slice(s, 0.3, 0.8)) + 1e-9))
      const steps = [0.03, 0.1, 0.2, 0.3, 0.45, 0.7].map(noisiness)
      for (let i = 1; i < steps.length; i++) expect(steps[i], `${base} at step ${i}`).toBeGreaterThan(steps[i - 1])
      // a hint is far from all noise (log flatness about −4 vs −0.3)
      expect(steps[0], base).toBeLessThan(-2.5)
    }
  })

  it('a little noise on a pure voice stays a little: the tonality keeps its own operators', () => {
    for (const base of ['string', 'warm', 'bell', 'brass'] as const) {
      for (const shape of [null, 'pad'] as const) {
        const c = { ...DEFAULT_CHOICES, complexity: 0, shape, pins: [pin(base, 1), pin('noise', 0.15)] }
        for (const seed of [1, 2, 3]) {
          const v = generate(c, { seed }).voice
          const what = `${base} ${shape} ${seed}`
          // a sounding carrier that isn't fed by the noise source
          const own = [1, 2, 3, 4, 5, 6].filter((op) => getOp(v, op, 'outputLevel') > 0 && !(op === 5 && getOp(v, 6, 'outputLevel') >= 97))
          expect(own.length, what).toBeGreaterThanOrEqual(2)
          expect(flatness(slice(play(v), 0.4, 1.2)), what).toBeLessThan(0.05)
        }
      }
    }
  })

  it('a noise pin uses a pair that can make noise, or comes in as a colour', () => {
    const g = generate({ ...DEFAULT_CHOICES, pins: [pin('breath', 0.6), pin('noise', 0.4)] }, { seed: 1 })
    expect(g.roles[1].as).toBe('transform')
    // and never leaves a deep modulator at full level that isn't noise (a loud plain tone)
    expect(getOp(g.voice, 4, 'outputLevel')).toBeLessThan(97)
  })
})

describe('controls', () => {
  it('brightness', () => {
    for (const t of ['warm', 'brass', 'bell'] as const) {
      expect(avg(only(t, { brightness: 1 }), bright), t).toBeGreaterThan(avg(only(t, { brightness: -1 }), bright) * 1.2)
    }
  })

  it('complexity: pure is two or three operators, dense is six', () => {
    for (const t of ['warm', 'bell', 'tine'] as const) {
      expect(sounding(generate(only(t, { complexity: 0 }), { seed: 1 }).voice), t).toBeLessThanOrEqual(3)
      expect(sounding(generate(only(t, { complexity: 1 }), { seed: 1 }).voice), t).toBe(6)
    }
  })

  it('pure is still FM: one carrier with its modulator, so brightness works', () => {
    for (const t of ['tine', 'warm', 'string', 'bell', 'organ'] as const) {
      const v = generate(only(t, { complexity: 0 }), { seed: 1 }).voice
      const alg = rolesOfVoice(v)
      const sounding = [1, 2, 3, 4, 5, 6].filter((op) => getOp(v, op, 'outputLevel') > 0)
      if (t !== 'organ') expect(sounding.some((op) => !alg.carriers.includes(op)), t).toBe(true)
      // early in the note: a struck sound's brightness is in its attack
      const b = (brightness: number) => avg(only(t, { complexity: 0, brightness }), (s) => centroid(slice(s, 0.05, 0.35)))
      if (t !== 'organ') expect(b(1), t).toBeGreaterThan(b(-1) * 1.3)
    }
    // the case that showed it: tine, string, glass and bell, pad, bright, pure
    const c = { ...DEFAULT_CHOICES, shape: 'pad' as const, brightness: 1, complexity: 0, pins: [pin('tine', 0.45, 1), pin('string', 0.41, 1), { angle: angleOf('glass') - 10, radius: 1, weight: 0.14 }] }
    expect(avg(c, (s) => centroid(slice(s, 1, 1.5)))).toBeGreaterThan(261.6 * 1.5)
  })

  it('a pure mix keeps a pair of each pinned tonality', () => {
    const c = { ...DEFAULT_CHOICES, complexity: 0, pins: [pin('tine', 0.45), pin('string', 0.41), pin('bell', 0.14)] }
    for (const seed of [1, 2, 3]) {
      const g = generate(c, { seed })
      const v = g.voice
      const sounding = [1, 2, 3, 4, 5, 6].filter((op) => getOp(v, op, 'outputLevel') > 0)
      expect(g.roles.map((r) => r.as)).toEqual(['skeleton', 'branch', 'transform'])
      // the string branch (OP5 with OP6) sounds next to the tine's own pair
      expect(sounding, `seed ${seed}`).toEqual(expect.arrayContaining([5, 6]))
      expect(sounding.filter((op) => g.opTonality[op] === 'tine').length, `seed ${seed}`).toBeGreaterThanOrEqual(2)
      expect(sounding.length).toBeLessThanOrEqual(5)
    }
    // a pin between two tonalities is one pin: three pins, at most three pairs
    const split = generate({ ...DEFAULT_CHOICES, complexity: 0, pins: [pin('tine', 0.45), pin('string', 0.41), { angle: angleOf('glass') - 15, radius: 1, weight: 0.14 }] }, { seed: 1 })
    expect(split.roles).toHaveLength(4)
    expect([1, 2, 3, 4, 5, 6].filter((op) => getOp(split.voice, op, 'outputLevel') > 0).length).toBeLessThanOrEqual(6)
    // and no runaway ratios from colours stacking (glass's 14:1 times bell's 2.78)
    for (let op = 1; op <= 6; op++) if (!getOp(split.voice, op, 'oscMode')) expect(getOp(split.voice, op, 'coarse')).toBeLessThanOrEqual(16)
    // one pin: still one pair
    expect(sounding1(generate(only('tine', { complexity: 0 }), { seed: 1 }).voice)).toBe(2)
  })

  it('shape and length', () => {
    const atk = (c: GeneratorChoices) => avg(c, (s) => attackTime(s))
    expect(atk(only('warm', { shape: 'pad' }))).toBeGreaterThan(atk(only('warm', { shape: 'pluck' })) + 0.3)
    const dec = (c: GeneratorChoices) => avg(c, (s) => decayTime(s))
    expect(dec(only('bell', { length: -1 }))).toBeLessThan(dec(only('bell', { length: 1 })) / 2)
  })

  it('motion moves the pitch', () => {
    const spread = (s: Segment) => {
      const p: number[] = []
      for (let t = 1; t < 1.9; t += 0.03) p.push(pitch(slice(s, t, t + 0.03)))
      return Math.max(...p) / Math.min(...p)
    }
    expect(avg(only('organ', { motion: 1 }), spread)).toBeGreaterThan(avg(only('organ', { motion: 0 }), spread) + 0.005)
  })

  it('register transposes; velocity only where the model uses it', () => {
    expect(generate(only('warm', { register: 'bass' }), { seed: 1 }).voice[VC.transpose]).toBe(12)
    expect(generate(only('warm', { register: 'lead' }), { seed: 1 }).voice[VC.transpose]).toBe(36)
    const vel = (model: 'fm' | 'fm2') => getOp(generate(only('warm', { velocity: 1 }), { seed: 1, model }).voice, 2, 'velocitySens')
    expect(vel('fm2')).toBe(7)
    expect(vel('fm')).toBe(0)
  })

  it("velocity starts as the voice's own and moves around it", () => {
    const piano = (velocity: number | null) => generate({ ...DEFAULT_CHOICES, instrument: 'piano', velocity }, { seed: 1 }).voice
    const own = piano(null)
    // the classic pianos answer to velocity; the slider shows it
    expect(touchOf(own)).toBeGreaterThan(0.25)
    for (const x of [0, 0.3, 0.7, 1]) expect(Math.abs(touchOf(piano(x)) - x), String(x)).toBeLessThan(0.12)
    // more velocity keeps the order of the operators' sensitivities (the hammer stays more sensitive than the body)
    const ops = [1, 2, 3, 4, 5, 6].filter((op) => getOp(own, op, 'outputLevel') > 0)
    const more = piano(Math.min(1, touchOf(own) + 0.2))
    for (const a of ops) for (const b of ops) {
      if (getOp(own, a, 'velocitySens') > getOp(own, b, 'velocitySens')) expect(getOp(more, a, 'velocitySens')).toBeGreaterThanOrEqual(getOp(more, b, 'velocitySens') - 1)
    }
  })
})

describe('pitch', () => {
  it('a pitch accent falls into the note and leaves the release alone', () => {
    const v = generate(only('warm', { pitchAccent: true }), { seed: 1 }).voice
    const s = { samples: renderNote(v, { sampleRate: SR, holdSeconds: 1, releaseSeconds: 0.5 }), sampleRate: SR }
    expect(pitch(slice(s, 0.005, 0.03))).toBeGreaterThan(261.6 * 1.04)
    expect(pitch(slice(s, 0.4, 0.9))).toBeCloseTo(261.6, 0)
    expect(pitch(slice(s, 1.02, 1.12))).toBeCloseTo(261.6, 0)
  })

  it('brass and wood fall into the note only now and then, more often when wild', () => {
    const blips = (wild: number) => [...Array(40).keys()].filter((seed) => generate(only('brass'), { seed, wild }).voice[VC.pitchLevel1] !== 50).length
    expect(blips(0)).toBeGreaterThan(2)
    expect(blips(0)).toBeLessThan(20)
    expect(blips(1)).toBeGreaterThan(blips(0))
  })
})

describe('going further', () => {
  const pitchSpread = (s: Segment) => {
    const p: number[] = []
    for (let t = 0.5; t < 1.9; t += 0.03) p.push(pitch(slice(s, t, t + 0.03)))
    return Math.max(...p) / Math.min(...p)
  }

  it('motion beyond ½ wobbles far more than at ½', () => {
    expect(avg(only('organ', { motion: 1 }), pitchSpread)).toBeGreaterThan(avg(only('organ', { motion: 0.5 }), pitchSpread) * 1.5)
  })

  it('complexity beyond ½ is brighter and stays bright', () => {
    for (const t of ['warm', 'tine', 'bell'] as const) {
      const late = (complexity: number) => avg(only(t, { complexity }), (s) => centroid(slice(s, 1, 1.5)))
      expect(late(1), t).toBeGreaterThan(late(0.5) * 1.4)
    }
  })

  it('wild changes ratios and sometimes the algorithm; typical never does', () => {
    const algorithms = (wild: number) => new Set([...Array(30).keys()].map((seed) => generate(only('tine'), { seed, wild }).voice[VC.algorithm]))
    expect(algorithms(0).size).toBe(1)
    expect(algorithms(1).size).toBeGreaterThan(3)
  })

  it('mutate moves pins, sometimes adds or drops one, and pushes the controls', () => {
    const c = { ...DEFAULT_CHOICES, pins: [pin('bell', 0.6), pin('warm', 0.4)] }
    const results = [...Array(40).keys()].map((seed) => mutateChoices(c, rng(seed)))
    expect(results.every((m) => m.pins[0].angle !== c.pins[0].angle)).toBe(true)
    expect(results.some((m) => m.pins.length === 3)).toBe(true)
    expect(results.some((m) => m.pins.length === 1)).toBe(true)
    expect(results.some((m) => Math.abs(m.brightness) > 0.2)).toBe(true)
    // pins wander up to about two sectors
    const moved = results.map((m) => Math.min(Math.abs(m.pins[0].angle - c.pins[0].angle), 360 - Math.abs(m.pins[0].angle - c.pins[0].angle)))
    expect(Math.max(...moved)).toBeGreaterThan(30)
    expect(Math.max(...moved)).toBeLessThan(70)
  })
})

describe('starting from an instrument', () => {
  it('every instrument: valid, audible, named after itself', () => {
    for (const id of INSTRUMENT_IDS) {
      const g = generate({ ...DEFAULT_CHOICES, pins: [], instrument: id }, { seed: 1 })
      expect(isValidVoice(g.voice), id).toBe(true)
      expect(g.loudness, id).toBeGreaterThan(TARGET_DB - 9)
      expect(peak(play(g.voice, 1.5)), id).toBeLessThan(1)
      expect(g.instrument, id).toBe(id)
      expect(voiceName(g.voice).trim(), id).toBe(INSTRUMENTS[id].label)
      expect(g.roles.length, id).toBeGreaterThan(0)
    }
  })

  it('struck and plucked instruments die away, bowed and blown ones hold', () => {
    for (const id of INSTRUMENT_IDS) {
      const { group } = INSTRUMENTS[id]
      const g = generate({ ...DEFAULT_CHOICES, pins: [], instrument: id }, { seed: 2 })
      const s = play(g.voice, 3)
      const early = slice(s, 0.1, 0.3)
      const late = slice(s, 2.6, 2.9)
      const ratio = Math.sqrt(late.samples.reduce((a, x) => a + x * x, 0) / late.samples.length)
        / Math.sqrt(early.samples.reduce((a, x) => a + x * x, 0) / early.samples.length)
      if (group === 'percussion' || group === 'plucked') expect(ratio, id).toBeLessThan(0.5)
      // (the classic harmonica fades a little while held)
      if (group === 'winds' || group === 'brass' || group === 'voices') expect(ratio, id).toBeGreaterThan(0.15)
    }
  })

  it('a pin colours the instrument and keeps its name as the noun', () => {
    const g = generate({ ...DEFAULT_CHOICES, pins: [{ angle: angleOf('glass'), radius: 0.6, weight: 0.6 }], instrument: 'harpsichord' }, { seed: 3 })
    expect(voiceName(g.voice)).toMatch(/Harpsi/)
    expect(g.mix.some((m) => m.tonality === 'glass')).toBe(true)
  })
})

describe('anything goes', () => {
  it('random choices: valid, audible, not too loud, quick', () => {
    const r = rng(2026)
    const started = performance.now()
    for (let i = 0; i < 120; i++) {
      const c: GeneratorChoices = {
        pins: Array.from({ length: r.int(0, 3) }, () => ({ angle: r.range(0, 360), radius: r.next(), weight: r.range(0.1, 1) })),
        shape: r.chance(0.5) ? r.pick(SHAPES) : null,
        length: r.range(-1, 1), brightness: r.range(-1, 1), complexity: r.next(), motion: r.next(),
        register: r.chance(0.5) ? r.pick(REGISTERS) : null, velocity: r.chance(0.3) ? null : r.next(), pitchAccent: r.chance(0.3),
        instrument: r.chance(0.3) ? r.pick(INSTRUMENT_IDS) : null,
      }
      const g = generate(c, { seed: i, wild: r.next() })
      const what = `${i}: ${JSON.stringify(c)}`
      expect(isValidVoice(g.voice), what).toBe(true)
      // the pitch envelope starts, holds and ends on the note: no glide when a key is released
      expect([VC.pitchLevel3, VC.pitchLevel4].map((at) => g.voice[at]), what).toEqual([50, 50])
      expect(g.loudness, what).toBeGreaterThan(TARGET_DB - 9)
      expect(peak(play(g.voice, 1.5)), what).toBeLessThan(1)
    }
    // interactive: a voice (with its naming render, and this test's own render) well under 100 ms; while a control
    // is dragged the naming is skipped
    expect((performance.now() - started) / 120).toBeLessThan(100)
  })

})
