import { describe, expect, it } from 'vitest'
import { initVoice, setOp, setVc, type Voice } from '../src/dx7/voice'
import { attackTime, centroid, decayTime, flatness, pitch, rms, slice, toDb, type Segment } from '../src/engine/measure'
import { MODELS } from '../src/engine/models'
import { renderNote, type RenderOptions } from '../src/engine/render'
import { opLogFreq, Synth } from '../src/engine/synth'
import { lfoHz } from '../src/engine/tables'

const SR = 48000
const play = (v: Voice, o: RenderOptions = {}): Segment => ({ samples: renderNote(v, { sampleRate: SR, ...o }), sampleRate: SR })
/** The steady part of a held note. */
const steady = (s: Segment) => slice(s, 0.4, 0.9)
const voice = (...edits: ((v: Voice) => void)[]) => {
  const v = initVoice()
  for (const e of edits) e(v)
  return v
}
const C4 = 261.626

describe('frequency', () => {
  it('INIT VOICE plays C4 as a sine', () => {
    const s = steady(play(initVoice()))
    expect(pitch(s)).toBeCloseTo(C4, 0)
    expect(flatness(s)).toBeLessThan(0.01)
    expect(centroid(s)).toBeLessThan(C4 * 1.3)
  })

  it('coarse, fine, transpose and fixed frequency', () => {
    expect(pitch(steady(play(voice((v) => setOp(v, 1, 'coarse', 0)))))).toBeCloseTo(C4 / 2, 0)
    expect(pitch(steady(play(voice((v) => setOp(v, 1, 'fine', 50)))))).toBeCloseTo(C4 * 1.5, 0)
    expect(pitch(steady(play(voice((v) => setVc(v, 'transpose', 36)))))).toBeCloseTo(C4 * 2, 0)
    const fixed = voice((v) => { setOp(v, 1, 'oscMode', 1); setOp(v, 1, 'coarse', 2) })
    expect(pitch(steady(play(fixed, { note: 36 })))).toBeCloseTo(100, 0)
    expect(pitch(steady(play(fixed, { note: 84 })))).toBeCloseTo(100, 0)
  })

  it('detune moves by about a cent per step', () => {
    const cents = (opLogFreq(60, 0, 1, 0, 14) - opLogFreq(60, 0, 1, 0, 7)) * 1200
    expect(cents).toBeGreaterThan(4)
    expect(cents).toBeLessThan(12)
  })
})

describe('levels', () => {
  const loud = (v: Voice, o: RenderOptions = {}) => rms(steady(play(v, o)))

  it('output level: 0.75 dB per step above 20, silence at 0', () => {
    const at = (l: number) => loud(voice((v) => setOp(v, 1, 'outputLevel', l)))
    expect(toDb(at(98)) - toDb(at(99))).toBeCloseTo(-0.75, 1)
    expect(toDb(at(89)) - toDb(at(99))).toBeCloseTo(-7.5, 1)
    expect(at(0)).toBeLessThan(1e-4)
  })

  it('INIT VOICE is a single carrier at the reference loudness', () => {
    // a sine at gain 2/16: RMS 0.125 / √2
    expect(loud(initVoice())).toBeCloseTo(0.125 / Math.SQRT2, 2)
  })

  it('velocity sensitivity: softer when soft, only with sensitivity', () => {
    const sens = voice((v) => setOp(v, 1, 'velocitySens', 7))
    expect(toDb(loud(sens, { velocity: 127 })) - toDb(loud(sens, { velocity: 20 }))).toBeGreaterThan(10)
    expect(loud(initVoice(), { velocity: 20 })).toBeCloseTo(loud(initVoice(), { velocity: 127 }), 4)
  })

  it('the volca fm plays every note at the same velocity', () => {
    const sens = voice((v) => setOp(v, 1, 'velocitySens', 7))
    expect(loud(sens, { velocity: 20, profile: MODELS.fm })).toBeCloseTo(loud(sens, { velocity: 127, profile: MODELS.fm }), 4)
  })

  it('keyboard level scaling lowers the high notes', () => {
    const scaled = voice((v) => { setOp(v, 1, 'rightDepth', 99); setOp(v, 1, 'rightCurve', 0) })
    expect(toDb(loud(scaled, { note: 84 })) - toDb(loud(scaled, { note: 36 }))).toBeLessThan(-20)
  })
})

