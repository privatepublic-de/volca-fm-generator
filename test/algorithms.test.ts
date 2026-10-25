import { describe, expect, it } from 'vitest'
import { ALGORITHMS } from '../src/dx7/algorithms'

describe('the 32 algorithms', () => {
  it('carriers as on the DX7 chart', () => {
    const carriers = (n: number) => ALGORITHMS[n - 1].carriers
    expect(carriers(1)).toEqual([1, 3])
    expect(carriers(5)).toEqual([1, 3, 5])
    expect(carriers(16)).toEqual([1])
    expect(carriers(19)).toEqual([1, 4, 5])
    expect(carriers(22)).toEqual([1, 3, 4, 5])
    expect(carriers(24)).toEqual([1, 2, 3, 4, 5])
    expect(carriers(32)).toEqual([1, 2, 3, 4, 5, 6])
    expect(ALGORITHMS.map((a) => a.carriers.length)).toEqual([
      2, 2, 2, 2, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 3, 3, 4, 4, 4, 5, 5, 3, 3, 3, 4, 4, 5, 6,
    ])
  })

  it('modulation as on the chart', () => {
    const mods = (n: number) => ALGORITHMS[n - 1].modulators
    expect(mods(1)[1]).toEqual([2])
    expect(mods(1)[3]).toEqual([4])
    expect(mods(1)[5]).toEqual([6])
    expect(mods(7)[3]).toEqual([4, 5])
    expect(mods(16)[1]).toEqual([2, 3, 5])
    expect(mods(22)[4]).toEqual([6])
    expect(mods(22)[3]).toEqual([6])
    expect(mods(32).every((m) => m.length === 0)).toBe(true)
  })

  it('every modulation goes from a higher operator to a lower one, every operator in every algorithm', () => {
    for (const a of ALGORITHMS) {
      expect(a.steps.map((s) => s.op)).toEqual([6, 5, 4, 3, 2, 1])
      for (let op = 1; op <= 6; op++) for (const m of a.modulators[op]) expect(m).toBeGreaterThan(op)
    }
  })

  it('feedback: on one operator, except the loops of 4 and 6', () => {
    const fb = (n: number) => ALGORITHMS[n - 1].feedback
    expect(fb(1)).toEqual({ from: 6, to: 6 })
    expect(fb(2)).toEqual({ from: 2, to: 2 })
    expect(fb(4)).toEqual({ from: 4, to: 6 })
    expect(fb(6)).toEqual({ from: 5, to: 6 })
    expect(fb(32)).toEqual({ from: 6, to: 6 })
  })
})
