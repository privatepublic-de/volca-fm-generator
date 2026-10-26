// How much each state of the pins and controls changes the sound: every control swept on every tonality (a few
// seeds), each state against the neutral one. The distance is a spectrogram's (bands × time, two velocities), in dB;
// the yardstick is how far two seeds of the same choices are apart.
// npx vite-node tools/sensitivity.ts [seeds] [json file] [pairs | calibrate | control names, comma-separated]
//   pairs: every tonality as a second pin over every other
//   calibrate: Complexity's response curve (controls.ts COMPLEXITY_CURVE) fitted, and Motion's response raw
import { writeFileSync } from 'node:fs'
import { angleOf, DEFAULT_CHOICES, REGISTERS, SECTOR, SHAPES, TONALITIES, type GeneratorChoices, type Pin, type Tonality } from '../src/generator/choices'
import { generate } from '../src/generator/generate'
import { COMPLEXITY_CURVE } from '../src/generator/controls'
import { renderNote } from '../src/engine/render'
import { spectrum, type Segment } from '../src/engine/measure'

const SR = 32000
const SEEDS = Array.from({ length: Number(process.argv[2] ?? 3) }, (_, i) => i + 1)
const BANDS = Array.from({ length: 25 }, (_, i) => 50 * (12000 / 50) ** (i / 24))
// early frames short (the attack), then every 0.1 s through the hold (2 s) and the release (0.5 s)
const FRAMES: [number, number][] = [[0, 1024], [0.02, 1024], [0.05, 1024], ...Array.from({ length: 25 }, (_, i) => [0.1 * i, 2048] as [number, number])]
const FLOOR = 60

/** dB per band and frame, at velocity 100 and 50. */
function features(v: Uint8Array): Float64Array {
  const out: number[] = []
  for (const velocity of [100, 50]) {
    const samples = renderNote(v, { note: 60, velocity, sampleRate: SR, holdSeconds: 2, releaseSeconds: 0.5 })
    for (const [t, n] of FRAMES) {
      const from = Math.round(t * SR)
      const seg: Segment = { samples: samples.subarray(from, from + n), sampleRate: SR }
      const { magnitudes, binHz } = spectrum(seg)
      const e = new Float64Array(BANDS.length)
      for (let i = 1; i < magnitudes.length; i++) {
        const hz = i * binHz
        if (hz < BANDS[0] * 0.9 || hz > 12000) continue
        let b = 0
        while (b < BANDS.length - 1 && hz > Math.sqrt(BANDS[b] * BANDS[b + 1])) b++
        e[b] += magnitudes[i] ** 2 / n
      }
      for (const x of e) out.push(10 * Math.log10(x + 1e-20))
    }
  }
  return Float64Array.from(out)
}

/** RMS difference in dB, everything more than FLOOR under the louder of the two counted as the floor. */
function distance(a: Float64Array, b: Float64Array): number {
  let top = -Infinity
  for (let i = 0; i < a.length; i++) top = Math.max(top, a[i], b[i])
  let s = 0
  for (let i = 0; i < a.length; i++) s += (Math.max(a[i], top - FLOOR) - Math.max(b[i], top - FLOOR)) ** 2
  return Math.sqrt(s / a.length)
}

const cache = new Map<string, { bytes: string; f: Float64Array }>()
function measure(c: GeneratorChoices, seed: number) {
  const key = JSON.stringify([c, seed])
  let m = cache.get(key)
  if (!m) {
    const g = generate(c, { seed, keepName: 'X' })
    m = { bytes: Buffer.from(g.voice.subarray(0, 145)).toString('hex'), f: features(g.voice) }
    cache.set(key, m)
  }
  return m
}

const pin = (t: Tonality, extra: Partial<Pin> = {}): Pin => ({ angle: angleOf(t), radius: 0.5, weight: 1, ...extra })
const base = (t: Tonality): GeneratorChoices => ({ ...DEFAULT_CHOICES, pins: [pin(t)] })

interface Row { control: string; state: string; tonality: Tonality; seed: number; d: number; same: boolean; dStep: number | null }
const rows: Row[] = []
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN }
const mode = process.argv[4] ?? ''
const pairsOnly = mode === 'pairs' || mode === 'calibrate'
const only = mode && !pairsOnly ? mode.split(',') : null

