import { describe, expect, it } from 'vitest'
import { findOutput } from '../src/midi/transport'

const access = (...names: string[]) => ({ outputs: new Map(names.map((n, i) => [String(i), { name: n } as MIDIOutput])) }) as unknown as MIDIAccess
const pick = (a: MIDIAccess, saved?: string) => findOutput(a, saved)?.name ?? null

describe('choosing the MIDI out', () => {
  it('a port called volca first, else a hardware interface', () => {
    expect(pick(access('IAC Driver Bus 1', 'UM-ONE', 'volca fm2'))).toBe('volca fm2')
    expect(pick(access('IAC Driver Bus 1', 'Roland UM-ONE'))).toBe('Roland UM-ONE')
    expect(pick(access('IAC Driver Bus 1', 'USB MIDI Interface'))).toBe('USB MIDI Interface')
  })

  it('never a virtual port by itself, but one chosen by name', () => {
    expect(pick(access('IAC Driver Bus 1'))).toBeNull()
    expect(pick(access('IAC Driver Bus 1', 'Network Session 1'))).toBeNull()
    expect(pick(access('IAC Driver Bus 1', 'UM-ONE'), 'IAC Driver Bus 1')).toBe('IAC Driver Bus 1')
  })
})
