// A DX7 voice as its 155 VCED bytes (the 1-voice SysEx order, PLAN §2): six operators of 21 bytes, OP6 first,
// then the voice-wide parameters and the 10-character name. Plain bytes, so the codec, the engine and the
// generator share one form.

export type Voice = Uint8Array

export const VOICE_SIZE = 155
export const OP_SIZE = 21

/** Offsets inside an operator's 21 bytes. */
export const OP = {
  rate1: 0, rate2: 1, rate3: 2, rate4: 3,
  level1: 4, level2: 5, level3: 6, level4: 7,
  breakPoint: 8, leftDepth: 9, rightDepth: 10, leftCurve: 11, rightCurve: 12,
  rateScaling: 13, ampModSens: 14, velocitySens: 15, outputLevel: 16,
  oscMode: 17, coarse: 18, fine: 19, detune: 20,
} as const

/** Offsets of the voice-wide parameters. */
export const VC = {
  pitchRate1: 126, pitchRate2: 127, pitchRate3: 128, pitchRate4: 129,
  pitchLevel1: 130, pitchLevel2: 131, pitchLevel3: 132, pitchLevel4: 133,
  algorithm: 134, feedback: 135, oscKeySync: 136,
  lfoSpeed: 137, lfoDelay: 138, lfoPitchDepth: 139, lfoAmpDepth: 140, lfoSync: 141, lfoWave: 142,
  pitchModSens: 143, transpose: 144, name: 145,
} as const

/** Largest value per operator offset (all start at 0). */
const OP_MAX = [99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 3, 3, 7, 3, 7, 99, 1, 31, 99, 14]
/** Largest value per voice-wide offset 126…144. */
const VOICE_MAX = [99, 99, 99, 99, 99, 99, 99, 99, 31, 7, 1, 99, 99, 99, 99, 1, 5, 7, 48]

/** The largest value of the byte at `offset` (name bytes: printable ASCII). */
export function maxAt(offset: number): number {
  if (offset < 126) return OP_MAX[offset % OP_SIZE]
  if (offset < VC.name) return VOICE_MAX[offset - 126]
  return 126
}

const OP_NAMES: Record<keyof typeof OP, string> = {
  rate1: 'rate 1', rate2: 'rate 2', rate3: 'rate 3', rate4: 'rate 4', level1: 'level 1', level2: 'level 2', level3: 'level 3', level4: 'level 4',
  breakPoint: 'break point', leftDepth: 'left depth', rightDepth: 'right depth', leftCurve: 'left curve', rightCurve: 'right curve',
  rateScaling: 'rate scale', ampModSens: 'amp mod sense', velocitySens: 'velocity sense', outputLevel: 'level',
  oscMode: 'osc mode', coarse: 'coarse', fine: 'fine', detune: 'detune',
}
const VC_NAMES: Record<keyof typeof VC, string> = {
  pitchRate1: 'Pitch rate 1', pitchRate2: 'Pitch rate 2', pitchRate3: 'Pitch rate 3', pitchRate4: 'Pitch rate 4',
  pitchLevel1: 'Pitch level 1', pitchLevel2: 'Pitch level 2', pitchLevel3: 'Pitch level 3', pitchLevel4: 'Pitch level 4',
  algorithm: 'Algorithm', feedback: 'Feedback', oscKeySync: 'Osc key sync', lfoSpeed: 'LFO speed', lfoDelay: 'LFO delay',
  lfoPitchDepth: 'LFO pitch depth', lfoAmpDepth: 'LFO amp depth', lfoSync: 'LFO key sync', lfoWave: 'LFO wave',
  pitchModSens: 'Pitch mod sense', transpose: 'Transpose', name: 'Name',
}

/** The parameter at `offset` in words: "OP2 rate 1", "Feedback". */
export function nameAt(offset: number): string {
  if (offset < 126) {
    const key = (Object.keys(OP) as (keyof typeof OP)[]).find((k) => OP[k] === offset % OP_SIZE)!
    return `OP${6 - Math.floor(offset / OP_SIZE)} ${OP_NAMES[key]}`
  }
  const key = (Object.keys(VC) as (keyof typeof VC)[]).find((k) => VC[k] === Math.min(offset, VC.name))!
  return VC_NAMES[key]
}

/** Whether the byte at `offset` is part of an operator's envelope (R1–R4, L1–L4). */
export const isEgByte = (offset: number) => offset < 126 && offset % OP_SIZE < 8

/** Where operator `op` (1–6, as the DX7 numbers them) starts. */
export const opBase = (op: number) => (6 - op) * OP_SIZE

export function getOp(v: Voice, op: number, param: keyof typeof OP): number {
  return v[opBase(op) + OP[param]]
}

export function setOp(v: Voice, op: number, param: keyof typeof OP, value: number) {
  v[opBase(op) + OP[param]] = clampAt(opBase(op) + OP[param], value)
}

export function setVc(v: Voice, param: Exclude<keyof typeof VC, 'name'>, value: number) {
  v[VC[param]] = clampAt(VC[param], value)
}

const clampAt = (offset: number, value: number) => Math.max(0, Math.min(maxAt(offset), Math.round(value)))

export function voiceName(v: Voice): string {
  return String.fromCharCode(...v.subarray(VC.name, VC.name + 10)).trimEnd()
}

export function setVoiceName(v: Voice, name: string) {
  const padded = name.padEnd(10).slice(0, 10)
  for (let i = 0; i < 10; i++) {
    const c = padded.charCodeAt(i)
    v[VC.name + i] = c >= 32 && c <= 126 ? c : 32
  }
}

/** The DX7's INIT VOICE: algorithm 1, OP1 alone at full level, a sine. */
export function initVoice(): Voice {
  const v = new Uint8Array(VOICE_SIZE)
  for (let op = 1; op <= 6; op++) {
    const b = opBase(op)
    v.set([99, 99, 99, 99, 99, 99, 99, 0], b)
    v[b + OP.breakPoint] = 39
    v[b + OP.outputLevel] = op === 1 ? 99 : 0
    v[b + OP.coarse] = 1
    v[b + OP.detune] = 7
  }
  v.set([99, 99, 99, 99, 50, 50, 50, 50], VC.pitchRate1)
  v[VC.oscKeySync] = 1
  v[VC.lfoSpeed] = 35
  v[VC.lfoSync] = 1
  v[VC.pitchModSens] = 3
  v[VC.transpose] = 24
  setVoiceName(v, 'INIT VOICE')
  return v
}

/** Every byte within its range (a voice from a file may not be). */
export function isValidVoice(v: Voice): boolean {
  return v.length === VOICE_SIZE && v.every((b, i) => b <= maxAt(i) && (i < VC.name || b >= 32))
}

/** Out-of-range bytes clamped, as a DX7 would read them. */
export function sanitizeVoice(v: Voice): Voice {
  return Uint8Array.from(v, (b, i) => (i >= VC.name ? (b >= 32 && b <= 126 ? b : 32) : Math.min(b, maxAt(i))))
}
