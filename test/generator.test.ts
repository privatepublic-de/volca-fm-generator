import { describe, expect, it } from 'vitest'
import { getOp, isValidVoice, VC, voiceName, type Voice } from '../src/dx7/voice'
import { centroid, decayTime, flatness, peak, periodicity, pitch, slice, attackTime, type Segment } from '../src/engine/measure'
import { renderNote } from '../src/engine/render'
import { angleOf, DEFAULT_CHOICES, mixOf, REGISTERS, SHAPES, TONALITIES, type GeneratorChoices, type Tonality } from '../src/generator/choices'
import { generate, mutate } from '../src/generator/generate'
import { loudness, TARGET_DB } from '../src/generator/loudness'
import { rng } from '../src/generator/random'

const SR = 24000
const play = (v: Voice, holdSeconds = 2, note = 60): Segment => ({ samples: renderNote(v, { sampleRate: SR, holdSeconds, note }), sampleRate: SR })
const pin = (t: Tonality, weight = 1, radius = 0.5) => ({ angle: angleOf(t), radius, weight })
const only = (t: Tonality, more: Partial<GeneratorChoices> = {}): GeneratorChoices => ({ ...DEFAULT_CHOICES, pins: [pin(t)], ...more })
/** Averaged over a few seeds, so a test is about the tonality and not one roll. */
const avg = (c: GeneratorChoices, m: (s: Segment, v: Voice) => number, seeds = [1, 2, 3]) =>
  seeds.reduce((sum, seed) => { const v = generate(c, { seed }).voice; return sum + m(play(v), v) }, 0) / seeds.length
const bright = (s: Segment) => centroid(slice(s, 0.3, 0.8))
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
    // brass has no free branch
    expect(generate({ ...DEFAULT_CHOICES, pins: [pin('brass', 0.6), pin('bell', 0.4)] }, { seed: 1 }).roles[1].as).toBe('transform')
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

  it('more noise in the mix is noisier', () => {
    const flatWith = (w: number) => avg({ ...DEFAULT_CHOICES, pins: [pin('warm', 1), pin('noise', w)] }, (s) => flatness(slice(s, 0.2, 0.6)))
    expect(flatWith(0.8)).toBeGreaterThan(flatWith(0.1))
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
        register: r.chance(0.5) ? r.pick(REGISTERS) : null, velocity: r.next(), pitchAccent: r.chance(0.3),
      }
      const g = generate(c, { seed: i, wild: r.next() })
      const what = `${i}: ${JSON.stringify(c)}`
      expect(isValidVoice(g.voice), what).toBe(true)
      expect(g.loudness, what).toBeGreaterThan(TARGET_DB - 9)
      expect(peak(play(g.voice, 1.5)), what).toBeLessThan(1)
    }
    // the generator is interactive: well under 50 ms a voice
    expect((performance.now() - started) / 120).toBeLessThan(50)
  })

  it('mutate changes a little and keeps it audible', () => {
    const v = generate(only('tine'), { seed: 1 }).voice
    const m = mutate(v, 0.5, 9)
    expect(m).not.toEqual(v)
    expect(m[VC.algorithm]).toBe(v[VC.algorithm])
    expect(Math.abs(loudness(m) - TARGET_DB)).toBeLessThan(4)
  })
})
