import { describe, expect, it } from 'vitest'
import { describeChange, type Made } from '../src/app/changes'
import { angleOf, DEFAULT_CHOICES } from '../src/generator/choices'

const { pins: _p, ...controls } = DEFAULT_CHOICES
const made = (over: Partial<Made> = {}): Made => ({ pins: [{ id: 1, angle: angleOf('bell'), radius: 0.5, weight: 0.6 }], controls: { ...controls }, wild: 0, ...over })

describe('what a step changed', () => {
  it('controls: up or down, envelope, register, accent, wild', () => {
    expect(describeChange(made(), made({ controls: { ...controls, brightness: 0.4 } }))).toBe('Brightness ↑')
    expect(describeChange(made(), made({ controls: { ...controls, complexity: 0.2 } }))).toBe('Complexity ↓')
    expect(describeChange(made(), made({ controls: { ...controls, shape: 'pad' } }))).toBe('Envelope: Pad')
    expect(describeChange(made(), made({ controls: { ...controls, register: 'bass' } }))).toBe('Register: Bass')
    expect(describeChange(made(), made({ controls: { ...controls, pitchAccent: true } }))).toBe('Pitch accent on')
    expect(describeChange(made(), made({ wild: 0.5 }))).toBe('Wild ↑')
  })

  it('pins: added, taken off, moved to another tonality, further out, heavier', () => {
    const before = made()
    expect(describeChange(before, made({ pins: [...before.pins, { id: 2, angle: angleOf('warm'), radius: 0.5, weight: 0.4 }] }))).toBe('Pin: Warm')
    expect(describeChange(before, made({ pins: [] }))).toBe('Pin off: Bell')
    expect(describeChange(before, made({ pins: [{ ...before.pins[0], angle: angleOf('glass') }] }))).toBe('Bell → Glass')
    expect(describeChange(before, made({ pins: [{ ...before.pins[0], radius: 0.9 }] }))).toBe('Bell more extreme')
    expect(describeChange(before, made({ pins: [{ ...before.pins[0], weight: 0.8 }] }))).toBe('Bell heavier')
  })

  it('several changes: two named, the rest counted; the first step and no change', () => {
    expect(describeChange(made(), made({ controls: { ...controls, brightness: 0.4, motion: 0.3, length: 0.2 } }))).toBe('Brightness ↑, Motion ↑ +1')
    expect(describeChange(undefined, made())).toBe('Start')
    expect(describeChange(made(), made())).toBe('Again')
  })
})
