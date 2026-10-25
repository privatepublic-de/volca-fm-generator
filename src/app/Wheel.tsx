// The wheel (PLAN §6.1): the twelve tonalities as a colour field, pins on it. The names on the rim are labels only (a
// click near them shouldn't pin anything: the bottom one sits right above the pin sliders). Click the field to pin, drag a pin to
// move it (towards the rim: more extreme), drag it off the wheel to take it away, scroll on it for its weight.
// The centre makes a new voice. Pins can be moved with the keyboard too.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { SECTOR, TONALITIES, TONALITY_HINTS, TONALITY_HUES, TONALITY_LABELS, angleOf, mixOf } from '../generator/choices'
import { voiceName } from '../dx7/voice'
import { audition, MAX_PINS, useApp, type AppPin } from './store'

/** The centre button's radius; pins live between it and the rim. */
const CENTRE = 0.22
/** Dragged further out than this, a pin is taken away on release. */
const REMOVE_AT = 1.16
const VIEW = 1.3

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
/** Mild near the centre, extreme at the rim. */
export const intensityWord = (radius: number) => (radius < 0.34 ? 'mild' : radius > 0.67 ? 'extreme' : 'typical')
export const pinLabel = (p: AppPin) => mixOf([{ ...p, weight: 1 }]).map((m) => TONALITY_LABELS[m.tonality]).join(' / ')
/** What the pin's tonalities sound like, for a tooltip: one line each. */
export const pinHint = (p: AppPin) => mixOf([{ ...p, weight: 1 }]).map((m) => `${TONALITY_LABELS[m.tonality]}: ${TONALITY_HINTS[m.tonality]}`).join('\n')

/** The field: each tonality's hue at its angle, pale and dim at the centre (mild), full at the rim (extreme). */
const FIELD = `conic-gradient(${[...TONALITIES, TONALITIES[0]].map((t, i) => `hsl(${TONALITY_HUES[t]} 72% 56%) ${i * SECTOR}deg`).join(', ')})`

export function Wheel() {
  const pins = useApp((s) => s.pins)
  const selected = useApp((s) => s.selectedPin)
  const voice = useApp((s) => s.voice)
  const generated = useApp((s) => s.generated)
  const { addPin, movePin, setWeight, removePin, selectPin, regenerate, generateNew } = useApp.getState()
  const svg = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ id: number; removing: boolean } | null>(null)
  const pending = useRef<{ id: number; angle: number; radius: number } | null>(null)
  const frame = useRef(0)

  const maxWeight = Math.max(0.0001, ...pins.map((p) => p.weight))
  const totalWeight = pins.reduce((s, p) => s + p.weight, 0)
  const dominantHue = generated ? TONALITY_HUES[generated.roles[0].tonality] : pins.length ? hueOfAngle(pins[0].angle) : 260

  /** Where a pointer is, in wheel units (the rim is 1). */
  const at = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 2 * VIEW - VIEW
    const y = ((e.clientY - r.top) / r.height) * 2 * VIEW - VIEW
    return { angle: ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360, dist: Math.hypot(x, y) }
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

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const { angle, dist } = at(e)
    showTip(e, angle, dist, (e.target as Element).closest('g.pin') !== null)
    if (!drag) return
    const removing = dist > REMOVE_AT
    if (removing !== drag.removing) setDrag({ ...drag, removing })
    if (!removing) schedule(drag.id, snapped(angle, e.shiftKey), toIntensity(dist))
  }

  /** The label at the pointer: what a click or a drag here would do. */
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const showTip = (e: PointerEvent<SVGSVGElement>, angle: number, dist: number, onPin: boolean) => {
    const box = svg.current!.getBoundingClientRect()
    const place = (text: string) => setTip({ x: e.clientX - box.left, y: e.clientY - box.top, text })
    const where = () => `${mixOf([{ angle: snapped(angle, e.shiftKey), radius: 1, weight: 1 }]).map((m) => TONALITY_LABELS[m.tonality]).join(' / ')}, ${intensityWord(toIntensity(dist))}`
    if (drag) return place(drag.removing || dist > REMOVE_AT ? 'Release to remove' : where())
    if (onPin) return place('Drag to move, off the wheel to remove; scroll for weight')
    if (dist < CENTRE) return place('New voice')
    if (dist > 1.02) return setTip(null)
    if (useApp.getState().pins.length >= MAX_PINS) return place('Three pins at most: drag one off to make room')
    place(`Pin ${where()}`)
  }

  const onUp = () => {
    if (!drag) return
    cancelAnimationFrame(frame.current)
    frame.current = 0
    const p = pending.current
    pending.current = null
    if (drag.removing) removePin(drag.id)
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
  const glow = pins.map((p) => {
    const { x, y } = polar(p.angle, toRadius(p.radius))
    const share = p.weight / maxWeight
    return `radial-gradient(circle at ${50 + (x / 2) * 100}% ${50 + (y / 2) * 100}%, hsl(${hueOfAngle(p.angle)} 95% 70% / ${0.35 + 0.4 * share}) 0%, transparent ${18 + 22 * share}%)`
  }).join(', ')

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
        className={`wheel-svg${drag ? ' dragging' : ''}`}
        viewBox={`${-VIEW} ${-VIEW} ${2 * VIEW} ${2 * VIEW}`}
        onPointerMove={onMove}
        onPointerLeave={() => { if (!drag) setTip(null) }}
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
          const a = angleOf(t)
          const { x, y } = polar(a, 1.13)
          const flip = a > 90 && a < 270
          return (
            <text
              key={t}
              className="wheel-label"
              x={x}
              y={y}
              transform={`rotate(${flip ? a + 180 : a} ${x} ${y})`}
              style={{ fill: `hsl(${TONALITY_HUES[t]} 70% 72%)` }}
            >
              <title>{TONALITY_HINTS[t]}</title>
              {TONALITY_LABELS[t]}
            </text>
          )
        })}
        {pins.map((p) => {
          const { x, y } = polar(p.angle, toRadius(p.radius))
          const share = p.weight / maxWeight
          const r = 0.05 + 0.04 * share
          const ring = r + 0.028
          const part = totalWeight ? p.weight / totalWeight : 1
          const removing = drag?.id === p.id && drag.removing
          return (
            <g
              key={p.id}
              className={`pin${selected === p.id ? ' selected' : ''}${removing ? ' removing' : ''}`}
              transform={`translate(${x} ${y})`}
              tabIndex={0}
              role="slider"
              aria-label={`${pinLabel(p)} pin, weight ${Math.round(part * 100)} %`}
              aria-valuenow={Math.round(p.radius * 100)}
              onPointerDown={(e) => onPinDown(e, p.id)}
              data-id={p.id}
              onKeyDown={(e) => onPinKey(e, p)}
              onKeyUp={onPinKeyUp}
              onFocus={() => selectPin(p.id)}
              onDoubleClick={() => removePin(p.id)}
            >
              <circle className="pin-ring" r={ring} />
              <circle className="pin-share" r={ring} pathLength={100} strokeDasharray={`${part * 100} 100`} transform="rotate(-90)" />
              <circle className="pin-dot" r={r} style={{ fill: `hsl(${hueOfAngle(p.angle)} 85% 64%)` }} />
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
