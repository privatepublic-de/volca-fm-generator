import { describe, expect, it } from 'vitest'
import { isValidVoice, OP, opBase, VC, voiceName } from '../src/dx7/voice'
import { bright, octaves, paramTests, pure } from '../src/probe/testVoices'

describe('probe test voices', () => {
  const tests = paramTests()

  it('are all valid DX7 voices', () => {
    for (const v of [pure(), bright(), octaves(), ...tests.flatMap((t) => [t.a, t.b])]) expect(isValidVoice(v), voiceName(v)).toBe(true)
  })

  it('each pair differs, and has its own id', () => {
    for (const t of tests) expect(t.a.subarray(0, VC.name), t.id).not.toEqual(t.b.subarray(0, VC.name))
    expect(new Set(tests.map((t) => t.id)).size).toBe(tests.length)
  })

  it('PROBE OCT: algorithm 32, OP1 lowest, an octave apart', () => {
    const v = octaves()
    expect(v[VC.algorithm]).toBe(31)
    expect([1, 2, 3, 4, 5, 6].map((op) => v[opBase(op) + OP.coarse])).toEqual([0, 1, 2, 4, 8, 16])
  })
})
