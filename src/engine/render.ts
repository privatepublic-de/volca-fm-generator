// Offline rendering: a voice played as one note, for tests and measures (PLAN §4.5). No clipping here; the
// AudioWorklet's soft clip is for the speakers only.
import type { Voice } from '../dx7/voice'
import { MODELS, type ModelProfile } from './models'
import { Synth } from './synth'

export interface RenderOptions {
  note?: number
  velocity?: number
  /** how long the key is held */
  holdSeconds?: number
  /** how long it is rendered after the key is released */
  releaseSeconds?: number
  sampleRate?: number
  profile?: ModelProfile
}

export function renderNote(v: Voice, { note = 60, velocity = 100, holdSeconds = 1, releaseSeconds = 0, sampleRate = 48000, profile = MODELS.fm2 }: RenderOptions = {}): Float32Array {
  const synth = new Synth(sampleRate, v, profile)
  const hold = Math.round(holdSeconds * sampleRate)
  const out = new Float32Array(hold + Math.round(releaseSeconds * sampleRate))
  synth.noteOn(note, velocity)
  synth.render(out, 0, hold)
  synth.noteOff(note)
  synth.render(out, hold)
  return out
}
