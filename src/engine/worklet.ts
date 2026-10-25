/// <reference path="./worklet-globals.d.ts" />
// The engine in the audio thread: the synth, a master gain and a soft clip for the speakers.
import { initVoice } from '../dx7/voice'
import { PROCESSOR_NAME, type EngineMessage } from './messages'
import { MODELS } from './models'
import { Synth } from './synth'

class Dx7Processor extends AudioWorkletProcessor {
  private synth = new Synth(sampleRate, initVoice())
  private gain = 2

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<EngineMessage>) => {
      const m = e.data
      switch (m.type) {
        case 'voice': this.synth.setVoice(m.bytes); break
        case 'noteOn': this.synth.noteOn(m.note, m.velocity); break
        case 'noteOff': this.synth.noteOff(m.note); break
        case 'allNotesOff': this.synth.allNotesOff(); break
        case 'reset': this.synth.reset(); break
        case 'model': this.synth.setProfile(MODELS[m.model]); break
        case 'gain': this.gain = m.gain; break
      }
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0]
    const left = out[0]
    if (!left) return true
    this.synth.render(left)
    for (let i = 0; i < left.length; i++) left[i] = Math.tanh(left[i] * this.gain)
    for (let c = 1; c < out.length; c++) out[c].set(left)
    return true
  }
}

registerProcessor(PROCESSOR_NAME, Dx7Processor)
