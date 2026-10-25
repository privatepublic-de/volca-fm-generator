// DX7 SysEx as the volcas take it (PLAN §2): the 1-voice message (VCED), the 32-voice bank (VMEM, read for
// import), parameter changes (Q3), and .syx files. The volca fm puts operator on/off bits where the DX7 has the
// checksum (byte 155); which form each model takes is Q1, so the tail is an option.
import { initVoice, OP_SIZE, sanitizeVoice, VC, VOICE_SIZE, type Voice } from './voice'

export const VMEM_VOICE_SIZE = 128
export const VMEM_SIZE = 32 * VMEM_VOICE_SIZE

/** What follows the 155 voice bytes: the volca fm's operator bits, the DX7's checksum, or nothing. */
export type VcedTail = 'opBits' | 'checksum' | 'none'

export interface VcedOptions {
  /** the low nibble of byte 2 (`0n`); 0 is what volcako sends */
  device?: number
  tail?: VcedTail
  /** operator on/off bits for the 'opBits' tail: B5 = OP1 … B0 = OP6 as on the DX7 (Q7) */
  opMask?: number
  /** the byte count field; the DX7 says 155 (`01 1B`) */
  count?: number
}

/** The DX7 checksum: data + checksum ≡ 0 mod 128. */
export function checksum(data: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i < data.length; i++) sum += data[i]
  return (128 - (sum & 0x7f)) & 0x7f
}

export function vcedMessage(v: Voice, { device = 0, tail = 'opBits', opMask = 0x3f, count = VOICE_SIZE }: VcedOptions = {}): Uint8Array {
  const tailBytes = tail === 'opBits' ? [opMask & 0x3f] : tail === 'checksum' ? [checksum(v)] : []
  return Uint8Array.from([0xf0, 0x43, device & 0x0f, 0x00, (count >> 7) & 0x7f, count & 0x7f, ...v, ...tailBytes, 0xf7])
}

export function vmemMessage(voices: readonly Voice[], device = 0): Uint8Array {
  const data = packBank(voices)
  return Uint8Array.from([0xf0, 0x43, device & 0x0f, 0x09, 0x20, 0x00, ...data, checksum(data), 0xf7])
}

/** A DX7 voice parameter change (`F0 43 1n 0g pp dd F7`, group 0): the official volca fm firmware lists none (Q3). */
export function parameterChange(param: number, value: number, device = 0): Uint8Array {
  return Uint8Array.from([0xf0, 0x43, 0x10 | (device & 0x0f), (param >> 7) & 0x03, param & 0x7f, value & 0x7f, 0xf7])
}

// ---------- the 32-voice bank: 128 packed bytes per voice ----------

/** One voice in the bank's packed form: 17 bytes per operator, then 26 voice-wide bytes. */
export function packVoice(v: Voice): Uint8Array {
  const p = new Uint8Array(VMEM_VOICE_SIZE)
  for (let i = 0; i < 6; i++) {
    const s = i * OP_SIZE
    const d = i * 17
    p.set(v.subarray(s, s + 11), d)
    p[d + 11] = (v[s + 12] << 2) | v[s + 11]
    p[d + 12] = (v[s + 20] << 3) | v[s + 13]
    p[d + 13] = (v[s + 15] << 2) | v[s + 14]
    p[d + 14] = v[s + 16]
    p[d + 15] = (v[s + 18] << 1) | v[s + 17]
    p[d + 16] = v[s + 19]
  }
  p.set(v.subarray(VC.pitchRate1, VC.pitchRate1 + 9), 102)
  p[111] = (v[VC.oscKeySync] << 3) | v[VC.feedback]
  p.set(v.subarray(VC.lfoSpeed, VC.lfoSpeed + 4), 112)
  p[116] = (v[VC.pitchModSens] << 4) | (v[VC.lfoWave] << 1) | v[VC.lfoSync]
  p[117] = v[VC.transpose]
  p.set(v.subarray(VC.name, VC.name + 10), 118)
  return p
}

