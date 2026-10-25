// The probe's test voices (PLAN §3): two that sound plainly different (Q1, Q4), six carriers an octave apart
// to tell the operator bits apart (Q7), and pairs that differ in one parameter only (Q5).
import { initVoice, setOp, setVc, setVoiceName, type Voice } from '../dx7/voice'

/** A sine: OP1 alone. */
export function pure(): Voice {
  const v = initVoice()
  setVoiceName(v, 'PROBE PURE')
  return v
}

/** Brassy: algorithm 1, OP2 modulating OP1 deeply at 1:1. */
export function bright(): Voice {
  const v = initVoice()
  setOp(v, 2, 'outputLevel', 88)
  setVoiceName(v, 'PROBE BRT')
  return v
}

/** Algorithm 32, six carriers an octave apart: OP1 0.5, OP2 1, OP3 2 … OP6 16. What you hear says which operator sounds. */
export function octaves(): Voice {
  const v = initVoice()
  setVc(v, 'algorithm', 31)
  ;[0, 1, 2, 4, 8, 16].forEach((coarse, i) => {
    setOp(v, i + 1, 'coarse', coarse)
    setOp(v, i + 1, 'outputLevel', 85)
  })
  setVoiceName(v, 'PROBE OCT')
  return v
}

/** The ear test of how a voice parameter is played: base, then a/b differ in one thing. */
export interface ParamTest {
  id: string
  label: string
  /** what a working parameter sounds like */
  expect: string
  pattern: NotePattern
  a: Voice
  b: Voice
  aLabel: string
  bLabel: string
}

/** low C4, velocity soft then hard, C2 then C6, four short repeats, one long */
export type NotePattern = 'one' | 'velocity' | 'range' | 'repeat' | 'long'

const make = (name: string, ...edits: ((v: Voice) => void)[]) => {
  const v = initVoice()
  for (const e of edits) e(v)
  setVoiceName(v, name)
  return v
}

/** OP2 modulating OP1, as in bright(); a little quieter so velocity and scaling have room. */
const modulated = (v: Voice) => setOp(v, 2, 'outputLevel', 80)
/** A pluck: the carrier decays to silence. */
const pluck = (v: Voice) => {
  setOp(v, 1, 'rate2', 45)
  setOp(v, 1, 'level2', 0)
  setOp(v, 1, 'level3', 0)
}
const vibrato = (v: Voice) => {
  setVc(v, 'lfoSpeed', 30)
  setVc(v, 'lfoPitchDepth', 60)
  setVc(v, 'pitchModSens', 7)
  setVc(v, 'lfoWave', 0)
}

