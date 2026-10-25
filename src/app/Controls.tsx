// The controls next to the wheel (PLAN §4.3): the pins as a list, the envelope as small drawings, the sliders, and
// the actions.
import type { ReactNode } from 'react'
import { REGISTER_LABELS, REGISTERS, SHAPE_HINTS, SHAPE_LABELS, SHAPES, type Register, type Shape } from '../generator/choices'
import { SHAPE_SPECS, type Eg } from '../generator/shapes'
import { hueOfAngle, pinHint, pinLabel } from './Wheel'
import { audition, MAX_PINS, useApp, type Controls as ControlValues } from './store'

/** A slider that makes the voice again while it moves and plays it when let go. */
function Slider({ label, value, min, max, step = 0.05, onChange, left, right, bipolar, disabled, hint }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void
  left?: string; right?: string; bipolar?: boolean; disabled?: boolean; hint?: string
}) {
  const regenerate = useApp((s) => s.regenerate)
  return (
    <label className={`slider${bipolar ? ' bipolar' : ''}${disabled ? ' disabled' : ''}`} title={hint}>
      <span className="slider-label">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={() => { regenerate(true); audition() }}
        onKeyUp={(e) => { if (e.key.startsWith('Arrow')) { regenerate(true); audition() } }}
        onDoubleClick={() => { onChange(bipolar ? 0 : min); regenerate(true); audition() }}
      />
      {(left || right) && <span className="slider-ends"><span>{left}</span><span>{right}</span></span>}
    </label>
  )
}

/** An envelope as a line: attack, decay to the sustain, a held stretch, release. Rates → widths by the measured
 *  timings (about ×3 per 10). */
