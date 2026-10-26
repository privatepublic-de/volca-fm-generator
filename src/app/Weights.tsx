// The weights as one bar under the wheel: each pin takes the part of it its weight takes of the whole, in its colour
// (an instrument started from too: it weighs 1, the pins against it, as the generator has it). Drag the edge between
// two parts to give one more of the other; the rest stay as they are. Each edge is a splitter: Tab to it, arrows
// move it. The weights stay the same ones the rings on the wheel set: the heaviest is 1 (or the instrument is), the
// others in proportion. The voice is made again while an edge moves, and kept and played when it's let go.
// The bar keeps its height with or without pins, so nothing below it moves.
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { TONALITY_HUES } from '../generator/choices'
import { instrumentName, INSTRUMENTS } from '../generator/instruments'
import { audition, useApp } from './store'
import { hueOfAngle, pinLabel } from './Wheel'

/** The smallest part a pin can be squeezed to. */
const LEAST = 0.04
/** How far an arrow key moves an edge. */
const STEP = 0.02

type Part = { id: number | null; name: string; colour: string; weight: number }

export function Weights() {
  const pins = useApp((s) => s.pins)
  const instrument = useApp((s) => s.controls.instrument)
  const selected = useApp((s) => s.selectedPin)
  const { setWeights, selectPin, regenerate } = useApp.getState()
  const bar = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  const pending = useRef<Record<number, number> | null>(null)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const base = instrument ? INSTRUMENTS[instrument] : null
  const parts: Part[] = [
    ...(base ? [{ id: null, name: instrumentName(base), colour: `hsl(${TONALITY_HUES[base.family]} 85% 64%)`, weight: 1 }] : []),
    ...pins.map((p) => ({ id: p.id, name: pinLabel(p), colour: `hsl(${hueOfAngle(p.angle)} 85% 64%)`, weight: p.weight })),
  ]
  const total = parts.reduce((s, p) => s + p.weight, 0)
  const shares = parts.map((p) => p.weight / total)
  const starts = shares.map((_, i) => shares.slice(0, i).reduce((s, x) => s + x, 0))

  /** The edge after part `k` to `at` (0 to 1 along the bar), as far as it can go: a drag's once per frame (making
   *  a voice takes a few ms), a key's at once, so the next press starts from where this one went. */
  const moveEdge = (k: number, at: number, now = false) => {
    const pair = shares[k] + shares[k + 1]
    let lo = LEAST
    let hi = pair - LEAST
    // the instrument weighs 1 and a pin's weight is at most 1: no pin's part outgrows its
    if (base) {
      if (k === 0) lo = Math.max(lo, pair / 2, ...shares.slice(2))
      else { hi = Math.min(hi, shares[0]); lo = Math.max(lo, pair - shares[0]) }
    }
    if (lo > hi) return
    const next = [...shares]
    next[k] = Math.max(lo, Math.min(hi, at - starts[k]))
    next[k + 1] = pair - next[k]
    // back to weights: the heaviest (or the instrument) is 1
    const one = base ? next[0] : Math.max(...next)
    const weights: Record<number, number> = {}
    parts.forEach((p, i) => { if (p.id !== null) weights[p.id] = Math.round((next[i] / one) * 100) / 100 })
    if (now) return setWeights(weights)
    pending.current = weights
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      if (pending.current) setWeights(pending.current)
      pending.current = null
    })
  }
  /** Let go: what's pending first, then the voice is kept and played. */
  const commit = () => {
    cancelAnimationFrame(frame.current)
    frame.current = 0
    if (pending.current) setWeights(pending.current)
    pending.current = null
    regenerate(true)
    audition()
  }

  const onEdgeDown = (e: PointerEvent<HTMLElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.focus()
  }
  const onEdgeMove = (e: PointerEvent<HTMLElement>, k: number) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const r = bar.current!.getBoundingClientRect()
    moveEdge(k, (e.clientX - r.left) / r.width)
  }
  const onEdgeUp = (e: PointerEvent<HTMLElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    commit()
  }
  const EDGE_KEYS: Record<string, number> = { ArrowLeft: -STEP, ArrowDown: -STEP, ArrowRight: STEP, ArrowUp: STEP, Home: -1, End: 1 }
  const onEdgeKey = (e: KeyboardEvent, k: number) => {
    if (!(e.key in EDGE_KEYS)) return
    e.preventDefault()
    moveEdge(k, Math.max(0, Math.min(1, starts[k + 1] + EDGE_KEYS[e.key])), true)
  }
  const onEdgeKeyUp = (e: KeyboardEvent) => { if (e.key in EDGE_KEYS) commit() }

  const percent = (s: number) => `${Math.round(s * 100)} %`
  return (
    <div className={`weights${parts.length ? '' : ' weights-empty'}`} ref={bar} role="group" aria-label="Weights: each pin’s part of the whole">
      {parts.map((p, i) => (
        <div
          key={p.id ?? 'instrument'}
          className={`weights-part${p.id !== null && p.id === selected ? ' selected' : ''}${p.id === null ? ' base' : ''}`}
          style={{ left: `${starts[i] * 100}%`, width: `${shares[i] * 100}%`, '--colour': p.colour } as CSSProperties}
          title={`${p.name}: ${percent(shares[i])}${p.id === null ? ', the base' : ''}`}
          onPointerDown={() => p.id !== null && selectPin(p.id)}
        >
          {/* the name while it fits, the share while that does */}
          {shares[i] >= 0.22 && <span className="weights-name">{p.name}</span>}
          {shares[i] >= 0.1 && <span className="weights-share">{percent(shares[i])}</span>}
        </div>
      ))}
      {parts.slice(1).map((p, i) => (
        <div
          key={`edge-${p.id}`}
          className="weights-edge"
          style={{ left: `${starts[i + 1] * 100}%` }}
          role="separator"
          aria-orientation="vertical"
          tabIndex={0}
          aria-label={`Between ${parts[i].name} and ${p.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(starts[i + 1] * 100)}
          aria-valuetext={`${parts[i].name} ${percent(shares[i])}, ${p.name} ${percent(shares[i + 1])}`}
          onPointerDown={onEdgeDown}
          onPointerMove={(e) => onEdgeMove(e, i)}
          onPointerUp={onEdgeUp}
          onPointerCancel={onEdgeUp}
          onKeyDown={(e) => onEdgeKey(e, i)}
          onKeyUp={onEdgeKeyUp}
        />
      ))}
    </div>
  )
}
