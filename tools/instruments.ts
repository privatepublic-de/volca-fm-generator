// Every instrument measured (docs/SOUND.md): its name and the traits behind it, at C4. npx vite-node tools/instruments.ts
import { DEFAULT_CHOICES } from '../src/generator/choices'
import { generate } from '../src/generator/generate'
import { INSTRUMENT_IDS, INSTRUMENTS } from '../src/generator/instruments'
import { soundTraits } from '../src/generator/naming'
import { centroid, pitch, slice } from '../src/engine/measure'
import { renderNote } from '../src/engine/render'
import { voiceName } from '../src/dx7/voice'

for (const id of INSTRUMENT_IDS) {
  const inst = INSTRUMENTS[id]
  const g = generate({ ...DEFAULT_CHOICES, ...inst.controls, instrument: id }, { seed: 1 })
  const t = soundTraits(g.voice)
  const seg = { samples: renderNote(g.voice, { sampleRate: 16000, holdSeconds: 1 }), sampleRate: 16000 }
  const p0 = pitch(slice(seg, 0.005, 0.04))
  const early = centroid(slice(seg, 0.01, 0.09)) / (t.f0 || 261.6)
  const p1 = pitch(slice(seg, 0.3, 0.6))
  const d = t.decay === Infinity ? '∞' : t.decay.toFixed(2)
  console.log(`${inst.group.padEnd(10)} ${voiceName(g.voice).padEnd(11)} att ${t.attack.toFixed(2)} dec ${d.padStart(4)} br ${early.toFixed(1).padStart(5)}→${t.brightness.toFixed(1).padStart(4)} noise ${t.noise.toExponential(0)} per ${t.periodicity.toFixed(2)} pitch ${Math.round(p0)}→${Math.round(p1)} loud ${g.loudness.toFixed(1)}`)
}
