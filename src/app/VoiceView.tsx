// What was made, read-only (PLAN §6.1): the algorithm as the DX7 draws it, each operator coloured by the
// tonality it belongs to, and the six operators with frequency, level and envelope.
import { algorithmOf, type Algorithm } from '../dx7/algorithms'
import { opRatio } from '../dx7/frequency'
import { getOp, OP, opBase, VC, voiceName, type Voice } from '../dx7/voice'
import { TONALITY_HUES, TONALITY_LABELS, type Tonality } from '../generator/choices'
import type { Eg } from '../generator/shapes'
import { EgCurve } from './Controls'
import { useApp } from './store'

interface Node { op: number; x: number; depth: number }

/** Carriers along the bottom (OP1 on the left), each modulator above what it modulates. */
function layout(alg: Algorithm): Node[] {
  const targets = (op: number) => [1, 2, 3, 4, 5, 6].filter((c) => alg.modulators[c].includes(op))
  const depth = new Map<number, number>()
  const depthOf = (op: number): number => {
    if (depth.has(op)) return depth.get(op)!
    const t = targets(op)
    const d = t.length ? 1 + Math.max(...t.map(depthOf)) : 0
    depth.set(op, d)
    return d
  }
  for (let op = 1; op <= 6; op++) depthOf(op)
  const x = new Map<number, number>()
  alg.carriers.forEach((c, i) => x.set(c, i))
  const maxDepth = Math.max(...depth.values())
  for (let d = 1; d <= maxDepth; d++) {
    const ops = [1, 2, 3, 4, 5, 6].filter((op) => depth.get(op) === d)
    const wanted = ops.map((op) => ({ op, x: targets(op).reduce((s, t) => s + x.get(t)!, 0) / targets(op).length }))
      .sort((a, b) => a.x - b.x || a.op - b.op)
    // at least one apart, then centred on where they want to be
    const placed = wanted.map((w) => w.x)
    for (let i = 1; i < placed.length; i++) placed[i] = Math.max(placed[i], placed[i - 1] + 1)
    const shift = wanted.reduce((s, w, i) => s + w.x - placed[i], 0) / wanted.length
    wanted.forEach((w, i) => x.set(w.op, placed[i] + shift))
  }
  const minX = Math.min(...x.values())
  return [1, 2, 3, 4, 5, 6].map((op) => ({ op, x: x.get(op)! - minX, depth: depth.get(op)! }))
}

const hueOf = (t: Tonality | undefined) => (t ? TONALITY_HUES[t] : 250)

