// What the page tells the engine's AudioWorklet.
import type { Model } from './models'

export type EngineMessage =
  | { type: 'voice'; bytes: Uint8Array }
  | { type: 'noteOn'; note: number; velocity: number }
  | { type: 'noteOff'; note: number }
  | { type: 'allNotesOff' }
  | { type: 'reset' }
  | { type: 'model'; model: Model }
  | { type: 'gain'; gain: number }

export const PROCESSOR_NAME = 'dx7-synth'
