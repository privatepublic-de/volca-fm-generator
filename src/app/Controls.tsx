// The controls next to the wheel (PLAN §4.3): the pins as a list, the envelope as small drawings, the sliders, and
// the actions.
import { useState, type ReactNode } from 'react'
import { REGISTER_LABELS, REGISTERS, SHAPE_HINTS, SHAPE_LABELS, SHAPES, type Register, type Shape } from '../generator/choices'
import type { Eg } from '../generator/shapes'
import { hueOfAngle, pinHint, pinLabel } from './Wheel'
import { audition, MAX_PINS, playback, useApp, type Controls as ControlValues } from './store'

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

/** An envelope's loudness as a line: the DX7's level steps are 0.75 dB, so a level is drawn as its amplitude and a
 *  segment as a straight line in dB (a curve here), as it sounds. Times from the rates, as measured (docs/SOUND.md:
 *  about ×3 per 10), capped so a slow stage doesn't squash the rest. */
function EgCurve({ eg, className }: { eg: Eg; className?: string }) {
  const amp = (l: number) => (l <= 0 ? 0 : 10 ** (-(99 - l) * 0.0375))
  const time = (rate: number, from: number, to: number) => (from === to ? 0.03 : rate >= 99 ? 0.02 : Math.min(1.2, 0.05 * 3 ** ((70 - rate) / 10)))
  const [r1, r2, r3, r4] = eg.rates
  const [l1, l2, l3] = eg.levels
  const stages: [number, number, number][] = [[time(r1, 0, l1), 0, l1], [time(r2, l1, l2), l1, l2], [time(r3, l2, l3), l2, l3], [0.4, l3, l3], [time(r4, l3, 0), l3, 0]]
  const total = stages.reduce((s, [t]) => s + t, 0)
  const W = 60
  const H = 22
  const pts: string[] = [`M0 ${H - 2}`]
  let t = 0
  for (const [dt, a, b] of stages) {
    // the attack rises steeply (as the DX7's does); the other stages in dB
    for (let k = 1; k <= 8; k++) {
      const f = k / 8
      const level = a < b ? b : a + (b - a) * f
      const y = a < b ? amp(b) * (1 - (1 - f) ** 3) + amp(a) * (1 - f) ** 3 : amp(level)
      pts.push(`L${(((t + dt * f) / total) * W).toFixed(1)} ${(H - 2 - y * (H - 4)).toFixed(1)}`)
    }
    t += dt
  }
  return <svg className={className} viewBox={`0 0 ${W} ${H}`} aria-hidden="true"><path d={pts.join(' ')} /></svg>
}
export { EgCurve }

/** The envelope shapes as icons, drawn to be told apart at a glance (loudness against time; the dashed line is where
 *  the key is let go). */
const SHAPE_ICONS: Record<Shape, string> = {
  // instant, a steep curved fall to nothing
  pluck: 'M3 21 L3 3 C6 15, 10 20, 20 20.6 L57 21',
  // instant, a short drop, a long fade
  struck: 'M3 21 L3 3 C4 7, 6 8.5, 9 8.5 C20 9.5, 34 15, 44 18.5 C48 20, 51 20.8, 57 21',
  // a soft rise, held, let go
  bowed: 'M3 21 C6 9, 9 5, 14 5 L44 5 C47 11, 50 18, 54 21 L57 21',
  // a slow rise in and a slow fall out
  pad: 'M3 21 C15 20.5, 19 5, 28 5 L40 5 C46 5.5, 51 17, 57 21',
  // in at half, growing all the while it is held
  swell: 'M3 21 C4 13, 6 12, 10 12 C22 11.5, 34 6, 44 4 C47 10, 50 18, 54 21 L57 21',
  // on, held, off
  gate: 'M3 21 L5 21 L5 4 L44 4 L44 21 L57 21',
  // a rise, then cut off
  reverse: 'M3 21 C20 20.5, 32 13, 40 3 L40.5 21 L57 21',
}

function ShapeIcon({ shape }: { shape: Shape }) {
  return (
    <svg viewBox="0 0 60 24" aria-hidden="true">
      <line className="shape-release" x1={44} y1={1} x2={44} y2={23} />
      <path d={SHAPE_ICONS[shape]} />
    </svg>
  )
}

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
          <ShapeIcon shape={s} />
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