function AlgorithmDiagram({ voice, opTonality }: { voice: Voice; opTonality: Partial<Record<number, Tonality>> }) {
  const alg = algorithmOf(voice[VC.algorithm])
  const nodes = layout(alg)
  const width = Math.max(...nodes.map((n) => n.x)) + 1
  const height = Math.max(...nodes.map((n) => n.depth)) + 1
  const S = 34
  const pos = (n: Node) => ({ cx: 18 + n.x * S, cy: 14 + (height - 1 - n.depth) * S })
  const byOp = new Map(nodes.map((n) => [n.op, n]))
  const fb = alg.feedback
  const fbFrom = pos(byOp.get(fb.from)!)
  const fbTo = pos(byOp.get(fb.to)!)
  const W = 36 + (width - 1) * S + 14
  const H = 28 + (height - 1) * S + 10
  return (
    <svg className="algorithm" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Algorithm ${alg.number}`}>
      {nodes.flatMap((n) => [1, 2, 3, 4, 5, 6].filter((c) => alg.modulators[c].includes(n.op)).map((c) => {
        const a = pos(n)
        const b = pos(byOp.get(c)!)
        return <line key={`${n.op}-${c}`} className="alg-link" x1={a.cx} y1={a.cy + 10} x2={b.cx} y2={b.cy - 10} />
      }))}
      {alg.carriers.length > 0 && (() => {
        const xs = alg.carriers.map((c) => pos(byOp.get(c)!).cx)
        const y = pos(byOp.get(alg.carriers[0])!).cy + 10
        return <g className="alg-out">{xs.map((x) => <line key={x} x1={x} y1={y} x2={x} y2={y + 5} />)}<line x1={Math.min(...xs)} y1={y + 5} x2={Math.max(...xs)} y2={y + 5} /></g>
      })()}
      {voice[VC.feedback] > 0 && (
        fb.from === fb.to
          ? <path className="alg-fb" d={`M${fbFrom.cx + 10} ${fbFrom.cy + 4} h6 v-14 h-16 v4`} />
          : <path className="alg-fb" d={`M${fbFrom.cx + 10} ${fbFrom.cy} h8 V${fbTo.cy - 14} H${fbTo.cx} v4`} />
      )}
      {nodes.map((n) => {
        const { cx, cy } = pos(n)
        const sounding = getOp(voice, n.op, 'outputLevel') > 0
        const carrier = alg.carriers.includes(n.op)
        const hue = hueOf(opTonality[n.op])
        return (
          <g key={n.op} className={`alg-op${sounding ? '' : ' silent'}${carrier ? ' carrier' : ''}`} style={{ '--h': hue } as React.CSSProperties}>
            <rect x={cx - 10} y={cy - 10} width={20} height={20} rx={4} />
            <text x={cx} y={cy + 4}>{n.op}</text>
          </g>
        )
      })}
    </svg>
  )
}

function opEg(v: Voice, op: number): Eg {
  const b = opBase(op)
  return {
    rates: [v[b + OP.rate1], v[b + OP.rate2], v[b + OP.rate3], v[b + OP.rate4]],
    levels: [v[b + OP.level1], v[b + OP.level2], v[b + OP.level3], v[b + OP.level4]],
  }
}

function frequency(v: Voice, op: number) {
  const r = opRatio(v, op)
  if (r !== null) return `× ${r < 10 ? r.toFixed(2).replace(/\.?0+$/, '') : r.toFixed(1)}`
  const hz = 10 ** ((getOp(v, op, 'coarse') & 3) + getOp(v, op, 'fine') / 100)
  return `${hz < 100 ? hz.toFixed(1) : Math.round(hz)} Hz`
}

export function VoiceView() {
  const voice = useApp((s) => s.voice)
  const generated = useApp((s) => s.generated)
  const alg = algorithmOf(voice[VC.algorithm])
  const opTonality = generated?.opTonality ?? {}
  const mix = generated?.roles.map((r) => `${TONALITY_LABELS[r.tonality]}${r.as === 'branch' ? ' alongside' : r.as === 'transform' ? ' as colour' : ''}`).join(', ')
  return (
    <section className="voice">
      <div className="voice-head">
        <h2 className="voice-name">{voiceName(voice)}</h2>
        <p className="voice-mix">{mix ?? 'Not made from the wheel: a mutation, or a voice from a file'}</p>
        <p className="voice-meta">Algorithm {alg.number}, feedback {voice[VC.feedback]}</p>
      </div>
      <AlgorithmDiagram voice={voice} opTonality={opTonality} />
      <ol className="ops">
        {[1, 2, 3, 4, 5, 6].map((op) => {
          const level = getOp(voice, op, 'outputLevel')
          const carrier = alg.carriers.includes(op)
          return (
            <li key={op} className={`op${level ? '' : ' silent'}${carrier ? ' carrier' : ''}`} style={{ '--h': hueOf(opTonality[op]) } as React.CSSProperties}
              title={`OP${op}: ${carrier ? 'heard (a carrier)' : 'shapes the timbre (a modulator)'}`}>
              <span className="op-num">{op}</span>
              <span className="op-freq">{level ? frequency(voice, op) : 'off'}</span>
              <span className="op-level"><span style={{ width: `${(level / 99) * 100}%` }} /></span>
              {level > 0 && <EgCurve className="op-eg" eg={opEg(voice, op)} />}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
