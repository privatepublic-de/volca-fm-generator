import { beforeEach, describe, expect, it } from 'vitest'
import { useApp } from '../src/app/store'
import { vmemMessage } from '../src/dx7/sysex'
import { initVoice, setVoiceName, voiceName } from '../src/dx7/voice'
import { centroid, decayTime, slice } from '../src/engine/measure'
import { renderNote } from '../src/engine/render'

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
    s.variation()
    const made = useApp.getState().history.at(-1)!
    useApp.getState().setModel('fm')
    useApp.getState().recall(made)
    expect(useApp.getState().voice).toEqual(made.voice)
    expect(useApp.getState().generated).toBeNull()
  })

  it('mutate moves the pins and comes back exactly; a variation too, with its details moved', () => {
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
    expect(varied.made!.vary).toBe(1)
    expect(varied.made!.pins.map((p) => p.angle)).toEqual(after.map((p) => p.angle))
    for (const e of [mutated, varied]) {
      useApp.getState().recall(e)
      expect(useApp.getState().generated, e.name).not.toBeNull()
      expect(useApp.getState().voice).toEqual(e.voice)
    }
  })

  it('init voice: one mild pin, everything down, a plain held sine that brightness opens up', () => {
    const s = useApp.getState()
    s.setControl('motion', 0.8)
    s.initVoice()
    const now = useApp.getState()
    expect(now.pins).toHaveLength(1)
    expect(now.controls.shape).toBe('gate')
    expect(now.controls.motion).toBe(0)
    const seg = (v: Uint8Array) => ({ samples: renderNote(v, { sampleRate: 24000, holdSeconds: 2 }), sampleRate: 24000 })
    const sine = seg(now.voice)
    expect(centroid(slice(sine, 0.3, 0.8)) / 261.6).toBeLessThan(1.1)
    expect(decayTime(sine)).toBe(Infinity)
    useApp.getState().setControl('brightness', 1)
    expect(centroid(slice(seg(useApp.getState().voice), 0.3, 0.8)) / 261.6).toBeGreaterThan(1.3)
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

  it('a cartridge opens to be heard; only the ticked voices are kept, once each, with distinct names', () => {
    const a = initVoice(); setVoiceName(a, 'BRASS 1')
    const b = initVoice(); setVoiceName(b, 'BRASS 1'); b[0] = 50
    const c = initVoice(); setVoiceName(c, 'E.PIANO'); c[0] = 70
    const s = useApp.getState()
    expect(s.openCart(new Uint8Array([0xf0, 0xf7]), 'empty.syx')).toMatch(/no DX7 voices/)
    expect(useApp.getState().cart).toBeNull()
    expect(s.openCart(vmemMessage([a, b, c]), 'rom1a.syx')).toBe('')
    expect(useApp.getState().cart!.voices).toHaveLength(32)
    expect(useApp.getState().favourites).toHaveLength(0)
    expect(useApp.getState().keepFromCart([1, 0])).toBe('2 voices from rom1a.syx kept.')
    expect(useApp.getState().favourites.map((f) => f.name)).toEqual(['BRASS 1', 'BRASS 1 2'])
    expect(useApp.getState().keepFromCart([0, 2])).toBe('1 voice from rom1a.syx kept, 1 already there.')
    useApp.getState().closeCart()
    expect(useApp.getState().cart).toBeNull()
  })

  it('new voice: a fresh roll of the wheel, no instrument, the register kept', () => {
    const s = useApp.getState()
    s.startFrom('violin')
    s.setControl('register', 'bass')
    s.setControl('brightness', 0.7)
    for (let i = 0; i < 6; i++) {
      const before = useApp.getState().pins.map((p) => p.angle)
      useApp.getState().generateNew()
      const now = useApp.getState()
      expect(now.pins.length).toBeGreaterThanOrEqual(1)
      expect(now.pins.map((p) => p.angle)).not.toEqual(before)
      expect(now.controls.instrument).toBeNull()
      expect(now.controls.brightness).toBe(0)
      expect(now.controls.register).toBe('bass')
      expect(now.vary).toBe(0)
    }
  })

  it('your own name for the voice stays through changes until a new start; emptied, the sound names it again', () => {
    const s = useApp.getState()
    s.setModel('fm2')
    useApp.setState({ pins: [{ id: 701, angle: 60, radius: 0.5, weight: 0.6 }], customName: null })
    useApp.getState().regenerate(true)
    const auto = voiceName(useApp.getState().voice)
    useApp.getState().renameVoice('My Bell')
    expect(voiceName(useApp.getState().voice)).toBe('My Bell')
    expect(useApp.getState().history.find((h) => h.id === useApp.getState().currentId)?.name).toBe('My Bell')
    useApp.getState().setControl('brightness', 0.5)
    useApp.getState().regenerate(true)
    expect(voiceName(useApp.getState().voice)).toBe('My Bell')
    useApp.getState().variation()
    expect(voiceName(useApp.getState().voice)).toBe('My Bell')
    // emptied: the generator names it again
    useApp.getState().renameVoice('')
    expect(useApp.getState().customName).toBeNull()
    expect(voiceName(useApp.getState().voice)).not.toBe('My Bell')
    useApp.getState().renameVoice('Again')
    useApp.getState().generateNew()
    expect(useApp.getState().customName).toBeNull()
    expect(voiceName(useApp.getState().voice)).not.toBe('Again')
    expect(auto.length).toBeGreaterThan(0)
  })

  it('a kept voice brings its pins and controls back, renamed or not', () => {
    const s = useApp.getState()
    s.setModel('fm2')
    useApp.setState({ pins: [{ id: 801, angle: 60, radius: 0.5, weight: 0.6 }, { id: 802, angle: 210, radius: 0.5, weight: 0.4 }] })
    useApp.getState().setControl('brightness', 0.4)
    useApp.getState().variation()
    const made = useApp.getState().voice
    useApp.getState().keep()
    const kept = useApp.getState().favourites.at(-1)!
    expect(kept.made?.pins.map((p) => p.angle)).toEqual([60, 210])
    useApp.getState().rename(kept.id, 'MINE')
    // somewhere else entirely
    useApp.getState().initVoice()
    expect(useApp.getState().pins).toHaveLength(1)
    useApp.getState().recall(useApp.getState().favourites.at(-1)!)
    const now = useApp.getState()
    expect(now.pins.map((p) => p.angle)).toEqual([60, 210])
    expect(now.controls.brightness).toBe(0.4)
    expect(now.generated).not.toBeNull()
    expect(now.voice.subarray(0, 145)).toEqual(made.subarray(0, 145))
  })

  it('a voice kept after a change that adds no history step still keeps its pins and controls', () => {
    const s = useApp.getState()
    s.generateNew()
    useApp.getState().setModel('fm')
    useApp.getState().setModel('fm2')
    expect(useApp.getState().currentId).toBeNull()
    useApp.getState().setControl('motion', 0.3)
    const voice = useApp.getState().voice
    useApp.getState().keep()
    const kept = useApp.getState().favourites.at(-1)!
    expect(kept.made?.controls.motion).toBe(0.3)
    useApp.getState().initVoice()
    useApp.getState().recall(kept)
    expect(useApp.getState().controls.motion).toBe(0.3)
    expect(useApp.getState().voice).toEqual(voice)
    expect(useApp.getState().generated).not.toBeNull()
  })

  it('each step says what it changed; names repeat in the session and get a number only among the kept', () => {
    const s = useApp.getState()
    s.initVoice()
    useApp.getState().setControl('brightness', 1)
    useApp.getState().regenerate(true)
    useApp.getState().mutateCurrent()
    expect(useApp.getState().history.slice(-3).map((h) => h.change)).toEqual(['Init voice', 'Brightness ↑', 'Mutate'])
    useApp.getState().initVoice()
    useApp.getState().initVoice()
    const names = useApp.getState().history.slice(-2).map((h) => h.name)
    expect(names[0]).toBe(names[1])
    useApp.getState().keep()
    useApp.getState().generateNew()
    useApp.getState().initVoice()
    useApp.getState().keep()
    const kept = useApp.getState().favourites.slice(-2).map((f) => f.name)
    expect(kept[1]).toBe(`${kept[0]} 2`)
  })

  it('back and forward step through the session (undo, redo)', () => {
    const s = useApp.getState()
    s.generateNew()
    s.generateNew()
    s.generateNew()
    const [a, b, c] = useApp.getState().history.slice(-3)
    useApp.getState().back()
    expect(useApp.getState().currentId).toBe(b.id)
    useApp.getState().back()
    expect(useApp.getState().currentId).toBe(a.id)
    useApp.getState().forward()
    useApp.getState().forward()
    expect(useApp.getState().currentId).toBe(c.id)
    expect(useApp.getState().voice).toEqual(c.voice)
    useApp.getState().forward()
    expect(useApp.getState().currentId).toBe(c.id)
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
