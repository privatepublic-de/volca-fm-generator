import { describe, expect, it } from 'vitest'
import { voiceName } from '../src/dx7/voice'
import { angleOf, DEFAULT_CHOICES, type GeneratorChoices, type Tonality } from '../src/generator/choices'
import { generate } from '../src/generator/generate'
import { distinctName } from '../src/generator/naming'

const named = (pins: [Tonality, number][], more: Partial<GeneratorChoices> = {}, seed = 1, wild = 0, radius = 0.5) =>
  voiceName(generate({ ...DEFAULT_CHOICES, ...more, pins: pins.map(([t, w]) => ({ angle: angleOf(t), radius, weight: w })) }, { seed, wild }).voice)

describe('names from the sound', () => {
  it('say the shape: pluck, keys, bell, pad, swell, organ, bass, sine, noise', () => {
    expect(named([['wooden', 1]])).toMatch(/Pluck$/)
    expect(named([['tine', 1]])).toMatch(/Keys$/)
    expect(named([['bell', 1]])).toMatch(/Bell$/)
    expect(named([['warm', 1]])).toMatch(/Pad$/)
    expect(named([['string', 1]], { shape: 'pad' })).toMatch(/Pad$/)
    expect(named([['warm', 1]], { shape: 'reverse' })).toMatch(/Swell$/)
    expect(named([['tine', 1]], { shape: 'pad' })).toMatch(/Pad$/)
    expect(named([['organ', 1]])).toBe('Organ')
    expect(named([['warm', 1]], { register: 'bass' })).toMatch(/Bass$/)
    // Init voice: one mild Sine pin, everything down
    expect(named([['warm', 1]], { shape: 'gate', brightness: -1, complexity: 0 }, 1, 0, 0)).toBe('Sine')
    expect(named([['noise', 1]])).toBe('Noise')
  })

  it('and the most striking trait: air, wobble, hollowness', () => {
    expect(named([['breath', 1]])).toBe('Airy Pad')
    expect(named([['wooden', 1], ['noise', 0.3]])).toBe('Airy Pluck')
    expect(named([['warm', 1]], { motion: 1 }, 3)).toMatch(/^(Wobbly|Wavy) /)
    expect(named([['reed', 1]])).toMatch(/^(Hollow|Reedy) /)
  })

  it('follow the sound, not the pins: a bell pin with a warm one that rings like a bell is a bell', () => {
    expect(named([['bell', 0.6], ['warm', 0.4]], {}, 4)).toMatch(/Bell$/)
  })

  it('fit 10 characters, whatever is chosen', () => {
    for (let seed = 0; seed < 30; seed++) {
      const name = named([[(['noise', 'metallic', 'bell', 'reed', 'string', 'breath'] as const)[seed % 6], 1], ['brass', 0.4]], { motion: (seed % 3) / 2 }, seed, (seed % 4) / 3)
      expect(name.length, name).toBeLessThanOrEqual(10)
      expect(name.length, name).toBeGreaterThan(2)
    }
  })

  it('repeats get a number, in 10 characters', () => {
    expect(distinctName('Airy Pad', [])).toBe('Airy Pad')
    expect(distinctName('Airy Pad', ['Airy Pad'])).toBe('Airy Pad 2')
    expect(distinctName('Airy Pad', ['Airy Pad', 'Airy Pad 2'])).toBe('Airy Pad 3')
    // too long with a number: the noun alone
    expect(distinctName('Clang Keys', ['Clang Keys'])).toBe('Keys 2')
  })
})