/** The volca's effects: not part of the voice, a setting like the volume. The fm2's depths go to it as CCs (91, 93);
 *  the fm's chorus is a button on the volca, so here it only sets the browser's sound to match. */
function EffectControls() {
  const model = useApp((s) => s.model)
  const [, refresh] = useState(0)
  const s = playback.settings
  const set = (patch: Parameters<typeof playback.set>[0]) => { playback.set(patch); refresh((n) => n + 1) }
  if (model === 'fm') {
    return (
      <Group title="Effects">
        <label className="toggle">
          <input type="checkbox" checked={s.fmChorus} onChange={(e) => { set({ fmChorus: e.target.checked }); audition() }} />
          <span>Chorus</span>
          <span className="toggle-hint">the volca fm's chorus is its own button; this only matches the browser's sound to it</span>
        </label>
      </Group>
    )
  }
  const dial = (label: string, key: 'chorus' | 'reverb', hint: string) => (
    <label className="slider" title={hint}>
      <span className="slider-label">{label}</span>
      <input type="range" min={0} max={127} step={1} value={s[key]}
        style={{ '--fill': `${(s[key] / 127) * 100}%` } as React.CSSProperties}
        onChange={(e) => set({ [key]: Number(e.target.value) })}
        onPointerUp={() => audition()}
        onKeyUp={(e) => { if (e.key.startsWith('Arrow')) audition() }}
        onDoubleClick={() => set({ [key]: 0 })} />
      <span className="slider-ends"><span>off</span><span>deep</span></span>
    </label>
  )
  return (
    <Group title="Effects">
      {dial('Chorus', 'chorus', 'The fm2\'s chorus depth (CC 93)')}
      {dial('Reverb', 'reverb', 'The fm2\'s reverb depth (CC 91)')}
      <p className="group-note">On the volca, switch chorus and reverb on; these set how deep. Not saved with the voice.</p>
    </Group>
  )
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
      <EffectControls />
      <Group title="New voices">
        <Slider label="Wild" left="typical" right="wild" min={0} max={1} value={wild} onChange={setWild}
          hint="How far a new voice may stray from its tonalities' usual sound" />
      </Group>
    </div>
  )
}

/** What each action does, shown under them for the one pointed at (New voice's when none is). */
const ACTION_HINTS = {
  init: 'Init voice: back to the start, one mild Warm pin with everything dialled down: a plain sine, held like an organ. Explore from there.',
  generate: 'New voice: your pins and controls rolled again: other ratios and levels, and another algorithm where the tonality has a choice.',
  variation: 'Variation: your pins and controls rolled much freer, at least three quarters wild: further from the usual sound.',
  mutate: 'Mutate: the pins wander around the wheel and in or out, the controls get a push, sometimes a pin comes or goes; then a new voice.',
  keep: 'Keep: puts this voice in your kept voices, in this browser.',
}
type ActionKey = keyof typeof ACTION_HINTS

export function Actions() {
  const { initVoice, generateNew, variation, mutateCurrent, keep } = useApp.getState()
  const autoplay = useApp((s) => s.autoplay)
  const setAutoplay = useApp((s) => s.setAutoplay)
  const [hint, setHint] = useState<ActionKey>('generate')
  const button = (key: ActionKey, label: string, shortcut: string, run: () => void, primary = false) => (
    <button className={primary ? 'primary' : ''} onClick={run} title={shortcut}
      onPointerEnter={() => setHint(key)} onFocus={() => setHint(key)} onPointerLeave={() => setHint('generate')} onBlur={() => setHint('generate')}>
      {label}
    </button>
  )
  return (
    <div className="actions-block">
      <div className="actions">
        {button('init', 'Init voice', 'I', () => { initVoice(); audition() })}
        {button('generate', 'New voice', 'Enter', () => { generateNew(); audition() }, true)}
        {button('variation', 'Variation', 'V', () => { variation(); audition() })}
        {button('mutate', 'Mutate', 'M', () => { mutateCurrent(); audition() })}
        {button('keep', 'Keep', 'Q', keep)}
        <label className="toggle small">
          <input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} />
          <span>Play on change</span>
        </label>
      </div>
      <p className="action-hint" aria-live="polite">{ACTION_HINTS[hint]}</p>
    </div>
  )
}
