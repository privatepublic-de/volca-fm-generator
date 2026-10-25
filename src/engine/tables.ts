// DX7 tables and scalings from MSFA (music-synthesizer-for-android: env.cc, dx7note.cc, pitchenv.cc, lfo.cc;
// Copyright 2012–2013 Google Inc., Licensed under the Apache License, Version 2.0). The integer formulas are
// kept as MSFA has them, in the units it uses; synth.ts turns them into floats per sample.

/** Output level 0–19 is not linear (env.cc); 20–99 is 28 + level. */
const LEVEL_LUT = [0, 5, 9, 13, 17, 20, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 42, 43, 45, 46]
export const scaleOutLevel = (level: number) => (level >= 20 ? 28 + level : LEVEL_LUT[level])

const VELOCITY_DATA = [
  0, 70, 86, 97, 106, 114, 121, 126, 132, 138, 142, 148, 152, 156, 160, 163,
  166, 170, 173, 174, 178, 181, 184, 186, 189, 190, 194, 196, 198, 200, 202,
  205, 206, 209, 211, 214, 216, 218, 220, 222, 224, 225, 227, 229, 230, 232,
  233, 235, 237, 238, 240, 241, 242, 243, 244, 246, 246, 248, 249, 250, 251,
  252, 253, 254,
]
/** In microsteps (1/32 of an output level step): negative below about velocity 100. */
export function scaleVelocity(velocity: number, sensitivity: number): number {
  const v = VELOCITY_DATA[Math.max(0, Math.min(127, velocity)) >> 1] - 239
  return ((sensitivity * v + 7) >> 3) << 4
}

/** Added to the EG's qrate (0–63) higher up the keyboard. */
export function scaleRate(note: number, sensitivity: number): number {
  const x = Math.min(31, Math.max(0, Math.floor(note / 3) - 7))
  return (sensitivity * x) >> 3
}

const EXP_SCALE_DATA = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 14, 16, 19, 23, 27, 33, 39, 47, 56, 66, 80, 94, 110, 126, 142, 158, 174, 190, 206, 222, 238, 250]

/** Curves: 0 −lin, 1 −exp, 2 +exp, 3 +lin. In output level steps. */
function scaleCurve(group: number, depth: number, curve: number): number {
  const scale = curve === 0 || curve === 3
    ? (group * depth * 329) >> 12
    : (EXP_SCALE_DATA[Math.min(group, EXP_SCALE_DATA.length - 1)] * depth * 329) >> 15
  return curve < 2 ? -scale : scale
}

/** Keyboard level scaling around the break point (0 = A−1, 39 = C3), in output level steps. */
export function scaleLevel(note: number, breakPoint: number, leftDepth: number, rightDepth: number, leftCurve: number, rightCurve: number): number {
  const offset = note - breakPoint - 17
  return offset >= 0 ? scaleCurve(Math.trunc(offset / 3), rightDepth, rightCurve) : scaleCurve(Math.trunc(-offset / 3), leftDepth, leftCurve)
}

/** Pitch EG: rate 0–99 → speed, level 0–99 → offset in 1/32 octave (50 = none). */
export const PITCH_RATE = [
  1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12,
  12, 13, 13, 14, 14, 15, 16, 16, 17, 18, 18, 19, 20, 21, 22, 23, 24,
  25, 26, 27, 28, 30, 31, 33, 34, 36, 37, 38, 39, 41, 42, 44, 46, 47,
  49, 51, 53, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 79, 82,
  85, 88, 91, 94, 98, 102, 106, 110, 115, 120, 125, 130, 135, 141, 147,
  153, 159, 165, 171, 178, 185, 193, 202, 211, 232, 243, 254, 255,
]
export const PITCH_LEVEL = [
  -128, -116, -104, -95, -85, -76, -68, -61, -56, -52, -49, -46, -43,
  -41, -39, -37, -35, -33, -32, -31, -30, -29, -28, -27, -26, -25, -24,
  -23, -22, -21, -20, -19, -18, -17, -16, -15, -14, -13, -12, -11, -10,
  -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
  28, 29, 30, 31, 32, 33, 34, 35, 38, 40, 43, 46, 49, 53, 58, 65, 73,
  82, 92, 103, 115, 127,
]
/** Pitch EG speed: PITCH_RATE × this many octaves per second. */
export const PITCH_RATE_UNIT = 1 / 21.3

export const PITCH_MOD_SENS = [0, 10, 20, 33, 55, 92, 153, 255]

/** LFO speed 0–99 → frequency in Hz (lfo.cc: 25190424 / 2³² cycles per second per unit). */
export function lfoHz(speed: number): number {
  let sr = speed === 0 ? 1 : (165 * speed) >> 6
  sr *= sr < 160 ? 11 : 11 + ((sr - 160) >> 4)
  return (sr * 25190424) / 2 ** 32
}

/** LFO delay 0–99 → the two speeds of the delay counter, in counter lengths (2³²) per second: the first half
 *  waits, the second fades the LFO in. null: no delay. */
export function lfoDelayRates(delay: number): [number, number] | null {
  let a = 99 - delay
  if (a === 99) return null
  a = (16 + (a & 15)) << (1 + (a >> 4))
  const first = a
  const second = Math.max(0x80, a & 0xff80)
  return [(first * 25190424) / 2 ** 32, (second * 25190424) / 2 ** 32]
}

/** Amplitude modulation sensitivity 0–3 → the most the LFO can lower an operator's level at full depth, in
 *  the EG's level units (256 per doubling). Not from MSFA (it has no amplitude modulation): an estimate of the
 *  DX7's depths, to tune by ear. */
export const AMP_MOD_DEPTH = [0, 512, 1280, 3072]
