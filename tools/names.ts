// What the sound-based names come out as (docs/SOUND.md): each tonality, plain and wild, with the traits behind
// the name. npx vite-node tools/names.ts
import { angleOf, DEFAULT_CHOICES, TONALITIES, type GeneratorChoices } from '../src/generator/choices'
import { generate } from '../src/generator/generate'
import { nameOfSound, soundTraits } from '../src/generator/naming'

const show = (label: string, c: GeneratorChoices, wild: number, seed: number) => {
  const t = soundTraits(generate(c, { seed, wild }).voice)
  const d = t.decay === Infinity ? '∞' : t.decay.toFixed(2)
  console.log(`${label.padEnd(26)} ${nameOfSound(t).padEnd(11)} att ${t.attack.toFixed(2)} dec ${d.padStart(4)} br ${t.brightness.toFixed(1).padStart(4)} noise ${t.noise.toFixed(3)} per ${t.periodicity.toFixed(2)} f0 ${Math.round(t.f0)}${t.hollow ? ' hollow' : ''} wob ${t.wobble.toFixed(2)} spr ${t.spread}`)
}
for (const tn of TONALITIES) {
  const c = { ...DEFAULT_CHOICES, pins: [{ angle: angleOf(tn), radius: 0.5, weight: 1 }] }
  show(`${tn}`, c, 0, 1)
  show(`${tn} wild`, c, 1, 2)
}
show('warm+motion 1', { ...DEFAULT_CHOICES, motion: 1, pins: [{ angle: angleOf('warm'), radius: 0.5, weight: 1 }] }, 0, 3)
show('bell+warm', { ...DEFAULT_CHOICES, pins: [{ angle: angleOf('bell'), radius: 0.5, weight: 0.6 }, { angle: angleOf('warm'), radius: 0.5, weight: 0.4 }] }, 0, 4)
show('warm bass', { ...DEFAULT_CHOICES, register: 'bass', pins: [{ angle: angleOf('warm'), radius: 0.5, weight: 1 }] }, 0, 5)
show('init (sine)', { ...DEFAULT_CHOICES, shape: 'gate', brightness: -1, complexity: 0, pins: [{ angle: angleOf('warm'), radius: 0, weight: 1 }] }, 0, 6)
show('string pad', { ...DEFAULT_CHOICES, shape: 'pad', pins: [{ angle: angleOf('string'), radius: 0.5, weight: 1 }] }, 0, 7)
show('wooden + noise', { ...DEFAULT_CHOICES, pins: [{ angle: angleOf('wooden'), radius: 0.5, weight: 1 }, { angle: angleOf('noise'), radius: 0.5, weight: 0.3 }] }, 0, 8)