describe('modulation', () => {
  it('a deeper modulator is brighter, step by step', () => {
    const c = [0, 50, 70, 85, 99].map((l) => centroid(steady(play(voice((v) => setOp(v, 2, 'outputLevel', l))))))
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThan(c[i - 1])
    expect(c[4]).toBeGreaterThan(c[0] * 4)
  })

  it('feedback makes a lone carrier brighter, and at full level 7 turns to noise', () => {
    const fb = (f: number) => voice((v) => { setVc(v, 'algorithm', 31); setOp(v, 1, 'outputLevel', 0); setOp(v, 6, 'outputLevel', 99); setVc(v, 'feedback', f) })
    const c = [0, 3, 4, 5].map((f) => centroid(steady(play(fb(f)))))
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThan(c[i - 1])
    expect(flatness(steady(play(fb(7))))).toBeGreaterThan(flatness(steady(play(fb(4)))) * 10)
  })

  it('the feedback loops of algorithms 4 and 6 do something', () => {
    // algorithm 4: the stack 6 → 5 → 4 with carrier OP4 feeding back into OP6
    const loop = (f: number) => voice((v) => {
      setVc(v, 'algorithm', 3); setOp(v, 1, 'outputLevel', 0)
      setOp(v, 4, 'outputLevel', 99); setOp(v, 5, 'outputLevel', 60); setOp(v, 6, 'outputLevel', 60); setVc(v, 'feedback', f)
    })
    expect(centroid(steady(play(loop(7))))).not.toBeCloseTo(centroid(steady(play(loop(0)))), -1)
  })

  it('pitch EG: starts far above the note and falls to it', () => {
    const drop = voice((v) => { setVc(v, 'pitchLevel4', 99); setVc(v, 'pitchRate1', 50) })
    const s = play(drop, { holdSeconds: 3 })
    expect(pitch(slice(s, 0, 0.05))).toBeGreaterThan(C4 * 4)
    expect(pitch(slice(s, 2.5, 2.9))).toBeCloseTo(C4, 0)
  })

  it('LFO pitch modulation wobbles at the LFO rate', () => {
    const vib = voice((v) => { setVc(v, 'lfoSpeed', 30); setVc(v, 'lfoPitchDepth', 60); setVc(v, 'pitchModSens', 7) })
    const s = play(vib, { holdSeconds: 2 })
    const hz = lfoHz(30)
    // pitch in short windows; its highest and lowest a half LFO cycle apart
    const window = 0.03
    const pitches: number[] = []
    for (let t = 0.2; t < 1.8; t += window) pitches.push(pitch(slice(s, t, t + window)))
    expect(Math.max(...pitches) / Math.min(...pitches)).toBeGreaterThan(1.1)
    // crossings of the middle pitch, two per LFO cycle
    const mid = (Math.max(...pitches) + Math.min(...pitches)) / 2
    let crossings = 0
    for (let i = 1; i < pitches.length; i++) if ((pitches[i - 1] - mid) * (pitches[i] - mid) < 0) crossings++
    expect(crossings / 2 / 1.6).toBeCloseTo(hz, 0)
  })

  it('LFO delay: steady at first, then the vibrato fades in', () => {
    const vib = voice((v) => { setVc(v, 'lfoSpeed', 40); setVc(v, 'lfoPitchDepth', 60); setVc(v, 'pitchModSens', 7); setVc(v, 'lfoDelay', 60) })
    const s = play(vib, { holdSeconds: 4 })
    const spread = (from: number, to: number) => {
      const p: number[] = []
      for (let t = from; t < to; t += 0.03) p.push(pitch(slice(s, t, t + 0.03)))
      return Math.max(...p) / Math.min(...p)
    }
    expect(spread(0.05, 0.4)).toBeLessThan(1.01)
    expect(spread(3, 3.9)).toBeGreaterThan(1.1)
  })

  it('LFO amplitude modulation pulses only with sensitivity', () => {
    const trem = (ams: number) => voice((v) => { setOp(v, 1, 'ampModSens', ams); setVc(v, 'lfoSpeed', 30); setVc(v, 'lfoAmpDepth', 99) })
    const spread = (v: Voice) => {
      const s = play(v, { holdSeconds: 2 })
      const levels: number[] = []
      for (let t = 0.2; t < 1.8; t += 0.02) levels.push(rms(slice(s, t, t + 0.02)))
      return toDb(Math.max(...levels)) - toDb(Math.min(...levels))
    }
    expect(spread(trem(3))).toBeGreaterThan(6)
    expect(spread(trem(0))).toBeLessThan(0.5)
  })
})

