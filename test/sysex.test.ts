import { describe, expect, it } from 'vitest'
import { checksum, packVoice, parameterChange, readSyx, unpackVoice, vcedMessage, vmemMessage } from '../src/dx7/sysex'
import { initVoice, isValidVoice, maxAt, opBase, OP, setOp, setVc, setVoiceName, VC, voiceName, VOICE_SIZE, type Voice } from '../src/dx7/voice'

/** A voice with every byte set to a different in-range value, so packing mistakes show. */
function busyVoice(seed = 1): Voice {
  const v = initVoice()
  let x = seed
  for (let i = 0; i < VC.name; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    v[i] = x % (maxAt(i) + 1)
  }
  setVoiceName(v, `BUSY ${seed}`)
  return v
}

describe('voice', () => {
  it('INIT VOICE is valid, named and plays OP1 alone', () => {
    const v = initVoice()
    expect(isValidVoice(v)).toBe(true)
    expect(voiceName(v)).toBe('INIT VOICE')
    expect(v[opBase(1) + OP.outputLevel]).toBe(99)
    expect(v[opBase(2) + OP.outputLevel]).toBe(0)
    expect(v[VC.transpose]).toBe(24)
  })

  it('OP6 comes first, OP1 last', () => {
    expect(opBase(6)).toBe(0)
    expect(opBase(1)).toBe(105)
  })

  it('setters clamp to the range', () => {
    const v = initVoice()
    setOp(v, 3, 'coarse', 40)
    setVc(v, 'algorithm', -2)
    expect(v[opBase(3) + OP.coarse]).toBe(31)
    expect(v[VC.algorithm]).toBe(0)
  })
})

describe('1-voice message', () => {
  it('has the DX7 header, 155 bytes and the chosen tail', () => {
    const v = initVoice()
    const m = vcedMessage(v)
    expect(Array.from(m.subarray(0, 6))).toEqual([0xf0, 0x43, 0x00, 0x00, 0x01, 0x1b])
    expect(m.length).toBe(163)
    expect(m[161]).toBe(0x3f)
    expect(m[162]).toBe(0xf7)
    expect(vcedMessage(v, { tail: 'checksum' })[161]).toBe(checksum(v))
    expect(vcedMessage(v, { tail: 'none' }).length).toBe(162)
    expect(vcedMessage(v, { opMask: 0b100000 })[161]).toBe(0x20)
    expect(Array.from(vcedMessage(v, { device: 3, count: 156 }).subarray(2, 6))).toEqual([0x03, 0x00, 0x01, 0x1c])
  })

  it('the checksum makes the data sum to 0 mod 128', () => {
    const v = busyVoice(7)
    let sum = checksum(v)
    for (const b of v) sum += b
    expect(sum % 128).toBe(0)
  })

  it('reads back from a file, with either tail', () => {
    const v = busyVoice(2)
    const withSum = readSyx(vcedMessage(v, { tail: 'checksum' }))
    expect(withSum.voices[0].voice).toEqual(v)
    expect(withSum.notes).toEqual([])
    const withBits = readSyx(vcedMessage(v))
    expect(withBits.voices[0].voice).toEqual(v)
    expect(withBits.notes[0]).toMatch(/not the checksum/)
  })
})

describe('32-voice bank', () => {
  it('packs and unpacks every field', () => {
    for (let s = 1; s < 20; s++) {
      const v = busyVoice(s)
      expect(unpackVoice(packVoice(v))).toEqual(v)
    }
  })

  it('a bank file gives 32 voices, missing ones INIT VOICE', () => {
    const voices = [busyVoice(1), busyVoice(2)]
    const m = vmemMessage(voices)
    expect(m.length).toBe(4104)
    expect(Array.from(m.subarray(0, 6))).toEqual([0xf0, 0x43, 0x00, 0x09, 0x20, 0x00])
    const read = readSyx(m)
    expect(read.notes).toEqual([])
    expect(read.voices).toHaveLength(32)
    expect(read.voices[1].voice).toEqual(voices[1])
    expect(voiceName(read.voices[31].voice)).toBe('INIT VOICE')
    expect(read.voices[31].voice.length).toBe(VOICE_SIZE)
  })

  it('reads several messages from one file and notes the rest', () => {
    const file = Uint8Array.from([...vcedMessage(busyVoice(1)), 0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7, ...vmemMessage([])])
    const read = readSyx(file)
    expect(read.voices).toHaveLength(33)
    expect(read.notes.some((n) => /skipped/.test(n))).toBe(true)
  })
})

describe('parameter change', () => {
  it('puts the parameter number in two bytes', () => {
    expect(Array.from(parameterChange(16, 80, 0))).toEqual([0xf0, 0x43, 0x10, 0x00, 0x10, 0x50, 0xf7])
    expect(Array.from(parameterChange(134, 4, 2))).toEqual([0xf0, 0x43, 0x12, 0x01, 0x06, 0x04, 0xf7])
  })
})
