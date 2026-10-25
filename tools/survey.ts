// What the generator makes, measured (docs/SOUND.md): every tonality alone, a few seeds each. npm run survey
import { TONALITIES, angleOf, DEFAULT_CHOICES, type GeneratorChoices } from '../src/generator/choices'
import { generate } from '../src/generator/generate'
import { attackTime, centroid, decayTime, flatness, periodicity, pitch, rms, slice, toDb } from '../src/engine/measure'
import { renderNote } from '../src/engine/render'
import { voiceName } from '../src/dx7/voice'

const SR = 32000
export function measureVoice(v: Uint8Array, note = 60) {
  const seg = { samples: renderNote(v, { note, sampleRate: SR, holdSeconds: 2, releaseSeconds: 1 }), sampleRate: SR }
  const body = slice(seg, 0.1, 0.6)
  const f = pitch(slice(seg, 0.3, 0.8))
  return {
    bright: centroid(body) / 261.6, flat: flatness(body), periodic: periodicity(slice(seg, 0.3, 0.6)), attack: attackTime(slice(seg, 0, 2)), decay: decayTime(slice(seg, 0, 2)),
    db: toDb(rms(body)), pitchOff: f ? 12 * Math.log2(f / 261.6) : NaN,
  }
}

const seeds = [1, 2, 3, 4, 5]
const rows: string[] = []
for (const t of TONALITIES) {
  const c: GeneratorChoices = { ...DEFAULT_CHOICES, pins: [{ angle: angleOf(t), radius: 0.5, weight: 1 }] }
  const ms = seeds.map((seed) => { const g = generate(c, { seed }); return { name: voiceName(g.voice), alg: g.voice[134] + 1, ...measureVoice(g.voice), loud: g.loudness } })
  const avg = (k: 'bright' | 'flat' | 'periodic' | 'attack' | 'db' | 'loud') => ms.reduce((s, m) => s + m[k], 0) / ms.length
  const decays = ms.map((m) => (m.decay === Infinity ? '∞' : m.decay.toFixed(1))).join('/')
  rows.push(`${t.padEnd(9)} ${ms[0].name.padEnd(10)} alg ${[...new Set(ms.map((m) => m.alg))].join(',').padEnd(5)} bright ${avg('bright').toFixed(2).padStart(6)}  flat ${(avg('flat') * 1000).toFixed(1).padStart(5)}‰  periodic ${avg('periodic').toFixed(2)}  attack ${avg('attack').toFixed(2)}s  decay ${decays.padEnd(18)} loud ${avg('loud').toFixed(1)} dB`)
}
console.log(rows.join('\n'))