export function paramTests(): ParamTest[] {
  return [
    {
      id: 'velocity', label: 'Velocity sensitivity', pattern: 'velocity',
      expect: 'B: the soft note is darker and quieter than the hard one; A: both alike',
      a: make('VEL OFF', modulated), b: make('VEL 7', modulated, (v) => { setOp(v, 1, 'velocitySens', 7); setOp(v, 2, 'velocitySens', 7) }),
      aLabel: 'sens 0', bLabel: 'sens 7',
    },
    {
      id: 'lfoPitch', label: 'LFO pitch depth', pattern: 'long', expect: 'B wobbles in pitch (vibrato), A is steady',
      a: make('LFO PMD 0', (v) => { vibrato(v); setVc(v, 'lfoPitchDepth', 0) }), b: make('LFO PMD 60', vibrato),
      aLabel: 'depth 0', bLabel: 'depth 60',
    },
    {
      id: 'lfoSpeed', label: 'LFO speed', pattern: 'long', expect: 'B wobbles much faster than A',
      a: make('LFO SPD 10', vibrato, (v) => setVc(v, 'lfoSpeed', 10)), b: make('LFO SPD 70', vibrato, (v) => setVc(v, 'lfoSpeed', 70)),
      aLabel: 'speed 10', bLabel: 'speed 70',
    },
    {
      id: 'lfoWave', label: 'LFO wave', pattern: 'long', expect: 'A glides up and down (triangle), B jumps between random pitches (sample & hold)',
      a: make('LFO TRI', vibrato), b: make('LFO S&H', vibrato, (v) => setVc(v, 'lfoWave', 5)),
      aLabel: 'triangle', bLabel: 'S&H',
    },
    {
      id: 'lfoDelay', label: 'LFO delay', pattern: 'long', expect: 'A wobbles at once, B starts steady and the vibrato fades in',
      a: make('LFO DLY 0', vibrato), b: make('LFO DLY 80', vibrato, (v) => setVc(v, 'lfoDelay', 80)),
      aLabel: 'delay 0', bLabel: 'delay 80',
    },
    {
      id: 'pitchModSens', label: 'Pitch mod sensitivity', pattern: 'long', expect: 'A steady, B wobbles (same LFO depth, sensitivity 0 vs 7)',
      a: make('PMS 0', vibrato, (v) => setVc(v, 'pitchModSens', 0)), b: make('PMS 7', vibrato),
      aLabel: 'sens 0', bLabel: 'sens 7',
    },
    {
      id: 'lfoAmp', label: 'LFO amp depth (tremolo)', pattern: 'long', expect: 'B pulses in volume, A is steady',
      a: make('LFO AMD 0', (v) => { setOp(v, 1, 'ampModSens', 3); setVc(v, 'lfoSpeed', 30) }),
      b: make('LFO AMD 99', (v) => { setOp(v, 1, 'ampModSens', 3); setVc(v, 'lfoSpeed', 30); setVc(v, 'lfoAmpDepth', 99) }),
      aLabel: 'depth 0', bLabel: 'depth 99',
    },
    {
      id: 'pitchEg', label: 'Pitch EG', pattern: 'one', expect: 'B starts very high and falls to the note, A is steady',
      a: make('PEG FLAT'), b: make('PEG DROP', (v) => { setVc(v, 'pitchLevel4', 99); setVc(v, 'pitchRate1', 50) }),
      aLabel: 'flat', bLabel: 'drop',
    },
    {
      id: 'rateScaling', label: 'Rate scaling', pattern: 'range', expect: 'B: the high note dies away much faster than the low one; A: both decay alike',
      a: make('RS 0', pluck), b: make('RS 7', pluck, (v) => setOp(v, 1, 'rateScaling', 7)),
      aLabel: 'scaling 0', bLabel: 'scaling 7',
    },
    {
      id: 'levelScaling', label: 'Keyboard level scaling', pattern: 'range', expect: 'B: the high note is much quieter than the low one; A: both alike',
      a: make('KLS 0'), b: make('KLS R99', (v) => { setOp(v, 1, 'breakPoint', 39); setOp(v, 1, 'rightDepth', 99); setOp(v, 1, 'rightCurve', 0) }),
      aLabel: 'depth 0', bLabel: 'right −lin 99',
    },
    {
      id: 'oscKeySync', label: 'Osc key sync', pattern: 'repeat', expect: 'A (sync on): every note starts the same; B (off): attacks vary a little (subtle)',
      a: make('OKS ON', modulated), b: make('OKS OFF', modulated, (v) => setVc(v, 'oscKeySync', 0)),
      aLabel: 'sync on', bLabel: 'sync off',
    },
    {
      id: 'transpose', label: 'Transpose', pattern: 'one', expect: 'B is an octave higher than A',
      a: make('TRNSP 0'), b: make('TRNSP +12', (v) => setVc(v, 'transpose', 36)),
      aLabel: '0', bLabel: '+12',
    },
    {
      id: 'detune', label: 'Detune', pattern: 'long', expect: 'B beats slowly (two carriers apart), A is clean',
      a: make('DETUNE 0', (v) => { setVc(v, 'algorithm', 31); setOp(v, 2, 'outputLevel', 99) }),
      b: make('DETUNE 7', (v) => { setVc(v, 'algorithm', 31); setOp(v, 2, 'outputLevel', 99); setOp(v, 2, 'detune', 14); setOp(v, 1, 'detune', 0) }),
      aLabel: 'detune 0', bLabel: '−7 / +7',
    },
    {
      id: 'fine', label: 'Fine frequency', pattern: 'one', expect: 'B is a fifth above A (ratio 1.50)',
      a: make('FINE 0'), b: make('FINE 50', (v) => setOp(v, 1, 'fine', 50)),
      aLabel: 'ratio 1.00', bLabel: 'ratio 1.50',
    },
    {
      id: 'coarseHalf', label: 'Coarse 0 (ratio 0.5)', pattern: 'one', expect: 'B is an octave below A',
      a: make('COARSE 1'), b: make('COARSE 0', (v) => setOp(v, 1, 'coarse', 0)),
      aLabel: 'ratio 1', bLabel: 'ratio 0.5',
    },
    {
      id: 'fixed', label: 'Fixed frequency', pattern: 'range', expect: 'B plays the same pitch (100 Hz) on both notes, A follows the keys',
      a: make('RATIO'), b: make('FIXED 100', (v) => { setOp(v, 1, 'oscMode', 1); setOp(v, 1, 'coarse', 2) }),
      aLabel: 'ratio', bLabel: 'fixed 100 Hz',
    },
    {
      id: 'feedback', label: 'Feedback', pattern: 'one', expect: 'B is a buzzy, saw-like tone, A a sine',
      a: make('FB 0', (v) => { setVc(v, 'algorithm', 31); setOp(v, 1, 'outputLevel', 0); setOp(v, 6, 'outputLevel', 99) }),
      b: make('FB 7', (v) => { setVc(v, 'algorithm', 31); setOp(v, 1, 'outputLevel', 0); setOp(v, 6, 'outputLevel', 99); setVc(v, 'feedback', 7) }),
      aLabel: 'feedback 0', bLabel: 'feedback 7',
    },
    {
      id: 'algorithm', label: 'Algorithm', pattern: 'one', expect: 'A (algorithm 1) is brassy, B (algorithm 32, the same operators side by side) a plain sine',
      a: make('ALG 1', modulated), b: make('ALG 32', modulated, (v) => setVc(v, 'algorithm', 31)),
      aLabel: 'algorithm 1', bLabel: 'algorithm 32',
    },
  ]
}
