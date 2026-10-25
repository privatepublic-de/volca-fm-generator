// Every instrument against the classic patches of its name in a DX7 library (Dexed's cartridge folder by
// default): the originals' traits beside ours, Yamaha's own first, then the most copied. docs/SOUND.md.
// npx vite-node tools/compare-library.ts [library folder] [instrument ids, comma-separated]
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { readSyx } from '../src/dx7/sysex'
import { VC, voiceName, type Voice } from '../src/dx7/voice'
import { DEFAULT_CHOICES } from '../src/generator/choices'
import { generate } from '../src/generator/generate'
import { INSTRUMENT_IDS, INSTRUMENTS, type InstrumentId } from '../src/generator/instruments'
import { soundTraits } from '../src/generator/naming'

const root = process.argv[2] || join(homedir(), 'Library/Application Support/DigitalSuburban/Dexed/Cartridges')
const only = process.argv[3]?.split(',') as InstrumentId[] | undefined

/** voice names that mean the instrument (and the ones that don't) */
const NAMES: Partial<Record<InstrumentId, [RegExp, RegExp?]>> = {
  piano: [/grand|1st-piano|real piano|a\.?pno|ac\.? ?pno|piano +1$/i, /e\.|elec|syn|bras|prix|clav/i],
  upright: [/upright|honky/i, /bass/i],
  epiano: [/e\.? ?pian|e\.? ?pno|el\.? ?pian|rhodes|road/i, /grand|bass/i],
  harpsichord: [/harpsi|hrpsi|hpsch/i],
  clavinet: [/clav/i, /clavi?cor|grand|e\.p/i],
  nylonGuitar: [/nylon|class.*gu?i?t|span.*gu?i?t|gut gtr/i],
  steelGuitar: [/steel.*g|folk.*g|acou?s?t?.*g(ui)?t/i],
  harp: [/^\W*harp(?!si)/i],
  koto: [/koto/i],
  sitar: [/sitar/i],
  pizzicato: [/pizz/i],
  vibraphone: [/vibe|vibra/i],
  xylophone: [/xylo/i, /piano/i],
  glockenspiel: [/glock/i],
  steelDrum: [/steel ?dr|steel ?pan|calyps/i],
  fmBass: [/^\W*(bass +[0-9]|fm ?bass|e\.? ?bass|elec.*bass|fing.*bass)/i, /syn|slap|piano/i],
  slapBass: [/slap|thumb|pop.*bass/i],
  uprightBass: [/upr.*bass|acou.*bass|wood.*bass|contra|string.*bass|jazz.*bass/i, /syn/i],
  synthBass: [/syn.*bass|bass.*syn|moog.*bass|analog.*bass/i],
  oboe: [/oboe/i],
  bassoon: [/basson|bassoon|fagot/i],
  sax: [/sax/i, /bass/i],
  harmonica: [/harmonica|harp.*blues|blues.*harp/i],
  accordion: [/accord|musette|bandon/i],
  trumpet: [/trump|trp/i, /syn/i],
  trombone: [/trombo|bone/i],
  frenchHorn: [/^\W*horn|fr.*horn|mellow.*horn/i, /sec|syn/i],
  tuba: [/tuba/i],
  brassSection: [/^\W*brass +[0-9]|brass ?sect|horn ?sec/i, /syn/i],
  violin: [/violin|fiddle/i],
  cello: [/cello/i],
  kick: [/kick|bass ?dr|bd\b/i],
  snare: [/snare|sd\b/i],
  tom: [/\btoms?\b|tom-?tom/i],
  hiHat: [/hi.?hat|hh\b/i],
  cymbal: [/cymb|crash|ride/i],
  cowbell: [/cow ?bell/i],
  timpani: [/timp|kettle/i],
  choir: [/choir|chorus|voices|vox/i, /pno|piano|str/i],
  ooh: [/ooh|aah|hum/i],
  whistle: [/whistl/i],
}

interface Found { name: string; where: string[]; voice: Voice }
const files: string[] = []
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.syx$/i.test(f)) files.push(p) } }
walk(root)
const voices = new Map<string, Found>()
for (const f of files) {
  let c; try { c = readSyx(readFileSync(f)) } catch { continue }
  for (const { voice, source } of c.voices) {
    const key = Buffer.from(voice.subarray(0, 145)).toString('hex')
    const e = voices.get(key) ?? { name: voiceName(voice), where: [], voice }
    e.where.push(`${relative(root, f)} ${source}`)
    voices.set(key, e)
  }
}

const yamaha = (e: Found) => e.where.some((w) => /Original Yamaha/.test(w))
const decay = (d: number) => (d === Infinity ? '  ∞ ' : d.toFixed(2))
const line = (label: string, v: Voice, note: string) => {
  const t = soundTraits(v)
  return `  ${label.padEnd(11)} alg ${String(v[VC.algorithm] + 1).padStart(2)} att ${t.attack.toFixed(2)} rise ${t.rise.toFixed(2)} dec ${decay(t.decay)} br ${t.brightness.toFixed(1).padStart(4)} noise ${t.noise.toExponential(0)} per ${t.periodicity.toFixed(2)} f0 ${Math.round(t.f0).toString().padStart(4)}  ${note}`
}
for (const id of only ?? INSTRUMENT_IDS) {
  const [yes, no] = NAMES[id] ?? [new RegExp(INSTRUMENTS[id].label, 'i')]
  const found = [...voices.values()].filter((e) => yes.test(e.name) && !no?.test(e.name))
  found.sort((a, b) => Number(yamaha(b)) - Number(yamaha(a)) || b.where.length - a.where.length)
  console.log(`\n${INSTRUMENTS[id].name ?? INSTRUMENTS[id].label} (${found.length} in the library)`)
  const g = generate({ ...DEFAULT_CHOICES, ...INSTRUMENTS[id].controls, instrument: id }, { seed: 1 })
  console.log(line('ours', g.voice, ''))
  for (const e of found.slice(0, 4)) console.log(line(e.name, e.voice, `${e.where.length}× ${(e.where.find((w) => /Original Yamaha/.test(w)) ?? e.where[0]).replace(/^Dexed_cart_1\.0\//, '')}`))
}