function EgCurve({ eg, className }: { eg: Eg; className?: string }) {
  const time = (rate: number, from: number, to: number) => (rate >= 99 || from === to ? 0.02 : Math.min(1.4, 0.05 * 3 ** ((70 - rate) / 10)))
  const [r1, r2, r3, r4] = eg.rates
  const [l1, l2, l3] = eg.levels
  const pts: [number, number][] = [[0, 0]]
  let t = 0
  const push = (dt: number, l: number) => { t += dt; pts.push([t, l / 99]) }
  push(time(r1, 0, l1), l1)
  push(time(r2, l1, l2), l2)
  push(time(r3, l2, l3), l3)
  push(0.5, l3)
  push(time(r4, l3, 0), 0)
  const W = 60
  const H = 22
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${((x / t) * W).toFixed(1)} ${(H - 2 - y * (H - 4)).toFixed(1)}`).join(' ')
  return <svg className={className} viewBox={`0 0 ${W} ${H}`} aria-hidden="true"><path d={d} /></svg>
}
export { EgCurve }

function ShapePicker() {
  const shape = useApp((s) => s.controls.shape)
  const setControl = useApp((s) => s.setControl)
  const pick = (v: Shape | null) => { setControl('shape', v); useApp.getState().regenerate(true); audition() }
  return (
    <div className="shapes" role="radiogroup" aria-label="Envelope">
      <button role="radio" aria-checked={shape === null} className={shape === null ? 'on' : ''} onClick={() => pick(null)} title="The envelope the tonality comes with">
        <span className="shape-auto">auto</span>
        <span>Own</span>
      </button>
      {SHAPES.map((s) => (
        <button key={s} role="radio" aria-checked={shape === s} className={shape === s ? 'on' : ''} onClick={() => pick(s)} title={SHAPE_HINTS[s]}>
          <EgCurve eg={SHAPE_SPECS[s].carrier} />
          <span>{SHAPE_LABELS[s]}</span>
        </button>
      ))}
    </div>
  )
}

function Segmented<T extends string>({ label, options, labels, hints, value, onPick }: {
  label: string; options: readonly T[]; labels: Record<T, string>; hints?: Record<T, string>; value: T | null; onPick: (v: T | null) => void
}) {
  return (
    <div className="field">
      <span className="slider-label" id={`label-${label}`}>{label}</span>
      <div className="segmented" role="radiogroup" aria-labelledby={`label-${label}`}>
        <button role="radio" aria-checked={value === null} className={value === null ? 'on' : ''} onClick={() => onPick(null)} title="Where the tonality plays">Own</button>
        {options.map((o) => (
          <button key={o} role="radio" aria-checked={value === o} className={value === o ? 'on' : ''} onClick={() => onPick(o)} title={hints?.[o]}>{labels[o]}</button>
        ))}
      </div>
    </div>
  )
}

const REGISTER_HINTS: Record<Register, string> = {
  sub: 'Two octaves down, kept pure', bass: 'An octave down, a little brighter', mid: 'As played',
  lead: 'An octave up', high: 'Two octaves up, tamer at the top',
}

export function PinList() {
  const pins = useApp((s) => s.pins)
  const selected = useApp((s) => s.selectedPin)
  const { setWeight, removePin, selectPin, regenerate } = useApp.getState()
  const total = pins.reduce((s, p) => s + p.weight, 0)
  if (!pins.length) return <p className="pins-empty">Click the wheel to pin a tonality. With none, every new voice picks one.</p>
  return (
    <ul className="pins">
      {pins.map((p) => (
        <li key={p.id} className={selected === p.id ? 'selected' : ''} onClick={() => selectPin(p.id)} title={pinHint(p)}>
          <span className="pin-swatch" style={{ background: `hsl(${hueOfAngle(p.angle)} 85% 64%)` }} />
          <span className="pin-name">{pinLabel(p)}</span>
          <span className="pin-extreme" title="Towards the rim: more extreme">{p.radius < 0.34 ? 'mild' : p.radius > 0.67 ? 'extreme' : 'typical'}</span>
          <input
            type="range" min={0.05} max={1} step={0.05} value={p.weight} aria-label={`${pinLabel(p)} weight`}
            style={{ '--fill': `${p.weight * 100}%`, '--accent': `hsl(${hueOfAngle(p.angle)} 85% 64%)` } as React.CSSProperties}
            onChange={(e) => setWeight(p.id, Number(e.target.value))}
            onPointerUp={() => { regenerate(true); audition() }}
          />
          <span className="pin-share">{Math.round((p.weight / total) * 100)} %</span>
          <button className="pin-remove" aria-label={`Remove ${pinLabel(p)}`} onClick={(e) => { e.stopPropagation(); removePin(p.id); audition() }}>×</button>
        </li>
      ))}
      {pins.length < MAX_PINS && <li className="pins-more">Up to {MAX_PINS} pins: click the wheel for another.</li>}
    </ul>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section className="group"><h3>{title}</h3>{children}</section>
}

export function Controls() {
  const c = useApp((s) => s.controls)
  const wild = useApp((s) => s.wild)
  const model = useApp((s) => s.model)
  const { setControl, setWild, regenerate } = useApp.getState()
  const set = <K extends keyof ControlValues>(k: K) => (v: ControlValues[K]) => setControl(k, v)
  const step = <K extends keyof ControlValues>(k: K) => (v: ControlValues[K]) => { setControl(k, v); regenerate(true); audition() }
  return (
    <div className="controls">
      <Group title="Envelope">
        <ShapePicker />
        <Slider label="Length" left="short" right="long" bipolar min={-1} max={1} value={c.length} onChange={set('length')} />
      </Group>
      <Group title="Tone">
        <Slider label="Brightness" left="mellow" right="bright" bipolar min={-1} max={1} value={c.brightness} onChange={set('brightness')} />
        <Slider label="Complexity" left="pure" right="dense" min={0} max={1} value={c.complexity} onChange={set('complexity')}
          hint="How many of the six operators sound: two when pure, all six when dense" />
        <Slider label="Motion" left="still" right="alive" min={0} max={1} value={c.motion} onChange={set('motion')}
          hint="Vibrato, shimmer between the carriers, and brightness that drifts while a note is held" />
      </Group>
      <Group title="Playing">
        <Segmented<Register> label="Register" options={REGISTERS} labels={REGISTER_LABELS} hints={REGISTER_HINTS} value={c.register} onPick={step('register')} />
        <Slider label="Velocity" left="none" right="strong" min={0} max={1} value={c.velocity} onChange={set('velocity')}
          disabled={model === 'fm'} hint={model === 'fm' ? 'The volca fm plays every note at the same velocity' : 'How much brighter and louder a harder note plays'} />
        <label className="toggle">
          <input type="checkbox" checked={c.pitchAccent} onChange={(e) => step('pitchAccent')(e.target.checked)} />
          <span>Pitch accent</span>
          <span className="toggle-hint">a short pitch fall into every note</span>
        </label>
      </Group>
      <Group title="New voices">
        <Slider label="Wild" left="typical" right="wild" min={0} max={1} value={wild} onChange={setWild}
          hint="How far a new voice may stray from its tonalities' usual sound" />
      </Group>
    </div>
  )
}

export function Actions() {
  const { generateNew, variation, mutateCurrent, keep } = useApp.getState()
  const autoplay = useApp((s) => s.autoplay)
  const setAutoplay = useApp((s) => s.setAutoplay)
  return (
    <div className="actions">
      <button className="primary" onClick={() => { generateNew(); audition() }} title="Enter">New voice</button>
      <button onClick={() => { variation(); audition() }} title="V: the same pins and controls, another roll">Variation</button>
      <button onClick={() => { mutateCurrent(); audition() }} title="M: this voice, nudged">Mutate</button>
      <button onClick={keep} title="Q: keep this voice in your favourites">Keep</button>
      <label className="toggle small">
        <input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} />
        <span>Play on change</span>
      </label>
    </div>
  )
}
