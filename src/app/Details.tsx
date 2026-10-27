// Every parameter of the voice, as the volca's EDIT page has them (its Parameter List card): one operator at a
// time, picked on the algorithm, in the card's groups; the voice-wide ones below. Each carries the volca's display
// name, so the panel and the device can be read side by side. Not a DX7 editor: one compact control per parameter,
// pictures where a number says little (the envelopes, the level scaling). A change is heard at once and becomes a
// step when you let go (as the controls' sliders do); it stays through the wheel and the controls (store: edits).
import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { algorithmOf } from '../dx7/algorithms'
import { getOp, maxAt, OP, opBase, VC } from '../dx7/voice'
import { AlgorithmDiagram, frequency, hueOf, VoiceName } from './VoiceView'
import { audition, useApp } from './store'

type OpKey = keyof typeof OP
type VcKey = Exclude<keyof typeof VC, 'name'>

const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
/** Break point 0 = A-1, 39 = C3 (the DX7's octave numbering). */
const breakNote = (v: number) => { const n = v + 9; return `${NOTES[n % 12]}${Math.floor(n / 12) - 1}` }
/** Transpose 24 = C3, the voice as played. */
const transposeNote = (v: number) => `${NOTES[v % 12]}${Math.floor(v / 12) + 1}`
const CURVES = ['−LIN', '−EXP', 'EXP', 'LIN']
const WAVES = ['Triangle', 'Saw down', 'Saw up', 'Square', 'Sine', 'S&H']
const WAVE_ICONS = ['M1 9 L5 2 L13 16 L17 9', 'M1 2 L17 16 M1 2 L1 16', 'M1 16 L17 2 L17 16', 'M1 16 L1 2 L9 2 L9 16 L17 16 L17 2', 'M1 9 C4 -1, 6 -1, 9 9 S14 19, 17 9', 'M1 12 H5 V4 H9 V14 H13 V7 H17']

/** An edit let go of: a step in the history, and heard. */
const commit = () => { useApp.getState().commitEdit(); audition() }
let wheelTimer: ReturnType<typeof setTimeout> | undefined

/** One number: drag up or down, scroll, or arrow keys (⇧ for tens). */
function Value({ value, max, onChange, format, label, min = 0 }: {
  value: number; max: number; onChange: (v: number) => void; format?: (v: number) => string; label: string; min?: number
}) {
  const drag = useRef<{ y: number; v: number } | null>(null)
  const set = (v: number) => onChange(Math.max(min, Math.min(max, Math.round(v))))
  const step = max > 20 ? 1.5 : 6
  return (
    <span className="dv" role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
      aria-valuetext={format?.(value)} style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { y: e.clientY, v: value } }}
      onPointerMove={(e) => { if (drag.current) set(drag.current.v + (drag.current.y - e.clientY) / step) }}
      onPointerUp={() => { if (drag.current) commit(); drag.current = null }}
      // scrolling becomes a step once it rests
      onWheel={(e) => { set(value + (e.deltaY < 0 ? 1 : -1)); clearTimeout(wheelTimer); wheelTimer = setTimeout(commit, 400) }}
      onKeyDown={(e) => {
        const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]
        if (d) { e.preventDefault(); set(value + d * (e.shiftKey ? 10 : 1)) }
      }}
      onKeyUp={(e) => { if (e.key.startsWith('Arrow')) commit() }}>
      {format ? format(value) : String(value).padStart(2, '0')}
    </span>
  )
}

/** The volca's display name for a parameter, in its LED red. */
const Led = ({ children }: { children: ReactNode }) => <span className="led" title="As the volca's display shows it">{children}</span>

function Row({ led, label, children }: { led: string; label: string; children: ReactNode }) {
  return <div className="dp"><Led>{led}</Led><span className="dp-label">{label}</span>{children}</div>
}

function Choice({ options, value, onPick, label, icons }: { options: string[]; value: number; onPick: (v: number) => void; label: string; icons?: string[] }) {
  return (
    <div className="segmented dseg" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button key={o} role="radio" aria-checked={value === i} className={value === i ? 'on' : ''} onClick={() => { onPick(i); commit() }} title={o}>
          {icons ? <svg viewBox="0 0 18 18" aria-hidden="true"><path d={icons[i]} /></svg> : o}
        </button>
      ))}
    </div>
  )
}

/** The envelope as the card draws it: L4 at key on, up to L1, L2, L3 held, at key off back to L4. The level
 *  points can be dragged up and down; the rates are the slopes' lengths. */
