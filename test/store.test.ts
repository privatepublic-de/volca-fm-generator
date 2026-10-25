import { beforeEach, describe, expect, it } from 'vitest'
import { useApp } from '../src/app/store'
import { voiceName } from '../src/dx7/voice'

describe('the app store', () => {
  beforeEach(() => {
    useApp.setState({ history: [], favourites: [], currentId: null })
  })

  it('new voices go into the history; going back plays the same bytes with the generator’s view', () => {
    const s = useApp.getState()
    s.generateNew()
    const first = useApp.getState().history.at(-1)!
    s.generateNew()
    expect(useApp.getState().history).toHaveLength(2)
    useApp.getState().recall(first)
    const now = useApp.getState()
    expect(now.voice).toEqual(first.voice)
    expect(now.generated).not.toBeNull()
    expect(now.generated!.voice).toEqual(first.voice)
  })

  it('a voice made under the other model or mutated comes back without the generator’s view', () => {
    const s = useApp.getState()
    s.setControl('velocity', 1)
    s.setModel('fm2')
    s.generateNew()
    const made = useApp.getState().history.at(-1)!
    useApp.getState().setModel('fm')
    useApp.getState().recall(made)
    expect(useApp.getState().voice).toEqual(made.voice)
    expect(useApp.getState().generated).toBeNull()
  })

  it('mutate moves the pins and comes back exactly; a variation too, with the wildness it was rolled at', () => {
    const s = useApp.getState()
    s.setModel('fm2')
    useApp.setState({ pins: [{ id: 901, angle: 60, radius: 0.5, weight: 0.6 }, { id: 902, angle: 210, radius: 0.5, weight: 0.4 }], wild: 0 })
    const before = useApp.getState().pins.map((p) => ({ ...p }))
    useApp.getState().mutateCurrent()
    const after = useApp.getState().pins
    expect(after[0].angle).not.toBe(before[0].angle)
    const mutated = useApp.getState().history.at(-1)!
    expect(mutated.made).toBeDefined()
    useApp.getState().variation()
    const varied = useApp.getState().history.at(-1)!
    expect(varied.made!.wild).toBeGreaterThanOrEqual(0.75)
    for (const e of [mutated, varied]) {
      useApp.getState().recall(e)
      expect(useApp.getState().generated, e.name).not.toBeNull()
      expect(useApp.getState().voice).toEqual(e.voice)
    }
  })

  it('keeps, renames and forgets favourites', () => {
    const s = useApp.getState()
    s.generateNew()
    s.keep()
    s.keep()
    expect(useApp.getState().favourites).toHaveLength(1)
    const f = useApp.getState().favourites[0]
    useApp.getState().rename(f.id, 'MY VOICE LONGER')
    expect(useApp.getState().favourites[0].name).toBe('MY VOICE L')
    expect(voiceName(useApp.getState().favourites[0].voice)).toBe('MY VOICE L')
    useApp.getState().unkeep(f.id)
    expect(useApp.getState().favourites).toHaveLength(0)
  })

  it('pins: at most three, and taking one away regenerates', () => {
    const s = useApp.getState()
    useApp.setState({ pins: [] })
    expect(s.addPin(0, 0.5)).not.toBeNull()
    expect(s.addPin(120, 0.5)).not.toBeNull()
    expect(s.addPin(240, 0.5)).not.toBeNull()
    expect(s.addPin(300, 0.5)).toBeNull()
    const id = useApp.getState().pins[0].id
    useApp.getState().removePin(id)
    expect(useApp.getState().pins).toHaveLength(2)
    expect(useApp.getState().generated!.mix.map((m) => m.tonality)).not.toContain('noise')
  })
})
