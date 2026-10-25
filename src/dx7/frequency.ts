// An operator's frequency as numbers and as bytes. Ratio = coarse × (1 + fine/100), coarse 0 = 0.5;
// fixed = 10^(coarse & 3 + fine/100) Hz (synth.ts opLogFreq).
import { getOp, setOp, type Voice } from './voice'

/** The closest coarse/fine to a ratio (0.5 … 31 × 1.99). */
export function ratioBytes(ratio: number): [coarse: number, fine: number] {
  const r = Math.max(0.5, Math.min(61.69, ratio))
  if (r < 1) return [0, Math.round((r / 0.5 - 1) * 100)]
  // the coarse that leaves the smallest fine error; a ratio above 31.99 needs coarse 31 with a large fine
  const coarse = Math.min(31, Math.floor(r))
  return [coarse, Math.min(99, Math.round((r / coarse - 1) * 100))]
}

export function ratioOf(coarse: number, fine: number): number {
  return (coarse === 0 ? 0.5 : coarse) * (1 + fine / 100)
}

export function fixedBytes(hz: number): [coarse: number, fine: number] {
  const l = Math.log10(Math.max(1, Math.min(9772, hz)))
  const coarse = Math.min(3, Math.floor(l))
  return [coarse, Math.min(99, Math.round((l - coarse) * 100))]
}

export function setRatio(v: Voice, op: number, ratio: number) {
  const [coarse, fine] = ratioBytes(ratio)
  setOp(v, op, 'oscMode', 0)
  setOp(v, op, 'coarse', coarse)
  setOp(v, op, 'fine', fine)
}

export function setFixed(v: Voice, op: number, hz: number) {
  const [coarse, fine] = fixedBytes(hz)
  setOp(v, op, 'oscMode', 1)
  setOp(v, op, 'coarse', coarse)
  setOp(v, op, 'fine', fine)
}

/** The ratio, or null for a fixed frequency. */
export function opRatio(v: Voice, op: number): number | null {
  return getOp(v, op, 'oscMode') ? null : ratioOf(getOp(v, op, 'coarse'), getOp(v, op, 'fine'))
}
