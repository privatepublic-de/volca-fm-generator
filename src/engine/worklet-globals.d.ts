// The AudioWorkletGlobalScope, which lib.dom doesn't describe. Once compiled these are global for every file
// (sampleRate too): use them only in worklet.ts.
declare const sampleRate: number

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(options?: unknown)
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean
}

declare function registerProcessor(name: string, processor: new (options?: unknown) => AudioWorkletProcessor): void
