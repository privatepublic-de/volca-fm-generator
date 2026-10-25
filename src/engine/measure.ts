// What a rendered sound measures (PLAN §4.5): loudness, pitch, brightness, noisiness, attack and decay.
// Plain functions over samples, used by the tests and later by the generator's checks and docs/SOUND.md.

export interface Segment {
  samples: Float32Array
  sampleRate: number
}

/** The part between two times, in seconds. */
export function slice({ samples, sampleRate }: Segment, from: number, to: number): Segment {
  return { samples: samples.subarray(Math.round(from * sampleRate), Math.round(to * sampleRate)), sampleRate }
}

export function rms({ samples }: Segment): number {
  let sum = 0
  for (const x of samples) sum += x * x
  return samples.length ? Math.sqrt(sum / samples.length) : 0
}

export function peak({ samples }: Segment): number {
  let p = 0
  for (const x of samples) p = Math.max(p, Math.abs(x))
  return p
}

export const toDb = (x: number) => 20 * Math.log10(Math.max(x, 1e-12))

/** The fundamental in Hz, by autocorrelation between 30 Hz and 4 kHz (the strongest period, refined). */
export function pitch({ samples, sampleRate }: Segment): number {
  const n = Math.min(samples.length, 8192)
  const x = samples.subarray(0, n)
  const minLag = Math.floor(sampleRate / 4000)
  const maxLag = Math.min(n >> 1, Math.ceil(sampleRate / 30))
  const ac = (lag: number) => {
    let s = 0
    for (let i = 0; i + lag < n; i++) s += x[i] * x[i + lag]
    return s / (n - lag)
  }
  const zero = ac(0)
  if (!zero) return 0
  const values = new Float64Array(maxLag + 2)
  for (let lag = minLag; lag <= maxLag + 1; lag++) values[lag] = ac(lag)
  // the first lag that comes within 90 % of the best: the period rather than a multiple of it
  let best = minLag
  for (let lag = minLag; lag <= maxLag; lag++) if (values[lag] > values[best]) best = lag
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (values[lag] >= 0.9 * values[best] && values[lag] >= values[lag - 1] && values[lag] >= values[lag + 1]) { best = lag; break }
  }
  const a = values[best - 1]
  const b = values[best]
  const c = values[best + 1]
  const shift = a - 2 * b + c ? (0.5 * (a - c)) / (a - 2 * b + c) : 0
  return sampleRate / (best + shift)
}

/** How periodic: the strongest normalized autocorrelation for a period between 50 Hz and 2 kHz, 1 for a steady
 *  harmonic tone, lower for inharmonic sounds (bells, metal), near 0 for noise. */
export function periodicity({ samples, sampleRate }: Segment): number {
  const n = Math.min(samples.length, 8192)
  const x = samples.subarray(0, n)
  const norm = (lag: number) => {
    let s = 0
    let a = 0
    let b = 0
    for (let i = 0; i + lag < n; i++) { s += x[i] * x[i + lag]; a += x[i] * x[i]; b += x[i + lag] * x[i + lag] }
    return a && b ? s / Math.sqrt(a * b) : 0
  }
  let best = 0
  for (let lag = Math.floor(sampleRate / 2000); lag <= Math.ceil(sampleRate / 50) && lag < n / 2; lag++) best = Math.max(best, norm(lag))
  return best
}

/** Magnitude spectrum of a Hann window over the first 2^k samples (k ≤ 14). */
export function spectrum({ samples, sampleRate }: Segment): { magnitudes: Float64Array; binHz: number } {
  let size = 1
  while (size * 2 <= Math.min(samples.length, 16384)) size *= 2
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  for (let i = 0; i < size; i++) re[i] = samples[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)))
  fft(re, im)
  const magnitudes = new Float64Array(size / 2)
  for (let i = 0; i < size / 2; i++) magnitudes[i] = Math.hypot(re[i], im[i])
  return { magnitudes, binHz: sampleRate / size }
}

/** Brightness: the spectrum's centre of mass, in Hz. */
export function centroid(seg: Segment, spec = spectrum(seg)): number {
  const { magnitudes, binHz } = spec
  let sum = 0
  let weighted = 0
  for (let i = 1; i < magnitudes.length; i++) { sum += magnitudes[i]; weighted += magnitudes[i] * i * binHz }
  return sum ? weighted / sum : 0
}

/** Noisiness: spectral flatness, 0 (pure tones) … 1 (white noise), over 50 Hz … 12 kHz. */
export function flatness(seg: Segment, spec = spectrum(seg)): number {
  const { magnitudes, binHz } = spec
  let logSum = 0
  let sum = 0
  let n = 0
  for (let i = Math.ceil(50 / binHz); i < Math.min(magnitudes.length, 12000 / binHz); i++) {
    const p = magnitudes[i] ** 2 + 1e-20
    logSum += Math.log(p)
    sum += p
    n++
  }
  return n ? Math.exp(logSum / n) / (sum / n) : 0
}

/** Loudness over time: RMS in windows of `windowSeconds`. */
export function envelope({ samples, sampleRate }: Segment, windowSeconds = 0.005): Float64Array {
  const w = Math.max(1, Math.round(windowSeconds * sampleRate))
  const out = new Float64Array(Math.floor(samples.length / w))
  for (let k = 0; k < out.length; k++) {
    let s = 0
    for (let i = k * w; i < (k + 1) * w; i++) s += samples[i] * samples[i]
    out[k] = Math.sqrt(s / w)
  }
  return out
}

/** Seconds until the loudness first reaches 90 % of its maximum. */
export function attackTime(seg: Segment, windowSeconds = 0.005): number {
  const env = envelope(seg, windowSeconds)
  const max = Math.max(...env)
  return env.findIndex((x) => x >= 0.9 * max) * windowSeconds
}

/** Seconds from the loudest point until 20 dB below it (Infinity: never, within the segment). */
export function decayTime(seg: Segment, windowSeconds = 0.005): number {
  const env = envelope(seg, windowSeconds)
  let top = 0
  for (let i = 1; i < env.length; i++) if (env[i] > env[top]) top = i
  const k = env.findIndex((x, i) => i > top && x < env[top] / 10)
  return k < 0 ? Infinity : (k - top) * windowSeconds
}

/** In place, radix 2. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
        re[i + k + len / 2] = re[i + k] - ar
        im[i + k + len / 2] = im[i + k] - ai
        re[i + k] += ar
        im[i + k] += ai
        const t = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = t
      }
    }
  }
}
