// Prints voices as parameter tables, and measures them as tools/instruments.ts does: what a known good patch is
// made of. npx vite-node tools/dump-voices.ts voices.json "NAME|NAME" [out.syx]
import { readFileSync, writeFileSync } from 'node:fs'
import { algorithmOf } from '../src/dx7/algorithms'
import { getOp, VC, voiceName, type Voice } from '../src/dx7/voice'
import { vmemMessage } from '../src/dx7/sysex'
import { soundTraits } from '../src/generator/naming'
import { loudness } from '../src/generator/loudness'

const list: { name: string; where: string[]; voice: number[] }[] = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const pick = process.argv[3].split('|')
const chosen: Voice[] = []
for (const want of pick) {
  const [name, place] = want.split('@')
  const e = list.find((x) => x.name.trim() === name.trim() && (!place || x.where.some((w) => w.includes(place))))
  if (!e) { console.log('missing', want); continue }
  const v = Uint8Array.from(e.voice)
  chosen.push(v)
  const alg = algorithmOf(v[VC.algorithm])
  const t = soundTraits(v)
  console.log(`\n${voiceName(v)}  (${e.where.length}×, ${e.where[0]})`)
  console.log(`alg ${v[VC.algorithm] + 1} carriers ${alg.carriers} fb ${v[VC.feedback]} trans ${v[VC.transpose] - 24} lfo spd ${v[VC.lfoSpeed]} pmd ${v[VC.lfoPitchDepth]} amd ${v[VC.lfoAmpDepth]} wave ${v[VC.lfoWave]} pms ${v[VC.pitchModSens]} sync ${v[VC.oscKeySync]}`)
  console.log(`pitch eg r ${[0, 1, 2, 3].map((i) => v[VC.pitchRate1 + i])} l ${[0, 1, 2, 3].map((i) => v[VC.pitchLevel1 + i])}`)
  console.log(`traits att ${t.attack.toFixed(2)} dec ${t.decay === Infinity ? '∞' : t.decay.toFixed(2)} br ${t.brightness.toFixed(1)} per ${t.periodicity.toFixed(2)} noise ${t.noise.toExponential(0)} loud ${loudness(v).toFixed(1)}`)
  console.log('op  out ratio   det  rates        levels       bp  ld rd lc rc rs ams vel')
  for (let op = 1; op <= 6; op++) {
    const g = (p: Parameters<typeof getOp>[2]) => getOp(v, op, p)
    const fixed = g('oscMode') === 1
    const ratio = fixed ? `${(10 ** (g('coarse') % 4) * (1 + g('fine') / 100 * 8.772)).toFixed(0)}Hz` : ((g('coarse') || 0.5) * (1 + g('fine') / 100)).toFixed(2)
    const role = alg.carriers.includes(op) ? 'C' : 'm'
    console.log(`${op}${role} ${String(g('outputLevel')).padStart(3)} ${ratio.padStart(6)} ${String(g('detune') - 7).padStart(3)}  ${[g('rate1'), g('rate2'), g('rate3'), g('rate4')].map((x) => String(x).padStart(2)).join(' ')}  ${[g('level1'), g('level2'), g('level3'), g('level4')].map((x) => String(x).padStart(2)).join(' ')}  ${String(g('breakPoint')).padStart(2)} ${String(g('leftDepth')).padStart(2)} ${String(g('rightDepth')).padStart(2)} ${g('leftCurve')}  ${g('rightCurve')}  ${g('rateScaling')}  ${g('ampModSens')}   ${g('velocitySens')}`)
  }
}
if (process.argv[4]) {
  while (chosen.length < 32) chosen.push(chosen[chosen.length % Math.max(1, pick.length)])
  writeFileSync(process.argv[4], vmemMessage(chosen.slice(0, 32)))
}