/** A control swept: states in order, each against the first given `neutral` (and its neighbour before it). */
function sweep(control: string, states: [string, (t: Tonality) => GeneratorChoices][], neutral: (t: Tonality) => GeneratorChoices = base, tonalities: readonly Tonality[] = TONALITIES) {
  if (pairsOnly || (only && !only.includes(control))) return
  for (const t of tonalities) for (const seed of SEEDS) {
    const n = measure(neutral(t), seed)
    let prev: ReturnType<typeof measure> | null = null
    for (const [state, make] of states) {
      const m = measure(make(t), seed)
      rows.push({ control, state, tonality: t, seed, d: distance(n.f, m.f), same: n.bytes === m.bytes, dStep: prev ? distance(prev.f, m.f) : null })
      prev = m
    }
  }
  process.stderr.write(`${control} done (${cache.size} voices)\n`)
}
const steps = (from: number, to: number, by: number) => Array.from({ length: Math.round((to - from) / by) + 1 }, (_, i) => +(from + i * by).toFixed(3))
const ctl = <K extends keyof GeneratorChoices>(k: K, xs: GeneratorChoices[K][]) => xs.map((x) => [String(x), (t: Tonality) => ({ ...base(t), [k]: x })] as [string, (t: Tonality) => GeneratorChoices])

// the yardstick: the same choices, another seed
const spread: number[] = []
for (const t of TONALITIES) for (const s of SEEDS) for (const s2 of SEEDS) if (s2 > s) spread.push(distance(measure(base(t), s).f, measure(base(t), s2).f))

sweep('radius', steps(0, 1, 0.1).map((r) => [String(r), (t) => ({ ...base(t), pins: [pin(t, { radius: r })] })]))
sweep('angle (sectors off centre)', steps(0, 0.5, 0.05).map((o) => [String(o), (t) => ({ ...base(t), pins: [pin(t, { angle: angleOf(t) + o * SECTOR })] })]))
sweep('single pin weight', [0.1, 0.5, 1].map((w) => [String(w), (t) => ({ ...base(t), pins: [pin(t, { weight: w })] })]))
sweep('brightness', ctl('brightness', steps(-1, 1, 0.1)))
sweep('complexity', ctl('complexity', steps(0, 1, 0.05)))
sweep('motion', ctl('motion', steps(0, 1, 0.1)))
sweep('length', ctl('length', steps(-1, 1, 0.2)))
sweep('shape', ctl('shape', [null, ...SHAPES]))
sweep('register', ctl('register', [null, ...REGISTERS]))
sweep('velocity', ctl('velocity', [null, 0, 0.25, 0.5, 0.75, 1]))
sweep('pitch accent', ctl('pitchAccent', [false, true]))

// a second pin: the neighbour two sectors on (a different tonality, not a blend), its weight and its radius
const other = (t: Tonality) => TONALITIES[(TONALITIES.indexOf(t) + 3) % TONALITIES.length]
const two = (t: Tonality, w: number, r = 0.5): GeneratorChoices => ({ ...base(t), pins: [pin(t), pin(other(t), { weight: w, radius: r })] })
sweep('2nd pin weight', steps(0.05, 1, 0.05).map((w) => [String(w), (t) => two(t, w)]))
sweep('2nd pin radius (w 0.15)', steps(0, 1, 0.1).map((r) => [String(r), (t) => two(t, 0.15, r)]), (t) => two(t, 0.15, 0))
sweep('2nd pin radius (w 0.5)', steps(0, 1, 0.1).map((r) => [String(r), (t) => two(t, 0.5, r)]), (t) => two(t, 0.5, 0))
// both weights scaled together
sweep('both weights ×k', [1, 0.5, 0.2].map((k) => [String(k), (t) => ({ ...base(t), pins: [pin(t, { weight: k }), pin(other(t), { weight: 0.4 * k })] })]), (t) => two(t, 0.4))
// a third pin, after two at 1 and 0.5
const three = (t: Tonality, w: number): GeneratorChoices => ({ ...base(t), pins: [pin(t), pin(other(t), { weight: 0.5 }), pin(TONALITIES[(TONALITIES.indexOf(t) + 7) % 12], { weight: w })] })
sweep('3rd pin weight', steps(0, 0.5, 0.05).map((w) => [String(w), (t) => (w ? three(t, w) : two(t, 0.5))]), (t) => two(t, 0.5))

