// Turns classic patches from a DX7 library into instrument recipes (src/generator/instruments.ts): the operators,
// envelopes, keyboard scaling, LFO and pitch envelope as the original has them, the levels exact (one step can tip
// a feedback-7 operator into another sound). Each recipe keeps its label, group, family and hint; the rest is
// replaced, with a comment naming the source.
// npx vite-node tools/recipe-from-voice.ts [--write] id=NAME@place-in-path …
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { readSyx } from '../src/dx7/sysex'
import { getOp, VC, voiceName, type Voice } from '../src/dx7/voice'
import { ratioOf } from '../src/dx7/frequency'

const ROOT = join(homedir(), 'Library/Application Support/DigitalSuburban/Dexed/Cartridges')
const FILE = 'src/generator/instruments.ts'
const write = process.argv.includes('--write')
const specs = process.argv.slice(2).filter((a) => a.includes('=')).map((a) => {
  const [id, rest] = a.split('=')
  const [name, place] = rest.split('@')
  return { id, name, place: place ?? '' }
})

const files: string[] = []
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.syx$/i.test(f)) files.push(p) } }
walk(ROOT)
const found = new Map<string, { voice: Voice; where: string }>()
for (const f of files) {
  let c; try { c = readSyx(readFileSync(f)) } catch { continue }
  for (const { voice, source } of c.voices) {
    const where = `${relative(ROOT, f)} ${source}`
    for (const s of specs) if (!found.has(s.id) && voiceName(voice).trim() === s.name.trim() && where.includes(s.place)) found.set(s.id, { voice, where })
  }
}

const num = (x: number) => String(Math.round(x * 1000) / 1000)
function recipe(v: Voice, shape: string): string {
  const ops: string[] = []
  const details: string[] = []
  for (let op = 1; op <= 6; op++) {
    const g = (p: Parameters<typeof getOp>[2]) => getOp(v, op, p)
    if (g('outputLevel') === 0) continue
    const level = g('outputLevel')
    const freq = g('oscMode') === 1
      ? (() => { const hz = Math.round(10 ** ((g('coarse') % 4) + g('fine') / 100) * 10) / 10; return `fixed: [${hz}, ${hz}]` })()
      : `ratio: [${num(ratioOf(g('coarse'), g('fine')))}]`
    const parts = [freq, `level: ${level}`]
    if (g('detune') !== 7) parts.push(`detune: ${g('detune') - 7}`)
    if (g('velocitySens')) parts.push(`velocity: ${g('velocitySens')}`)
    ops.push(`${op}: { ${parts.join(', ')} }`)
    const d = [`eg: eg([${[0, 1, 2, 3].map((i) => v[(6 - op) * 21 + i])}], [${[4, 5, 6, 7].map((i) => v[(6 - op) * 21 + i])}])`]
    if (g('rateScaling')) d.push(`rateScaling: ${g('rateScaling')}`)
    if (g('ampModSens') && v[VC.lfoAmpDepth]) d.push(`ams: ${g('ampModSens')}`)
    if (g('leftDepth') || g('rightDepth')) d.push(`scaling: [${[g('breakPoint'), g('leftDepth'), g('rightDepth'), g('leftCurve'), g('rightCurve')]}]`)
    details.push(`      ${op}: { ${d.join(', ')} },`)
  }
  const sk = [`algorithms: [${v[VC.algorithm] + 1}]`, `shape: '${shape}'`]
  if (v[VC.feedback]) sk.push(`feedback: ${v[VC.feedback]}`)
  const out = [
    `    skeleton: {`,
    `      ${sk.join(', ')},`,
    `      ops: {`,
    ...ops.map((o) => `        ${o},`),
    `      },`,
    `    },`,
    `    ops: {`,
    ...details,
    `    },`,
  ]
  const pl = [VC.pitchLevel1, VC.pitchLevel2].map((i) => v[i])
  if (pl.some((l) => l !== 50)) out.push(`    pitchEg: eg([${[0, 1, 2, 3].map((i) => v[VC.pitchRate1 + i])}], [${pl}, 50, 50]),`)
  const extra: string[] = []
  if (v[VC.transpose] !== 24) extra.push(`transpose: ${v[VC.transpose] - 24}`)
  // the LFO when it does anything: a pitch depth with a sensitivity, or an amplitude depth an operator listens to
  const ams = [1, 2, 3, 4, 5, 6].some((op) => getOp(v, op, 'outputLevel') && getOp(v, op, 'ampModSens'))
  if ((v[VC.lfoPitchDepth] && v[VC.pitchModSens]) || (v[VC.lfoAmpDepth] && ams))
    extra.push(`lfo: [${[VC.lfoSpeed, VC.lfoDelay, VC.lfoPitchDepth, VC.lfoAmpDepth, VC.lfoWave, VC.pitchModSens].map((i) => v[i])}]`)
  if (!v[VC.oscKeySync]) extra.push('keySync: false')
  if (extra.length) out.push(`    ${extra.join(', ')},`)
  return out.join('\n')
}

let text = readFileSync(FILE, 'utf8')
for (const s of specs) {
  const f = found.get(s.id)
  if (!f) { console.log(`${s.id}: ${s.name} not found`); continue }
  const start = text.indexOf(`\n  ${s.id}: {\n`)
  if (start < 0) { console.log(`${s.id}: no such recipe`); continue }
  const end = text.indexOf('\n  },\n', start) + 5
  const block = text.slice(start + 1, end)
  const lines = block.split('\n')
  const head = lines.slice(0, lines.findIndex((l) => l.includes('hint:')) + 1)
  const shape = /shape: '(\w+)'/.exec(block)?.[1] ?? 'struck'
  // the comment above the recipe names its source
  const before = text.slice(0, start + 1).replace(/(\n  \/\/ after [^\n]*)+\n$/, '\n')
  const source = f.where.replace(/^Dexed_cart_1\.0\//, '').replace(/\.syx bank 1 \/ /i, ' #')
  const body = `  // after ${s.name.trim()} (${source})\n${head.join('\n')}\n${recipe(f.voice, shape)}\n  },`
  text = before + body + text.slice(end)
  console.log(`${s.id} ← ${s.name.trim()} (${source})`)
}
if (write) writeFileSync(FILE, text)
else console.log('(dry run: --write to change the recipes)')
