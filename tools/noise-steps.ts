// How gradually noise comes into each tonality as its weight grows (docs/SOUND.md): log10 of the spectral flatness,
// t = as a colour (transform), b = as a branch. npx vite-node tools/noise-steps.ts
import { angleOf, DEFAULT_CHOICES, type Tonality } from '../src/generator/choices'
import { generate } from '../src/generator/generate'
import { flatness, slice } from '../src/engine/measure'
import { renderNote } from '../src/engine/render'
const SR = 24000
for (const base of ['warm', 'bell', 'brass', 'organ', 'metallic', 'string'] as Tonality[]) {
  const row: string[] = []
  for (const w of [0, 0.03, 0.06, 0.1, 0.15, 0.2, 0.24, 0.3, 0.45, 0.7, 1]) {
    let sum = 0, how = ''
    for (const seed of [1, 2, 3]) {
      const g = generate({ ...DEFAULT_CHOICES, pins: [{ angle: angleOf(base), radius: 0.5, weight: 1 }, ...(w ? [{ angle: angleOf('noise'), radius: 0.5, weight: w }] : [])] }, { seed })
      how = g.roles[1]?.as?.[0] ?? '-'
      const s = { samples: renderNote(g.voice, { sampleRate: SR, holdSeconds: 1 }), sampleRate: SR }
      sum += Math.log10(flatness(slice(s, 0.3, 0.8)) + 1e-9)
    }
    row.push(`${w}${how}:${(sum / 3).toFixed(1)}`)
  }
  console.log(base.padEnd(9), row.join('  '))
}