describe('envelopes', () => {
  const pluck = (...edits: ((v: Voice) => void)[]) => voice((v) => { setOp(v, 1, 'rate2', 45); setOp(v, 1, 'level2', 0); setOp(v, 1, 'level3', 0) }, ...edits)

  it('a pluck decays, a held organ doesn’t', () => {
    expect(decayTime(play(pluck(), { holdSeconds: 3 }))).toBeLessThan(2.5)
    expect(decayTime(play(initVoice(), { holdSeconds: 2 }))).toBe(Infinity)
  })

  it('rate scaling: the high note decays faster', () => {
    const v = pluck((x) => setOp(x, 1, 'rateScaling', 7))
    expect(decayTime(play(v, { note: 84, holdSeconds: 3 }))).toBeLessThan(decayTime(play(v, { note: 36, holdSeconds: 3 })) * 0.6)
  })

  it('a slow attack takes time, rate 99 is immediate', () => {
    expect(attackTime(play(initVoice()))).toBeLessThan(0.01)
    expect(attackTime(play(voice((v) => setOp(v, 1, 'rate1', 40)), { holdSeconds: 3 }))).toBeGreaterThan(0.2)
  })

  it('release fades after the key, and the note ends', () => {
    const v = voice((x) => setOp(x, 1, 'rate4', 60))
    const s = play(v, { holdSeconds: 0.5, releaseSeconds: 2 })
    expect(rms(slice(s, 0.3, 0.5))).toBeGreaterThan(0.05)
    expect(rms(slice(s, 2.2, 2.5))).toBeLessThan(1e-3)
  })
})

describe('the synth', () => {
  it('renders the same twice', () => {
    const v = voice((x) => { setOp(x, 2, 'outputLevel', 80); setVc(x, 'feedback', 5); setVc(x, 'lfoWave', 5); setVc(x, 'lfoPitchDepth', 30) })
    expect(play(v).samples).toEqual(play(v).samples)
  })

  it('sounds the same at 44.1 and 48 kHz', () => {
    const v = voice((x) => { setOp(x, 2, 'outputLevel', 80); setOp(x, 1, 'rate2', 50); setOp(x, 1, 'level3', 0); setOp(x, 1, 'level2', 0) })
    const at = (sr: number) => ({ samples: renderNote(v, { sampleRate: sr, holdSeconds: 2 }), sampleRate: sr })
    const [a, b] = [at(44100), at(48000)]
    expect(decayTime(a) / decayTime(b)).toBeCloseTo(1, 1)
    expect(centroid(slice(a, 0.05, 0.25)) / centroid(slice(b, 0.05, 0.25))).toBeCloseTo(1, 1)
  })

  it('plays as many notes as the model has voices, stealing the oldest', () => {
    const s = new Synth(SR, initVoice(), MODELS.fm)
    for (const n of [60, 62, 64, 65]) s.noteOn(n)
    expect(s.activeNotes).toBe(3)
    s.setProfile(MODELS.fm2)
    for (const n of [67, 69, 71]) s.noteOn(n)
    expect(s.activeNotes).toBe(6)
  })
})
