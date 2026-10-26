// The wheel (PLAN §6.1): the twelve tonalities as a colour field, pins on it. The names on the rim are labels only (a
// click near them shouldn't pin anything: the bottom one sits right above the weights bar). Click the field to pin, drag a pin to
// move it (towards the rim: more extreme), drag it off the wheel to take it away. The ring around a pin is a dial
// for its weight: turn it (or scroll on the pin). An instrument to start from shows as a marker at its tonality,
// not a pin: it doesn't change the sound or take a pin's place; click it to choose another, drag it off to remove it.
// The centre makes a new voice. Pins can be moved with the keyboard too.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { SECTOR, TONALITIES, TONALITY_HINTS, TONALITY_HUES, TONALITY_LABELS, angleOf, mixOf } from '../generator/choices'
import { voiceName } from '../dx7/voice'
import { instrumentName, INSTRUMENTS } from '../generator/instruments'
import { audition, MAX_PINS, useApp, type AppPin } from './store'

/** The centre button's radius; pins live between it and the rim. */
const CENTRE = 0.22
/** Dragged further out than this, a pin is taken away on release. */
const REMOVE_AT = 1.16
const VIEW = 1.3
/** The names' radius: just outside the rim, centred on it by their middle */
const LABEL_R = 1.1

/** The innermost a pin sits (mild), clear of the centre button. */
const INNER = CENTRE + 0.11
const toRadius = (intensity: number) => INNER + intensity * (1 - INNER)
const toIntensity = (r: number) => Math.max(0, Math.min(1, (r - INNER) / (1 - INNER)))
const polar = (angle: number, r: number) => {
  const a = (angle * Math.PI) / 180
  return { x: r * Math.sin(a), y: -r * Math.cos(a) }
}
export const hueOfAngle = (angle: number) => {
  const m = mixOf([{ angle, radius: 1, weight: 1 }])
  // between two tonalities: the hue of the larger share (hues don't average well across the red end)
  return TONALITY_HUES[m[0].tonality]
}
/** A tonality's colour for text, as bright as the others: blues and violets look darker than yellows at the same
 *  HSL lightness, so each hue gets the lightness that gives the same luminance. */
