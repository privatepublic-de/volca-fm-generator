// The browser's stand-in for the volca's chorus and reverb, after the synth: a stereo chorus (two delays swept by
// slow LFOs, one per side) and a reverb (a convolution with a generated decaying-noise tail). Not a model of the
// fm2's effects, only close enough that the browser's sound follows the dials.

export interface EffectLevels {
  /** 0 … 1 */
  chorus: number
  /** 0 … 1 */
  reverb: number
}

export class Effects {
  readonly input: GainNode
  readonly output: GainNode
  private readonly chorusWet: GainNode
  private readonly reverbSend: GainNode

  constructor(private readonly context: AudioContext) {
    const c = context
    this.input = c.createGain()
    this.output = c.createGain()
    this.input.connect(this.output)

    // chorus: per side a delay of 12 or 17 ms swept ±3 ms at 0.6 / 0.83 Hz, panned apart
    this.chorusWet = c.createGain()
    this.chorusWet.gain.value = 0
    const merger = c.createChannelMerger(2)
    ;[[0.012, 0.6, 0], [0.017, 0.83, 1]].forEach(([delay, rate, side]) => {
      const d = c.createDelay(0.05)
      d.delayTime.value = delay
      const lfo = c.createOscillator()
      lfo.frequency.value = rate
      const depth = c.createGain()
      depth.gain.value = 0.003
      lfo.connect(depth).connect(d.delayTime)
      lfo.start()
      this.input.connect(d)
      d.connect(merger, 0, side)
    })
    merger.connect(this.chorusWet).connect(this.output)

    // reverb: sent from after the chorus, as on a volca (chorus, then reverb)
    this.reverbSend = c.createGain()
    this.reverbSend.gain.value = 0
    const convolver = c.createConvolver()
    convolver.buffer = impulse(c, 2.6)
    this.output.connect(this.reverbSend).connect(convolver)
    // the reverb's own return joins after the output node, so it isn't sent to itself
    this.reverbReturn = convolver
  }

  /** Where the reverb comes back: connect it next to `output`. */
  readonly reverbReturn: AudioNode

  set({ chorus, reverb }: EffectLevels) {
    const now = this.context.currentTime
    this.chorusWet.gain.setTargetAtTime(Math.max(0, Math.min(1, chorus)) * 0.8, now, 0.03)
    this.reverbSend.gain.setTargetAtTime(Math.max(0, Math.min(1, reverb)) * 0.9, now, 0.03)
  }
}

/** Stereo noise decaying by 60 dB over `seconds`, a few ms in: a plain hall. */
function impulse(c: AudioContext, seconds: number): AudioBuffer {
  const length = Math.round(seconds * c.sampleRate)
  const buffer = c.createBuffer(2, length, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    let seed = ch ? 0x9e3779b9 : 0x2545f491
    for (let i = 0; i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      const t = i / c.sampleRate
      data[i] = t < 0.008 ? 0 : (seed / 2 ** 32 * 2 - 1) * 10 ** ((-3 * t) / seconds) * 0.35
    }
  }
  return buffer
}
