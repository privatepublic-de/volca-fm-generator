// The engine as the page sees it: an AudioWorklet node running synth.ts, talked to by messages.
import type { Voice } from '../dx7/voice'
import { Effects, type EffectLevels } from './effects'
import { PROCESSOR_NAME, type EngineMessage } from './messages'
import type { Model } from './models'
// bundled into one plain script, so it loads in the build as in dev
import workletUrl from './worklet.ts?worker&url'

export class BrowserEngine {
  private constructor(readonly context: AudioContext, private readonly node: AudioWorkletNode, readonly analyser: AnalyserNode, private readonly effects: Effects) {}

  /** Call from a click or key press: browsers start audio only after one. */
  static async start(): Promise<BrowserEngine> {
    const context = new AudioContext({ latencyHint: 'interactive' })
    await context.audioWorklet.addModule(workletUrl)
    const node = new AudioWorkletNode(context, PROCESSOR_NAME, { numberOfInputs: 0, outputChannelCount: [2] })
    const analyser = context.createAnalyser()
    analyser.fftSize = 2048
    // synth → chorus → (dry + reverb) → speakers; the scope shows the synth alone
    const effects = new Effects(context)
    node.connect(analyser)
    // an analyser that leads nowhere isn't processed: it goes to the speakers through silence
    const silent = context.createGain()
    silent.gain.value = 0
    analyser.connect(silent).connect(context.destination)
    node.connect(effects.input)
    effects.output.connect(context.destination)
    effects.reverbReturn.connect(context.destination)
    await context.resume()
    return new BrowserEngine(context, node, analyser, effects)
  }

  private post(m: EngineMessage) {
    this.node.port.postMessage(m)
  }

  setVoice(v: Voice) { this.post({ type: 'voice', bytes: Uint8Array.from(v) }) }
  noteOn(note: number, velocity = 100) { this.post({ type: 'noteOn', note, velocity }) }
  noteOff(note: number) { this.post({ type: 'noteOff', note }) }
  allNotesOff() { this.post({ type: 'allNotesOff' }) }
  setModel(model: Model) { this.post({ type: 'model', model }) }
  setGain(gain: number) { this.post({ type: 'gain', gain }) }
  setEffects(levels: EffectLevels) { this.effects.set(levels) }
}