export function rimColour(hue: number): string {
  const luminance = (l: number) => {
    // hsl(hue 70% l) to linear RGB, then relative luminance
    const s = 0.7
    const k = (n: number) => (n + hue / 30) % 12
    const a = s * Math.min(l, 1 - l)
    const [r, g, b] = [0, 8, 4].map((n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  }
  let lo = 0.4
  let hi = 0.95
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (luminance(mid) < 0.42) lo = mid
    else hi = mid
  }
  return `hsl(${hue} 70% ${Math.round(lo * 1000) / 10}%)`
}

/** Mild near the centre, extreme at the rim. */
export const intensityWord = (radius: number) => (radius < 0.34 ? 'mild' : radius > 0.67 ? 'extreme' : 'typical')
export const pinLabel = (p: AppPin) => mixOf([{ ...p, weight: 1 }]).map((m) => TONALITY_LABELS[m.tonality]).join(' / ')
/** What the pin's tonalities sound like, for a tooltip: one line each. */
export const pinHint = (p: AppPin) => mixOf([{ ...p, weight: 1 }]).map((m) => `${TONALITY_LABELS[m.tonality]}: ${TONALITY_HINTS[m.tonality]}`).join('\n')

/** The field: each tonality's hue at its angle, pale and dim at the centre (mild), full at the rim (extreme). */
export const FIELD = `conic-gradient(${[...TONALITIES, TONALITIES[0]].map((t, i) => `hsl(${TONALITY_HUES[t]} 72% 56%) ${i * SECTOR}deg`).join(', ')})`

export function Wheel() {
  const pins = useApp((s) => s.pins)
  const selected = useApp((s) => s.selectedPin)
  const voice = useApp((s) => s.voice)
  const generated = useApp((s) => s.generated)
  const { addPin, movePin, setWeight, removePin, selectPin, regenerate, generateNew } = useApp.getState()
  const svg = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ id: number; removing: boolean; weight?: boolean; base?: boolean } | null>(null)
  const instrument = useApp((s) => s.controls.instrument)
  const base = instrument ? INSTRUMENTS[instrument] : null
  const basePlace = base ? polar(angleOf(base.family), toRadius(0.5)) : null
  /** the base marker while it is dragged: where it is, and whether it moved at all (else it was a click) */
  const [baseDrag, setBaseDrag] = useState<{ x: number; y: number; moved: boolean } | null>(null)
  const pending = useRef<{ id: number; angle: number; radius: number } | null>(null)
  const frame = useRef(0)

  const maxWeight = Math.max(0.0001, ...pins.map((p) => p.weight))
  const dominantHue = generated ? TONALITY_HUES[generated.roles[0].tonality] : pins.length ? hueOfAngle(pins[0].angle) : 260

  /** Where a pointer is, in wheel units (the rim is 1). */
  const at = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 2 * VIEW - VIEW
    const y = ((e.clientY - r.top) / r.height) * 2 * VIEW - VIEW
    return { angle: ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360, dist: Math.hypot(x, y), x, y }
  }

  /** Moves are applied once per frame: generating takes ~12 ms. */
  const schedule = (id: number, angle: number, radius: number) => {
    pending.current = { id, angle, radius }
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const p = pending.current
      if (p) movePin(p.id, p.angle, p.radius)
    })
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const snapped = (angle: number, shift: boolean) => (shift ? Math.round(angle / SECTOR) * SECTOR % 360 : angle)

  const onFieldDown = (e: PointerEvent<SVGElement>) => {
    const { angle, dist } = at(e)
    if (dist < CENTRE || dist > 1.02) return
    const id = addPin(snapped(angle, e.shiftKey), toIntensity(dist))
    if (id === null) return
    svg.current!.setPointerCapture(e.pointerId)
    setDrag({ id, removing: false })
  }

  const onPinDown = (e: PointerEvent<SVGElement>, id: number) => {
    e.stopPropagation()
    svg.current!.setPointerCapture(e.pointerId)
    selectPin(id)
    setDrag({ id, removing: false })
  }

  /** The ring is a dial: the weight is where the pointer is around the pin, clockwise from the top (it stops at
   *  either end rather than wrapping round). */
  const onDialDown = (e: PointerEvent<SVGElement>, id: number) => {
    e.stopPropagation()
    svg.current!.setPointerCapture(e.pointerId)
    selectPin(id)
    setDrag({ id, removing: false, weight: true })
  }
  const turnDial = (id: number, x: number, y: number) => {
    const p = useApp.getState().pins.find((q) => q.id === id)
    if (!p) return
    const c = polar(p.angle, toRadius(p.radius))
    const turn = (((Math.atan2(x - c.x, -(y - c.y)) * 180) / Math.PI + 360) % 360) / 360
    // past the top in either direction: stay at the end it came from
    const weight = Math.abs(turn - p.weight) > 0.5 ? (p.weight > 0.5 ? 1 : 0.05) : turn
    const stepped = Math.max(0.05, Math.round(weight * 20) / 20)
    if (stepped !== p.weight) setWeight(id, stepped)
  }

  const onBaseDown = (e: PointerEvent<SVGElement>) => {
    e.stopPropagation()
    svg.current!.setPointerCapture(e.pointerId)
    setDrag({ id: -1, removing: false, base: true })
    setBaseDrag(null)
  }

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const { angle, dist, x, y } = at(e)
    if (drag?.base) {
      const moved = baseDrag?.moved || Math.hypot(x - basePlace!.x, y - basePlace!.y) > 0.06
      setBaseDrag({ x, y, moved })
      const removing = dist > REMOVE_AT
      if (removing !== drag.removing) setDrag({ ...drag, removing })
      setTip({ ...tipAt(e), text: removing ? 'Release to remove the instrument' : 'Off the wheel to remove' })
      return
    }
    if (drag?.weight) {
      turnDial(drag.id, x, y)
      const p = useApp.getState().pins.find((q) => q.id === drag.id)
      if (p) setTip({ ...tipAt(e), text: `Weight ${Math.round(p.weight * 100)} %` })
      return
    }
    if (drag) {
      const removing = dist > REMOVE_AT
      if (removing !== drag.removing) setDrag({ ...drag, removing })
      // while a pin is dragged, only the one thing a release would do that isn't plain to see
      setTip(removing ? { ...tipAt(e), text: 'Release to remove' } : null)
      if (!removing) schedule(drag.id, snapped(angle, e.shiftKey), toIntensity(dist))
      return
    }
    const target = e.target as Element
    restTip(e, target.closest('g.base-marker') && base
      ? `${instrumentName(base)}, the base (${TONALITY_LABELS[base.family]}): click for another, drag off to remove`
      : tipText(e, angle, dist, target.closest('g.pin') !== null, target.classList.contains('pin-dial')))
  }

  /** A label for what a click or a drag here would do. Like a classic tooltip: it appears where the pointer rests,
   *  stays put, and goes as soon as the pointer moves on; working on the wheel, you don't see it. While dragging,
   *  only what the drag itself needs (a weight, a removal) shows, at once. */
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const resting = useRef(0)
  const tipAt = (e: PointerEvent<SVGSVGElement>) => {
    const box = svg.current!.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }
  const restTip = (e: PointerEvent<SVGSVGElement>, text: string | null) => {
    const p = tipAt(e)
    if (tip && Math.hypot(p.x - tip.x, p.y - tip.y) > 4) setTip(null)
    clearTimeout(resting.current)
    if (text) resting.current = window.setTimeout(() => setTip({ ...p, text }), 700)
  }
  const hideTip = () => { clearTimeout(resting.current); setTip(null) }
  useEffect(() => () => clearTimeout(resting.current), [])
  const tipText = (e: PointerEvent<SVGSVGElement>, angle: number, dist: number, onPin: boolean, onDial: boolean): string | null => {
    const where = () => `${mixOf([{ angle: snapped(angle, e.shiftKey), radius: 1, weight: 1 }]).map((m) => TONALITY_LABELS[m.tonality]).join(' / ')}, ${intensityWord(toIntensity(dist))}`
    if (onDial) return 'Turn the ring for weight'
    if (onPin) return 'Drag to move, off the wheel to remove; turn the ring for weight'
    if (dist < CENTRE) return 'New voice'
    // by the names on the rim: what that tonality sounds like (the names themselves don't take clicks)
    if (dist > 1.02 && dist < 1.3) {
      const t = TONALITIES[Math.round(angle / SECTOR) % TONALITIES.length]
      return `${TONALITY_LABELS[t]}: ${TONALITY_HINTS[t]}`
    }
    if (dist > 1.02) return null
    if (useApp.getState().pins.length >= MAX_PINS) return 'Three pins at most: drag one off to make room'
    return `Pin ${where()}`
  }

  const onUp = () => {
    if (!drag) return
    setTip(null)
    if (drag.base) {
      const { clearInstrument, setStartMenu, startMenu } = useApp.getState()
      if (drag.removing) { clearInstrument(); audition() }
      else if (!baseDrag?.moved) setStartMenu(!startMenu)
      setDrag(null)
      setBaseDrag(null)
      return
    }
    cancelAnimationFrame(frame.current)
    frame.current = 0
    const p = pending.current
    pending.current = null
    if (drag.weight) regenerate(true)
    else if (drag.removing) removePin(drag.id)
    else {
      if (p) movePin(p.id, p.angle, p.radius)
      regenerate(true)
    }
    setDrag(null)
    audition()
  }

  // scrolling on a pin sets its weight; React's wheel listener is passive, so this one is added by hand
  useEffect(() => {
    const el = svg.current!
    let timer = 0
    const onWheel = (e: globalThis.WheelEvent) => {
      const id = Number((e.target as Element).closest<SVGGElement>('g.pin')?.dataset.id)
      const p = useApp.getState().pins.find((q) => q.id === id)
      if (!p) return
      e.preventDefault()
      setWeight(p.id, p.weight - Math.sign(e.deltaY) * 0.05)
      clearTimeout(timer)
      timer = window.setTimeout(() => { regenerate(true); audition() }, 350)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setWeight, regenerate])

  const onPinKey = (e: KeyboardEvent, p: AppPin) => {
    const step = e.shiftKey ? SECTOR : 3
    const moves: Record<string, () => void> = {
      ArrowLeft: () => movePin(p.id, (p.angle - step + 360) % 360, p.radius),
      ArrowRight: () => movePin(p.id, (p.angle + step) % 360, p.radius),
      ArrowUp: () => movePin(p.id, p.angle, Math.min(1, p.radius + 0.05)),
      ArrowDown: () => movePin(p.id, p.angle, Math.max(0, p.radius - 0.05)),
      '+': () => setWeight(p.id, p.weight + 0.05),
      '=': () => setWeight(p.id, p.weight + 0.05),
      '-': () => setWeight(p.id, p.weight - 0.05),
      Delete: () => removePin(p.id),
      Backspace: () => removePin(p.id),
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    e.stopPropagation()
    move()
  }
  const onPinKeyUp = (e: KeyboardEvent) => {
    if (e.key.startsWith('Arrow') || ['+', '=', '-'].includes(e.key)) { regenerate(true); audition() }
  }

  // the glow: each pin lights the field around it in its colour, as strong as its weight
  const glow = [
    ...(base && basePlace ? [`radial-gradient(circle at ${50 + (basePlace.x / 2) * 100}% ${50 + (basePlace.y / 2) * 100}%, hsl(${TONALITY_HUES[base.family]} 95% 70% / 0.5) 0%, transparent 32%)`] : []),
    ...pins.map((p) => {
    const { x, y } = polar(p.angle, toRadius(p.radius))
    const share = p.weight / maxWeight
    return `radial-gradient(circle at ${50 + (x / 2) * 100}% ${50 + (y / 2) * 100}%, hsl(${hueOfAngle(p.angle)} 95% 70% / ${0.35 + 0.4 * share}) 0%, transparent ${18 + 22 * share}%)`
    }),
  ].join(', ')

  const name = voiceName(voice)

  return (
    <div className="wheel" style={{ '--glow': `hsl(${dominantHue} 80% 55%)` } as CSSProperties}>
      <div className="wheel-field" style={{ backgroundImage: FIELD }} aria-hidden="true">
        <div className="wheel-shade" />
        {glow && <div className="wheel-glow" style={{ backgroundImage: glow }} />}
      </div>
      {tip && <div className="wheel-tip" style={{ left: tip.x, top: tip.y }} aria-hidden="true">{tip.text}</div>}
      <svg
        ref={svg}
        className={`wheel-svg${drag ? ' dragging' : ''}${drag?.weight ? ' turning' : ''}`}
        viewBox={`${-VIEW} ${-VIEW} ${2 * VIEW} ${2 * VIEW}`}
        onPointerMove={onMove}
        onPointerLeave={() => { if (!drag) hideTip() }}
        onPointerDownCapture={hideTip}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="group"
        aria-label="Tonality wheel"
      >
        <circle className="wheel-hit" r={1} onPointerDown={onFieldDown} />
        {TONALITIES.map((t, i) => {
          const tick1 = polar(i * SECTOR + SECTOR / 2, 0.93)
          const tick2 = polar(i * SECTOR + SECTOR / 2, 1)
          return <line key={t} className="wheel-tick" x1={tick1.x} y1={tick1.y} x2={tick2.x} y2={tick2.y} />
        })}
        {TONALITIES.map((t) => {
          // set on the circle, each along its own sector's arc; on the lower half the arc runs the other way, so the
          // names there read left to right too (less quick to read than upright, but the wheel stays a wheel)
          const a = angleOf(t)
          const flip = a > 90 && a < 270
          const [from, to] = flip ? [polar(a + SECTOR / 2, LABEL_R), polar(a - SECTOR / 2, LABEL_R)] : [polar(a - SECTOR / 2, LABEL_R), polar(a + SECTOR / 2, LABEL_R)]
          return (
            <g key={t}>
              <path id={`wheel-arc-${t}`} d={`M ${from.x} ${from.y} A ${LABEL_R} ${LABEL_R} 0 0 ${flip ? 0 : 1} ${to.x} ${to.y}`} fill="none" />
              <text className="wheel-label" style={{ fill: rimColour(TONALITY_HUES[t]) }}>
                <textPath href={`#wheel-arc-${t}`} startOffset="50%" textAnchor="middle">{TONALITY_LABELS[t]}</textPath>
              </text>
            </g>
          )
        })}
        {base && basePlace && (() => {
          const at = baseDrag?.moved ? baseDrag : basePlace
          return (
            <g className={`base-marker${drag?.base && drag.removing ? ' removing' : ''}`} transform={`translate(${at.x} ${at.y})`}
              data-start-toggle role="button" tabIndex={0} aria-label={`${instrumentName(base)}, the base: choose another`}
              onPointerDown={onBaseDown}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); useApp.getState().setStartMenu(true) } }}>
              <rect className="base-ring" x={-0.075} y={-0.075} width={0.15} height={0.15} rx={0.02} transform="rotate(45)" />
              <rect className="base-dot" x={-0.042} y={-0.042} width={0.084} height={0.084} rx={0.012} transform="rotate(45)"
                style={{ fill: `hsl(${TONALITY_HUES[base.family]} 85% 64%)` }} />
            </g>
          )
        })()}
        {pins.map((p) => {
          const { x, y } = polar(p.angle, toRadius(p.radius))
          const share = p.weight / maxWeight
          const r = 0.05 + 0.04 * share
          const ring = r + 0.028
          const knob = polar(p.weight * 360, ring)
          const removing = drag?.id === p.id && drag.removing
          return (
            <g
              key={p.id}
              className={`pin${selected === p.id ? ' selected' : ''}${removing ? ' removing' : ''}`}
              transform={`translate(${x} ${y})`}
              tabIndex={0}
              role="slider"
              aria-label={`${pinLabel(p)} pin, weight ${Math.round(p.weight * 100)} %`}
              aria-valuenow={Math.round(p.radius * 100)}
              onPointerDown={(e) => onPinDown(e, p.id)}
              data-id={p.id}
              onKeyDown={(e) => onPinKey(e, p)}
              onKeyUp={onPinKeyUp}
              onFocus={() => selectPin(p.id)}
              onDoubleClick={() => removePin(p.id)}
            >
              <circle className="pin-ring" r={ring} />
              <circle className="pin-share" r={ring} pathLength={100} strokeDasharray={`${p.weight * 100} 100`} transform="rotate(-90)" />
              <circle className="pin-dot" r={r} style={{ fill: `hsl(${hueOfAngle(p.angle)} 85% 64%)` }} />
              <circle className="pin-knob" cx={knob.x} cy={knob.y} r={0.022} />
              {/* the dial's grip: the ring and a little either side of it */}
              <circle className="pin-dial" r={ring} onPointerDown={(e) => onDialDown(e, p.id)} />
            </g>
          )
        })}
        <g className="wheel-centre" onClick={() => { generateNew(); audition() }} role="button" tabIndex={0} aria-label="Make a new voice"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); generateNew(); audition() } }}>
          <circle r={CENTRE} />
          <text className="wheel-name" y={0.005}>{name}</text>
          <text className="wheel-hint" y={0.085}>new voice</text>
        </g>
      </svg>
    </div>
  )
}
