import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { readSyx } from '../src/dx7/sysex'
import { voiceName } from '../src/dx7/voice'
const root = process.argv[2]
const re = new RegExp(process.argv[3], 'i')
const files: string[] = []
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.syx$/i.test(f)) files.push(p) } }
walk(root)
const seen = new Map<string, { name: string; where: string[]; voice: number[] }>()
for (const f of files) {
  let c; try { c = readSyx(readFileSync(f)) } catch { continue }
  for (const { voice, source } of c.voices) {
    const name = voiceName(voice)
    if (!re.test(name)) continue
    const key = Buffer.from(voice.subarray(0, 145)).toString('hex')
    const e = seen.get(key) ?? { name, where: [], voice: [...voice] }
    e.where.push(`${relative(root, f)} ${source}`)
    seen.set(key, e)
  }
}
const list = [...seen.values()].sort((a, b) => b.where.length - a.where.length)
console.log(files.length, 'files', list.length, 'distinct matches')
for (const e of list) console.log(String(e.where.length).padStart(3), e.name.padEnd(11), e.where[0])
writeFileSync(process.argv[4], JSON.stringify(list))