export function unpackVoice(p: ArrayLike<number>): Voice {
  const v = new Uint8Array(VOICE_SIZE)
  for (let i = 0; i < 6; i++) {
    const s = i * OP_SIZE
    const d = i * 17
    for (let k = 0; k < 11; k++) v[s + k] = p[d + k]
    v[s + 11] = p[d + 11] & 0x03
    v[s + 12] = (p[d + 11] >> 2) & 0x03
    v[s + 13] = p[d + 12] & 0x07
    v[s + 20] = (p[d + 12] >> 3) & 0x0f
    v[s + 14] = p[d + 13] & 0x03
    v[s + 15] = (p[d + 13] >> 2) & 0x07
    v[s + 16] = p[d + 14]
    v[s + 17] = p[d + 15] & 0x01
    v[s + 18] = (p[d + 15] >> 1) & 0x1f
    v[s + 19] = p[d + 16]
  }
  for (let k = 0; k < 9; k++) v[VC.pitchRate1 + k] = p[102 + k]
  v[VC.feedback] = p[111] & 0x07
  v[VC.oscKeySync] = (p[111] >> 3) & 0x01
  for (let k = 0; k < 4; k++) v[VC.lfoSpeed + k] = p[112 + k]
  v[VC.lfoSync] = p[116] & 0x01
  v[VC.lfoWave] = (p[116] >> 1) & 0x07
  v[VC.pitchModSens] = (p[116] >> 4) & 0x07
  v[VC.transpose] = p[117]
  for (let k = 0; k < 10; k++) v[VC.name + k] = p[118 + k]
  return sanitizeVoice(v)
}

/** 32 voices packed; missing ones are INIT VOICE. */
export function packBank(voices: readonly Voice[]): Uint8Array {
  const data = new Uint8Array(VMEM_SIZE)
  for (let i = 0; i < 32; i++) data.set(packVoice(voices[i] ?? initVoice()), i * VMEM_VOICE_SIZE)
  return data
}

// ---------- .syx files ----------

export interface SyxVoice {
  voice: Voice
  /** where it came from: "voice 1", "bank 1 / 12" */
  source: string
}

export interface SyxContents {
  voices: SyxVoice[]
  /** what the reader noticed: checksums, operator bits, skipped messages */
  notes: string[]
}

/** Every SysEx message in a byte stream (a .syx file holds one or more). */
export function splitSysex(bytes: ArrayLike<number>): Uint8Array[] {
  const out: Uint8Array[] = []
  let start = -1
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0xf0) start = i
    else if (bytes[i] === 0xf7 && start >= 0) {
      out.push(Uint8Array.from(Array.prototype.slice.call(bytes, start, i + 1)))
      start = -1
    }
  }
  return out
}

/** The voices in a .syx file: 1-voice messages (with a checksum or the volca's operator bits) and 32-voice banks. */
export function readSyx(bytes: ArrayLike<number>): SyxContents {
  const voices: SyxVoice[] = []
  const notes: string[] = []
  let single = 0
  let bank = 0
  for (const m of splitSysex(bytes)) {
    if (m[1] !== 0x43 || (m[2] & 0xf0) !== 0) {
      notes.push(`skipped a ${m.length}-byte message that is no Yamaha bulk dump`)
      continue
    }
    const format = m[3]
    const data = m.subarray(6, m.length - 1)
    if (format === 0x00 && data.length >= VOICE_SIZE) {
      single++
      const voice = sanitizeVoice(data.subarray(0, VOICE_SIZE))
      const tail = data[VOICE_SIZE]
      if (tail === undefined) notes.push(`voice ${single}: no byte after the voice data`)
      else if (tail !== checksum(data.subarray(0, VOICE_SIZE)))
        notes.push(`voice ${single}: byte 155 is ${tail.toString(16).padStart(2, '0')}, not the checksum (volca operator bits?)`)
      voices.push({ voice, source: `voice ${single}` })
    } else if (format === 0x09 && data.length >= VMEM_SIZE) {
      bank++
      if (data[VMEM_SIZE] !== checksum(data.subarray(0, VMEM_SIZE))) notes.push(`bank ${bank}: checksum differs`)
      for (let i = 0; i < 32; i++) {
        voices.push({ voice: unpackVoice(data.subarray(i * VMEM_VOICE_SIZE, (i + 1) * VMEM_VOICE_SIZE)), source: `bank ${bank} / ${i + 1}` })
      }
    } else {
      notes.push(`skipped format ${format} with ${data.length} data bytes`)
    }
  }
  return { voices, notes }
}