function EgEditor({ rates, levels, onLevel, pitch }: { rates: number[]; levels: number[]; onLevel: (i: number, v: number) => void; pitch?: boolean }) {
  const W = 360
  const H = 116
  const top = 14
  const bottom = H - 22
  const time = (r: number) => 0.08 + 1.4 * ((99 - r) / 99) ** 2
  const ts = [time(rates[0]), time(rates[1]), time(rates[2]), 0.7, time(rates[3])]
  const total = ts.reduce((a, b) => a + b, 0) + 0.25
  const xs: number[] = [12]
  for (const t of ts) xs.push(xs.at(-1)! + (t / total) * (W - 24))
  const ys = [levels[3], levels[0], levels[1], levels[2], levels[2], levels[3]]
  const y = (l: number) => bottom - (l / 99) * (bottom - top)
  const pts = xs.map((x, i) => [x, y(ys[i])])
  const svg = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  // which point is which level: L4 at both ends, L3 at the knee before key off
  const handles: [number, number][] = [[1, 0], [2, 1], [3, 2], [5, 3]]
  const levelAt = (clientY: number) => {
    const r = svg.current!.getBoundingClientRect()
    return Math.round(((bottom - ((clientY - r.top) / r.height) * H) / (bottom - top)) * 99)
  }
  return (
    <svg ref={svg} className="deg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={pitch ? 'Pitch envelope' : 'Envelope'}
      onPointerMove={(e) => { if (dragging !== null) onLevel(dragging, Math.max(0, Math.min(99, levelAt(e.clientY)))) }}
      onPointerUp={() => { if (dragging !== null) commit(); setDragging(null) }}>
      {pitch && <><line className="deg-mid" x1={0} x2={W} y1={y(50)} y2={y(50)} /><text className="deg-note" x={W - 4} y={y(50) - 4} textAnchor="end">no shift</text></>}
      <line className="deg-key" x1={xs[0]} x2={xs[0]} y1={top - 6} y2={bottom + 6} />
      <line className="deg-key" x1={xs[4]} x2={xs[4]} y1={top - 6} y2={bottom + 6} />
      <text className="deg-note" x={xs[0] + 3} y={H - 4}>key on</text>
      <text className="deg-note" x={xs[4] + 3} y={H - 4}>key off</text>
      {!pitch && <path className="deg-fill" d={`M${pts[0][0]} ${bottom} ${pts.map(([x, yy]) => `L${x} ${yy}`).join(' ')} L${pts[5][0]} ${bottom} Z`} />}
      <path className="deg-line" d={pts.map(([x, yy], i) => `${i ? 'L' : 'M'}${x} ${yy}`).join(' ')} />
      {[0, 1, 2, 4].map((seg, i) => (
        <text key={seg} className="deg-seg" x={(xs[seg] + xs[seg + 1]) / 2} y={Math.min(pts[seg][1], pts[seg + 1][1]) - 5}>R{i + 1}</text>
      ))}
      {handles.map(([p, i]) => (
        <g key={i} className={`deg-handle${dragging === i ? ' on' : ''}`} onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setDragging(i) }}>
          <circle cx={pts[p][0]} cy={pts[p][1]} r={9} className="deg-hit" />
          <circle cx={pts[p][0]} cy={pts[p][1]} r={4} />
          <text x={pts[p][0] + (p === 5 ? -8 : 7)} y={pts[p][1] + (pts[p][1] < top + 14 ? 14 : -7)} textAnchor={p === 5 ? 'end' : 'start'}>L{i + 1}</text>
        </g>
      ))}
    </svg>
  )
}

/** Level scaling as the card draws it: the keyboard below, the break point, each side's curve rising (EXP, LIN)
 *  or falling (−EXP, −LIN) away from it as far as its depth. */
