// The controls next to the wheel (PLAN §4.3): the pins as a list, the envelope as small drawings, the sliders, and
// the actions.
import { useState, type ReactNode } from 'react'
import { REGISTER_LABELS, REGISTERS, SHAPE_HINTS, SHAPE_LABELS, SHAPES, TONALITY_HUES, type Register, type Shape } from '../generator/choices'
import type { Eg } from '../generator/shapes'
import { hueOfAngle, intensityWord, pinHint, pinLabel } from './Wheel'
import { StartFromMenu } from './StartFrom'
import { instrumentName, INSTRUMENTS } from '../generator/instruments'
import { audition, playback, sameSound, useApp, type Controls as ControlValues } from './store'

/** A slider that makes the voice again while it moves and plays it when let go. A double-click puts it back to
 *  `reset` (its neutral value: the middle for bipolar ones), which `mark` shows on the track when it isn't an end. */
function Slider({ label, value, min, max, step = 0.05, onChange, left, right, bipolar, disabled, hint, reset }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void
  left?: string; right?: string; bipolar?: boolean; disabled?: boolean; hint?: string; reset?: number
}) {
  const regenerate = useApp((s) => s.regenerate)
  const neutral = reset ?? (bipolar ? 0 : min)
  const mark = neutral > min && neutral < max && !bipolar ? ((neutral - min) / (max - min)) * 100 : null
  return (
    <label className={`slider${bipolar ? ' bipolar' : ''}${mark !== null ? ' marked' : ''}${disabled ? ' disabled' : ''}`}
      title={`${hint ? `${hint}. ` : ''}Double-click: back to ${neutral === 0.5 && !bipolar ? 'the tonality\'s own' : 'neutral'}`}>
      <span className="slider-label">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        style={{ '--fill': `${((value - min) / (max - min)) * 100}%`, ...(mark !== null ? { '--mark': `${mark}%` } : {}) } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={() => { regenerate(true); audition() }}
        onKeyUp={(e) => { if (e.key.startsWith('Arrow')) { regenerate(true); audition() } }}
        onDoubleClick={() => { onChange(neutral); regenerate(true); audition() }}
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

function BaseChip() {
  const id = useApp((s) => s.controls.instrument)
  const clear = useApp((s) => s.clearInstrument)
  if (!id) return null
  const inst = INSTRUMENTS[id]
  return (
    <div className="base-chip" title={`${inst.hint}. The base of the voice: pins on the wheel colour it.`}>
      <span className="pin-swatch" style={{ background: `hsl(${TONALITY_HUES[inst.family]} 85% 64%)` }} />
      <span className="base-name">{instrumentName(inst)}</span>
      <span className="base-tag">base</span>
      <button className="pin-remove" aria-label={`Back to the wheel alone, without ${instrumentName(inst)}`} title="Back to the wheel alone" onClick={() => { clear(); audition() }}>×</button>
    </div>
  )
}

export function PinList() {
  const pins = useApp((s) => s.pins)
  const selected = useApp((s) => s.selectedPin)
  const instrument = useApp((s) => s.controls.instrument)
  const { setWeight, removePin, selectPin, regenerate } = useApp.getState()
  const total = pins.reduce((s, p) => s + p.weight, 0)
  if (!pins.length) return (
    <div className="pin-area">
      <BaseChip />
      <p className="pins-empty">{instrument ? 'Click the wheel to colour it with a tonality.' : 'Click the wheel to pin a tonality. With none, every new voice picks one.'}</p>
    </div>
  )
  return (
    <div className="pin-area">
    <BaseChip />
    <ul className="pins">
      {pins.map((p) => (
        <li key={p.id} className={selected === p.id ? 'selected' : ''} onClick={() => selectPin(p.id)} title={pinHint(p)}>
          <span className="pin-swatch" style={{ background: `hsl(${hueOfAngle(p.angle)} 85% 64%)` }} />
          <span className="pin-name">{pinLabel(p)}</span>
          <span className="pin-extreme" title="Drag the pin towards the rim: more extreme">{intensityWord(p.radius)}</span>
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
    </ul>
    </div>
  )
}

function Group({ title, children, className, hint }: { title: string; children: ReactNode; className?: string; hint?: string }) {
  return <section className={`group${className ? ` ${className}` : ''}`}><h3 title={hint}>{title}</h3>{children}</section>
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
          <span className="toggle-hint">browser only: match the volca's button</span>
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
    <Group title="Effects" hint="Chorus and reverb are switched on and off at the volca; these dials set their depth. They belong to the volca, not to the voice: they aren't saved with it.">
      {dial('Chorus', 'chorus', 'The fm2\'s chorus depth (CC 93); switch the chorus on at the volca')}
      {dial('Reverb', 'reverb', 'The fm2\'s reverb depth (CC 91); switch the reverb on at the volca')}
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
      <Group title="Envelope" className="controls-wide">
        <ShapePicker />
        <div className="controls-half">
          <Slider label="Length" left="short" right="long" bipolar min={-1} max={1} value={c.length} onChange={set('length')} />
        </div>
      </Group>
      <div className="controls-col">
        <Group title="Tone">
          <Slider label="Brightness" left="mellow" right="bright" bipolar min={-1} max={1} value={c.brightness} onChange={set('brightness')} />
          <Slider label="Complexity" left="pure" right="dense" min={0} max={1} reset={0.5} value={c.complexity} onChange={set('complexity')}
            hint="How many of the six operators sound and how deep: two when pure, six and intense when dense" />
          <Slider label="Motion" left="still" right="alive" min={0} max={1} value={c.motion} onChange={set('motion')}
            hint="Vibrato, shimmer and drifting brightness; past the middle, wobbles, random steps and pitch drift" />
        </Group>
        <Group title="Character">
          <Slider label="Wild" left="typical" right="wild" min={0} max={1} value={wild} onChange={setWild}
            hint="How far the voice may stray from its tonalities' usual sound: odd ratios, other feedback, near the top another algorithm" />
        </Group>
      </div>
      <div className="controls-col">
        <Group title="Playing">
          <Segmented<Register> label="Register" options={REGISTERS} labels={REGISTER_LABELS} hints={REGISTER_HINTS} value={c.register} onPick={step('register')} />
          <Slider label="Velocity" left="none" right="strong" min={0} max={1} value={c.velocity} onChange={set('velocity')}
            disabled={model === 'fm'} hint={model === 'fm' ? 'The volca fm plays every note at the same velocity' : 'How much brighter and louder a harder note plays'} />
          <label className="toggle" title="A short pitch fall into every note">
            <input type="checkbox" checked={c.pitchAccent} onChange={(e) => step('pitchAccent')(e.target.checked)} />
            <span>Pitch accent</span>
          </label>
        </Group>
        <EffectControls />
      </div>
    </div>
  )
}

/** What each action does, shown below them while one is pointed at or focused. */
const ACTION_HINTS = {
  start: 'Start from: an instrument as the base (piano, guitar, vibes, bass, drums, choir…), or Init voice, a plain sine (I).',
  generate: 'New voice: your pins and controls rolled again: other ratios and levels, and another algorithm where the tonality has a choice.',
  variation: 'Variation: your pins and controls rolled much freer, at least three quarters wild: further from the usual sound.',
  mutate: 'Mutate: the pins wander around the wheel and in or out, the controls get a push, sometimes a pin comes or goes; then a new voice.',
  keep: 'Keep: puts this voice, with its pins and controls, in your kept voices, in this browser.',
  kept: 'Kept: this voice is in your kept voices. Click to take it out again.',
  undo: 'Undo: back to the voice before, with its pins and controls (⌘Z).',
  redo: 'Redo: forward again (⇧⌘Z).',
}
type ActionKey = keyof typeof ACTION_HINTS

export function Actions() {
  const { generateNew, variation, mutateCurrent, keep, unkeep, back, forward } = useApp.getState()
  const at = useApp((s) => s.history.findIndex((h) => h.id === s.currentId))
  const length = useApp((s) => s.history.length)
  const canUndo = at < 0 ? length > 0 : at > 0
  const canRedo = at >= 0 && at < length - 1
  const kept = useApp((s) => s.favourites.find((f) => sameSound(f.voice, s.voice)))
  const autoplay = useApp((s) => s.autoplay)
  const setAutoplay = useApp((s) => s.setAutoplay)
  const [hint, setHint] = useState<ActionKey | null>(null)
  const [choosing, setChoosing] = useState(false)
  const button = (key: ActionKey, label: string, shortcut: string, run: () => void, primary = false, disabled = false) => (
    <button className={primary ? 'primary' : ''} onClick={run} title={shortcut} disabled={disabled}
      onPointerEnter={() => setHint(key)} onFocus={() => setHint(key)} onPointerLeave={() => setHint(null)} onBlur={() => setHint(null)}>
      {label}
    </button>
  )
  return (
    <div className="actions-block">
      <div className="actions">
        <button data-start-toggle aria-expanded={choosing} onClick={() => setChoosing((c) => !c)}
          onPointerEnter={() => setHint('start')} onFocus={() => setHint('start')} onPointerLeave={() => setHint(null)} onBlur={() => setHint(null)}>Start from…</button>
        {button('generate', 'New voice', 'Enter', () => { generateNew(); audition() }, true)}
        {button('variation', 'Variation', 'V', () => { variation(); audition() })}
        {button('mutate', 'Mutate', 'M', () => { mutateCurrent(); audition() })}
        {kept
          ? <button className="kept" onClick={() => unkeep(kept.id)} title="Q keeps; click to take it out"
              onPointerEnter={() => setHint('kept')} onFocus={() => setHint('kept')} onPointerLeave={() => setHint(null)} onBlur={() => setHint(null)}>Kept</button>
          : button('keep', 'Keep', 'Q', keep)}
        <span className="actions-history">
          {button('undo', 'Undo', '⌘Z', () => { back(); audition() }, false, !canUndo)}
          {button('redo', 'Redo', '⇧⌘Z', () => { forward(); audition() }, false, !canRedo)}
        </span>
        <label className="toggle small">
          <input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} />
          <span title="Plays the note you played last (C4 until you play one) after every change">Play on change</span>
        </label>
      </div>
      {hint && !choosing && <p className="action-hint" role="status">{ACTION_HINTS[hint]}</p>}
      {choosing && <StartFromMenu onClose={() => setChoosing(false)} />}
    </div>
  )
}
