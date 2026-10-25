// What a step in the session changed, in a few words: "Mutate", "Brightness ↑", "Envelope: Pad", "Pin: Bell". The
// recent-changes list names steps by this rather than by the voice's name (many voices are a "Lead").
import { mixOf, REGISTER_LABELS, SHAPE_LABELS, TONALITY_LABELS, type Pin } from '../generator/choices'
import { instrumentName, INSTRUMENTS } from '../generator/instruments'
import type { AppPin, Controls } from './store'

export interface Made {
  pins: AppPin[]
  controls: Controls
  wild: number
}

const pinName = (p: Pin) => mixOf([{ ...p, weight: 1 }]).map((m) => TONALITY_LABELS[m.tonality]).join(' / ')
const updown = (before: number, after: number) => (after > before ? '↑' : '↓')

const SLIDERS: [keyof Controls, string][] = [
  ['brightness', 'Brightness'], ['complexity', 'Complexity'], ['motion', 'Motion'], ['length', 'Length'], ['velocity', 'Velocity'],
]

/** The changes from `before` to `after`, most telling first; at most two named, the rest counted. */
export function describeChange(before: Made | undefined, after: Made): string {
  if (!before) return 'Start'
  const parts: string[] = []
  // pins: by their id, which stays with a pin while it moves
  for (const p of after.pins) {
    const old = before.pins.find((q) => q.id === p.id)
    if (!old) { parts.push(`Pin: ${pinName(p)}`); continue }
    if (pinName(old) !== pinName(p)) parts.push(`${pinName(old)} → ${pinName(p)}`)
    else if (Math.abs(old.radius - p.radius) > 0.02) parts.push(`${pinName(p)} ${p.radius > old.radius ? 'more extreme' : 'milder'}`)
    else if (Math.abs(old.angle - p.angle) > 0.5) parts.push(`${pinName(p)} moved`)
    if (Math.abs(old.weight - p.weight) > 0.01) parts.push(`${pinName(p)} ${p.weight > old.weight ? 'heavier' : 'lighter'}`)
  }
  for (const old of before.pins) if (!after.pins.some((p) => p.id === old.id)) parts.push(`Pin off: ${pinName(old)}`)
  const a = after.controls
  const b = before.controls
  if (a.instrument !== b.instrument) parts.push(a.instrument ? `Start: ${instrumentName(INSTRUMENTS[a.instrument])}` : 'Instrument off')
  if (a.shape !== b.shape) parts.push(`Envelope: ${a.shape ? SHAPE_LABELS[a.shape] : 'own'}`)
  for (const [key, label] of SLIDERS) {
    const x = a[key] as number
    const y = b[key] as number
    if (Math.abs(x - y) > 0.001) parts.push(`${label} ${updown(y, x)}`)
  }
  if (a.register !== b.register) parts.push(`Register: ${a.register ? REGISTER_LABELS[a.register] : 'own'}`)
  if (a.pitchAccent !== b.pitchAccent) parts.push(`Pitch accent ${a.pitchAccent ? 'on' : 'off'}`)
  if (Math.abs(after.wild - before.wild) > 0.001) parts.push(`Wild ${updown(before.wild, after.wild)}`)
  if (!parts.length) return 'Again'
  return parts.length > 2 ? `${parts.slice(0, 2).join(', ')} +${parts.length - 2}` : parts.join(', ')
}
