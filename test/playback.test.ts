import { beforeEach, describe, expect, it } from 'vitest'
import { CC_CHORUS, CC_REVERB, Playback } from '../src/ui/playback'

function fakeOutput() {
  const sent: number[][] = []
  return { sent, output: { state: 'connected', name: 'fake', send: (m: number[]) => sent.push(Array.from(m)) } as unknown as MIDIOutput }
}

describe('effects on the volca', () => {
  let p: Playback
  let sent: number[][]
  beforeEach(() => {
    p = new Playback()
    const f = fakeOutput()
    sent = f.sent
    p.useOutput(f.output)
    p.set({ model: 'fm2', channel: 3, target: 'browser' })
  })

  it('the fm2 gets its chorus and reverb depths as CC 93 and 91 on the channel, when it plays', () => {
    p.set({ chorus: 40 })
    expect(sent).toEqual([])
    p.set({ target: 'both' })
    expect(sent).toContainEqual([0xb2, CC_CHORUS, 40])
    expect(sent).toContainEqual([0xb2, CC_REVERB, 0])
    sent.length = 0
    p.set({ reverb: 100 })
    expect(sent).toEqual([[0xb2, CC_REVERB, 100]])
  })

  it('the volca fm gets nothing: its chorus is a button', () => {
    p.set({ model: 'fm', target: 'volca' })
    sent.length = 0
    p.set({ chorus: 90, reverb: 90, fmChorus: true })
    expect(sent.filter((m) => (m[0] & 0xf0) === 0xb0)).toEqual([])
  })
})