// every tonality over every other as a second pin, as a transform (0.15) and as a branch (0.5): what it changes
if (mode === 'pairs') {
  console.log('second pin over the first, vs the first alone (dB; = identical voice):')
  console.log(`${''.padEnd(9)}${TONALITIES.map((t) => t.slice(0, 6).padStart(13)).join('')}`)
  for (const t of TONALITIES) {
    const cells = TONALITIES.map((u) => {
      if (u === t) return ''.padStart(13)
      const cell = [0.15, 0.5].map((w) => {
        const c: GeneratorChoices = { ...base(t), pins: [pin(t), pin(u, { weight: w })] }
        const ds = SEEDS.map((s) => { const a = measure(base(t), s); const b = measure(c, s); return a.bytes === b.bytes ? 0 : distance(a.f, b.f) })
        return ds.every((d) => d === 0) ? '=' : median(ds).toFixed(1)
      })
      return cell.join('/').padStart(13)
    })
    console.log(`${t.padEnd(9)}${cells.join('')}`)
  }
}
// the curves: how far the sound is from the control's start at each raw value (median over tonalities and seeds,
// never less than at a value before), then the values that cut that distance into equal parts, one a notch. Equal
// parts of ln(1 + dB / soft): with soft Infinity equal dB, with a few dB a notch grows with the change, so that a
// control whose top is far steeper than the rest (Complexity, 11 dB a notch) keeps notches for its gentle part
if (mode === 'calibrate') {
  const NOTCHES = 10
  const fit = (name: string, from: number, to: number, soft: number, make: (t: Tonality, u: number) => GeneratorChoices) => {
    const us = steps(0, 1, 0.05).map((k) => from + (to - from) * k)
    const far: number[] = []
    for (const u of us) far.push(Math.max(far.at(-1) ?? 0, median(TONALITIES.flatMap((t) => SEEDS.map((s) => distance(measure(make(t, from), s).f, measure(make(t, u), s).f))))))
    const g = far.map((d) => (soft === Infinity ? d : Math.log1p(d / soft)))
    const points: [number, number][] = [[from, from]]
    for (let j = 1; j < NOTCHES; j++) {
      const target = (g.at(-1)! * j) / NOTCHES
      const i = Math.max(1, g.findIndex((x) => x >= target))
      const k = g[i] === g[i - 1] ? 0 : (target - g[i - 1]) / (g[i] - g[i - 1])
      points.push([+(from + ((to - from) * j) / NOTCHES).toFixed(3), +(us[i - 1] + (us[i] - us[i - 1]) * k).toFixed(3)])
    }
    points.push([to, to])
    console.log(`${name} ${from}→${to}: from the start, raw: ${far.filter((_, i) => i % 2 === 0).map((x) => x.toFixed(1)).join(' ')} dB`)
    if (soft !== Infinity) console.log(`  points ${JSON.stringify(points)}`)
    return points
  }
  // raw: the curve straight
  COMPLEXITY_CURVE.splice(0, COMPLEXITY_CURVE.length, [0.5, 0.5], [1, 1])
  fit('complexity', 0.5, 1, 3, (t, u) => ({ ...base(t), complexity: u }))
  fit('motion', 0, 1, Infinity, (t, u) => ({ ...base(t), motion: u }))
}
const yard = median(spread)
console.log(`seed-to-seed distance (same choices): median ${yard.toFixed(2)} dB  (${spread.length} pairs)\n`)
const controls = [...new Set(rows.map((r) => r.control))]
for (const control of controls) {
  console.log(control)
  const rs = rows.filter((r) => r.control === control)
  for (const state of [...new Set(rs.map((r) => r.state))]) {
    const s = rs.filter((r) => r.state === state)
    const ds = s.map((r) => r.d)
    const steps = s.map((r) => r.dStep).filter((x): x is number => x !== null)
    const same = s.filter((r) => r.same).length / s.length
    const deadFor = TONALITIES.filter((t) => s.filter((r) => r.tonality === t).every((r) => r.same))
    console.log(`  ${state.padEnd(6)} vs neutral ${median(ds).toFixed(2).padStart(6)} dB (${(median(ds) / yard).toFixed(2)}×)  step ${steps.length ? median(steps).toFixed(2).padStart(5) : '   — '}  identical ${(same * 100).toFixed(0).padStart(3)}%${deadFor.length && deadFor.length < 12 ? `  (no-op on ${deadFor.join(', ')})` : ''}`)
  }
  // per tonality: where this control does least
  const per = TONALITIES.map((t) => [t, median(rs.filter((r) => r.tonality === t && r.state !== rs[0].state).map((r) => r.d))] as const).sort((a, b) => a[1] - b[1])
  console.log(`  least on: ${per.slice(0, 3).map(([t, d]) => `${t} ${d.toFixed(2)}`).join(', ')}   most on: ${per.slice(-2).map(([t, d]) => `${t} ${d.toFixed(2)}`).join(', ')}\n`)
}
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify({ yard, spread, rows }))