function ScaleSketch({ bp, ld, rd, lc, rc }: { bp: number; ld: number; rd: number; lc: number; rc: number }) {
  const W = 560
  const H = 96
  const mid = 40
  const amp = 30
  const kx = (k: number) => 4 + (k / 99) * (W - 8)
  const shape = (c: number, d: number) => (c === 0 || c === 3 ? d : (Math.exp(3 * d) - 1) / (Math.exp(3) - 1)) * (c >= 2 ? 1 : -1)
  const side = (from: number, to: number, depth: number, curve: number) => {
    const out: string[] = []
    for (let k = 0; k <= 24; k++) {
      const x = from + ((to - from) * k) / 24
      out.push(`${x.toFixed(1)} ${(mid - shape(curve, k / 24) * (depth / 99) * amp).toFixed(1)}`)
    }
    return out
  }
  const left = side(kx(bp), 4, ld, lc).reverse()
  const right = side(kx(bp), W - 4, rd, rc)
  const whites: number[] = []
  for (let k = 0; k <= 99; k++) if (![1, 4, 6, 9, 11].includes((k + 9) % 12)) whites.push(k)
  return (
    <svg className="dscale" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Break point ${breakNote(bp)}`}>
      <line className="deg-mid" x1={4} x2={W - 4} y1={mid} y2={mid} />
      <path className="deg-line" d={`M${[...left, ...right].join(' L')}`} />
      <line className="dscale-bp" x1={kx(bp)} x2={kx(bp)} y1={6} y2={H - 4} />
      <text className="deg-note" x={kx(bp)} y={H - 26} textAnchor="middle">{breakNote(bp)}</text>
      {whites.map((k) => <rect key={k} className="dscale-key" x={kx(k) - 1.6} y={H - 18} width={3.2} height={14} rx={0.6} />)}
      <text className="deg-seg" x={14} y={12} textAnchor="start">{CURVES[lc]}</text>
      <text className="deg-seg" x={W - 14} y={12} textAnchor="end">{CURVES[rc]}</text>
    </svg>
  )
}

export function Details({ onClose }: { onClose: () => void }) {
  const voice = useApp((s) => s.voice)
  const generated = useApp((s) => s.generated)
  const edited = useApp((s) => Object.keys(s.edits ?? {}).length > 0)
  const opTonality = generated?.opTonality ?? {}
  const alg = algorithmOf(voice[VC.algorithm])
  const [op, setOpNum] = useState(() => alg.carriers[0] ?? 1)

  const put = (offset: number, value: number) => { if (voice[offset] !== value) useApp.getState().setEdit(offset, Math.max(0, Math.min(maxAt(offset), value))) }
  const o = (k: OpKey) => voice[opBase(op) + OP[k]]
  const setO = (k: OpKey) => (v: number) => put(opBase(op) + OP[k], v)
  const c = (k: VcKey) => voice[VC[k]]
  const setC = (k: VcKey) => (v: number) => put(VC[k], v)
  const num = (k: OpKey, led: string, label: string, format?: (v: number) => string, full = label) =>
    <Row led={led} label={label}><Value label={`OP${op} ${full}`} value={o(k)} max={maxAt(OP[k])} onChange={setO(k)} format={format} /></Row>
  const vnum = (k: VcKey, led: string, label: string, format?: (v: number) => string) =>
    <Row led={led} label={label}><Value label={label} value={c(k)} max={maxAt(VC[k])} onChange={setC(k)} format={format} /></Row>

  const carrier = alg.carriers.includes(op)
  const fixed = o('oscMode') === 1
  const egKeys = ['rate1', 'rate2', 'rate3', 'rate4', 'level1', 'level2', 'level3', 'level4'] as const
  const pitchKeys = ['pitchRate1', 'pitchRate2', 'pitchRate3', 'pitchRate4', 'pitchLevel1', 'pitchLevel2', 'pitchLevel3', 'pitchLevel4'] as const

  return (
    <section className="details" aria-labelledby="details-title" style={{ '--h': hueOf(opTonality[op]) } as CSSProperties}>
      <div className="voice-bar">
        <h3 id="details-title">Details</h3>
        <p className="details-note">Your changes stay through the wheel and the controls, until a new voice</p>
        {edited && <button onClick={() => { useApp.getState().clearEdits(); audition() }} title="The voice as the wheel and the controls make it">Clear edits</button>}
        <button className="primary" onClick={onClose}>Done</button>
      </div>

      <div className="details-top">
        {/* the voice and its map: click an operator to edit it */}
        <div className="details-map">
          <VoiceName />
          {/* a frame as large as the largest algorithm: changing it moves nothing around it */}
          <div className="details-alg">
            <AlgorithmDiagram voice={voice} opTonality={opTonality} selected={op} onSelect={setOpNum} className="algorithm big" scale={1} />
          </div>
          <div className="dgrid">
            <Row led="knob" label="Algorithm"><Value label="Algorithm" value={c('algorithm')} max={31} onChange={setC('algorithm')} format={(v) => String(v + 1)} /></Row>
            {vnum('feedback', 'FdbK', 'Feedback')}
            <Row led="OKS" label="Osc key sync"><Choice label="Osc key sync" options={['Off', 'On']} value={c('oscKeySync')} onPick={setC('oscKeySync')} /></Row>
          </div>
        </div>

        {/* the operator picked */}
        <div className="details-op">
          <div className="dop-tabs" role="tablist" aria-label="Operator">
            {[1, 2, 3, 4, 5, 6].map((n) => {
              const level = getOp(voice, n, 'outputLevel')
              return (
                <button key={n} role="tab" aria-selected={n === op} className={`dop-tab${n === op ? ' on' : ''}${level ? '' : ' silent'}${alg.carriers.includes(n) ? ' carrier' : ''}`}
                  style={{ '--h': hueOf(opTonality[n]) } as CSSProperties} onClick={() => setOpNum(n)}>
                  <b>{n}</b> <span>{level ? frequency(voice, n) : 'off'}</span>
                </button>
              )
            })}
          </div>
          <p className="dop-head">
            <span className="dop-title">Operator {op}</span>
            <span>{carrier ? 'a carrier: you hear it' : `a modulator: shapes OP${[1, 2, 3, 4, 5, 6].filter((t) => alg.modulators[t].includes(op)).join(', OP')}`}</span>
          </p>

          <div className="dcards">
            <div className="dcard wide">
              <h4>Envelope</h4>
              <EgEditor rates={egKeys.slice(0, 4).map((k) => o(k))} levels={egKeys.slice(4).map((k) => o(k))} onLevel={(i, v) => setO(egKeys[4 + i])(v)} />
              <div className="deg-values">
                {egKeys.map((k, i) => (
                  <label key={k}><Led>{`EG${i < 4 ? 'r' : 'L'}${(i % 4) + 1}`}</Led>
                    <Value label={`OP${op} ${i < 4 ? 'rate' : 'level'} ${(i % 4) + 1}`} value={o(k)} max={99} onChange={setO(k)} /></label>
                ))}
              </div>
            </div>

            <div className="dcard">
              <h4>Frequency <span className="dcard-big">{frequency(voice, op)}</span></h4>
              <Row led="OSCM" label="Mode"><Choice label="Mode" options={['Ratio', 'Fixed']} value={o('oscMode')} onPick={setO('oscMode')} /></Row>
              {num('coarse', 'FrEC', 'Coarse', fixed ? (v) => `${10 ** (v & 3)} Hz` : (v) => (v === 0 ? '0.5' : String(v)))}
              {num('fine', 'FrEF', 'Fine')}
              {num('detune', 'dEtu', 'Detune', (v) => (v > 7 ? `+${v - 7}` : String(v - 7)))}
            </div>

            <div className="dcard">
              <h4>Level</h4>
              {num('outputLevel', 'OLUL', 'Output level')}
              {num('velocitySens', 'AUS', 'Velocity sense')}
              {num('ampModSens', 'AMS', 'Amp mod sense')}
              {num('rateScaling', 'OrS', 'Rate scale')}
            </div>

            <div className="dcard wide">
              <h4>Level scale</h4>
              <ScaleSketch bp={o('breakPoint')} ld={o('leftDepth')} rd={o('rightDepth')} lc={o('leftCurve')} rc={o('rightCurve')} />
              {/* as the card has them: the break point in the middle, the left side's left, the right side's right */}
              <div className="dscale-controls">
                <div className="dgrid bp">{num('breakPoint', 'LSbP', 'Break point', breakNote)}</div>
                <div className="dgrid">
                  {num('leftDepth', 'LSLd', 'Depth', undefined, 'left depth')}
                  <div className="dp curve"><Led>LSLC</Led><Choice label="Left curve" options={CURVES} value={o('leftCurve')} onPick={setO('leftCurve')} /></div>
                </div>
                <div className="dgrid right">
                  {num('rightDepth', 'LSrd', 'Depth', undefined, 'right depth')}
                  <div className="dp curve"><Led>LSrC</Led><Choice label="Right curve" options={CURVES} value={o('rightCurve')} onPick={setO('rightCurve')} /></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* the whole voice */}
      <h3 className="details-sub">All operators</h3>
      <div className="dcards all">
        <div className="dcard">
          <h4>Pitch envelope</h4>
          <EgEditor pitch rates={pitchKeys.slice(0, 4).map((k) => c(k))} levels={pitchKeys.slice(4).map((k) => c(k))} onLevel={(i, v) => setC(pitchKeys[4 + i])(v)} />
          <div className="deg-values">
            {pitchKeys.map((k, i) => (
              <label key={k}><Led>{`Pt${i < 4 ? 'r' : 'L'}${(i % 4) + 1}`}</Led>
                <Value label={`Pitch ${i < 4 ? 'rate' : 'level'} ${(i % 4) + 1}`} value={c(k)} max={99} onChange={setC(k)} /></label>
            ))}
          </div>
        </div>
        <div className="dcard">
          <h4>LFO</h4>
          <Row led="LFOW" label="Wave"><Choice label="LFO wave" options={WAVES} icons={WAVE_ICONS} value={c('lfoWave')} onPick={setC('lfoWave')} /></Row>
          {vnum('lfoSpeed', 'knob', 'Speed')}
          {vnum('lfoDelay', 'LFOd', 'Delay')}
          {vnum('lfoPitchDepth', 'knob', 'Pitch depth')}
          {vnum('lfoAmpDepth', 'LAMd', 'Amp depth')}
          {vnum('pitchModSens', 'MSP', 'Pitch sense')}
          <Row led="LFOK" label="Key sync"><Choice label="LFO key sync" options={['Off', 'On']} value={c('lfoSync')} onPick={setC('lfoSync')} /></Row>
          <h4 className="dcard-sub">Voice</h4>
          {vnum('transpose', 'trSP', 'Transpose', transposeNote)}
        </div>
      </div>
    </section>
  )
}
