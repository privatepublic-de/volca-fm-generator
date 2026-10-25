// Calibration for the generator's numbers (docs/SOUND.md): what modulator levels, feedback and EG rates do in the
// engine. npm run calibrate
import { initVoice, setOp, setVc, type Voice } from '../src/dx7/voice'
import { attackTime, centroid, decayTime, envelope, slice, type Segment } from '../src/engine/measure'
import { renderNote } from '../src/engine/render'

const SR = 32000
const play = (v: Voice, hold = 1, note = 60): Segment => ({ samples: renderNote(v, { sampleRate: SR, holdSeconds: hold, note }), sampleRate: SR })
const f0 = 261.6
const voice = (...e: ((v: Voice) => void)[]) => { const v = initVoice(); e.forEach((f) => f(v)); return v }

console.log('Modulator level at 1:1 → brightness (centroid / f0), algorithm 1, OP2 → OP1')
console.log([0, 30, 40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 99].map((l) => `${l}:${(centroid(slice(play(voice((v) => setOp(v, 2, 'outputLevel', l))), 0.3, 0.8)) / f0).toFixed(2)}`).join('  '))
console.log('Feedback on a lone carrier (OP6, alg 32) → brightness')
console.log([0, 1, 2, 3, 4, 5, 6, 7].map((f) => `${f}:${(centroid(slice(play(voice((v) => { setVc(v, 'algorithm', 31); setOp(v, 1, 'outputLevel', 0); setOp(v, 6, 'outputLevel', 99); setVc(v, 'feedback', f) })), 0.3, 0.8)) / f0).toFixed(2)}`).join('  '))
for (const fb of [5, 6, 7]) {
  console.log(`Feedback ${fb} by the operator's own level (OP6 alone, alg 32) → brightness`)
  console.log([60, 70, 80, 85, 90, 95, 99].map((l) => `${l}:${(centroid(slice(play(voice((v) => { setVc(v, 'algorithm', 31); setOp(v, 1, 'outputLevel', 0); setOp(v, 6, 'outputLevel', l); setVc(v, 'feedback', fb) })), 0.3, 0.8)) / f0).toFixed(2)}`).join('  '))
}
console.log('Ratio 1:N modulator at level 75 → brightness')
console.log([1, 2, 3, 4, 5, 7, 14].map((r) => `${r}:${(centroid(slice(play(voice((v) => { setOp(v, 2, 'outputLevel', 75); setOp(v, 2, 'coarse', r) })), 0.3, 0.8)) / f0).toFixed(2)}`).join('  '))
console.log('Attack: R1 → seconds to 90 %')
console.log([20, 30, 40, 50, 60, 70, 80, 90, 99].map((r) => `${r}:${attackTime(play(voice((v) => setOp(v, 1, 'rate1', r)), 8)).toFixed(3)}`).join('  '))
console.log('Decay: R2 with L2 = 0 → seconds to −20 dB / to −40 dB')
for (const r of [20, 30, 40, 50, 60, 70, 80, 90]) {
  const s = play(voice((v) => { setOp(v, 1, 'rate2', r); setOp(v, 1, 'level2', 0); setOp(v, 1, 'level3', 0) }), 20)
  const env = envelope(s, 0.005)
  const top = Math.max(...env)
  const t40 = env.findIndex((x, i) => i > 2 && x < top / 100) * 0.005
  console.log(`  ${r}: ${decayTime(s).toFixed(2)} s / ${t40.toFixed(2)} s`)
}
console.log('Level steps: EG level → dB below 99')
console.log([99, 95, 90, 85, 80, 75, 70, 60, 50].map((l) => `${l}:${(-(99 - l) * 0.75).toFixed(1)}`).join('  '), '(0.75 dB per step above 20)')
