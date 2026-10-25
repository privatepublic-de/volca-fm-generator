// Phase 2's test page: the browser engine next to the volca, to compare voices by ear (PLAN §5).
import { algorithmOf } from './dx7/algorithms'
import { readSyx } from './dx7/sysex'
import { VC, voiceName, type Voice } from './dx7/voice'
import { bright, octaves, paramTests, pure } from './probe/testVoices'
import { Player } from './ui/player'

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T
const voicesEl = $<HTMLUListElement>('#voices')
const infoEl = $<HTMLDivElement>('#info')
const player = new Player()

interface Entry { voice: Voice; source: string }
const builtIn: Entry[] = [
  { voice: pure(), source: 'probe' }, { voice: bright(), source: 'probe' }, { voice: octaves(), source: 'probe' },
  ...paramTests().flatMap((t) => [{ voice: t.a, source: 'probe' }, { voice: t.b, source: 'probe' }]),
]
let loaded: Entry[] = []
let loadedName = ''

function listVoices() {
  const item = (e: Entry, i: number) => {
    const li = document.createElement('li')
    li.innerHTML = `<span class="src"></span><span class="name"></span>`
    li.querySelector('.src')!.textContent = e.source
    li.querySelector('.name')!.textContent = voiceName(e.voice)
    li.dataset.index = String(i)
    li.addEventListener('click', () => {
      for (const x of voicesEl.querySelectorAll('li.sel')) x.classList.remove('sel')
      li.classList.add('sel')
      selectVoice(e.voice)
    })
    return li
  }
  const group = (text: string) => {
    const li = document.createElement('li')
    li.className = 'group'
    li.textContent = text
    return li
  }
  voicesEl.replaceChildren(
    ...(loaded.length ? [group(loadedName), ...loaded.map((e, i) => item(e, i))] : []),
    group('Probe voices'), ...builtIn.map((e, i) => item(e, loaded.length + i)))
}

function selectVoice(v: Voice) {
  player.setVoice(v)
  const alg = algorithmOf(v[VC.algorithm])
  infoEl.innerHTML = ''
  const line = (label: string, value: string) => {
    const div = document.createElement('div')
    div.append(`${label} `)
    const b = document.createElement('b')
    b.textContent = value
    div.append(b)
    infoEl.append(div)
  }
  line('Voice', voiceName(v))
  line('Algorithm', `${alg.number}: carriers ${alg.carriers.join(', ')}, feedback ${v[VC.feedback]}${alg.feedback.from !== alg.feedback.to ? ` (OP${alg.feedback.from} → OP${alg.feedback.to})` : ` (OP${alg.feedback.from})`}`)
}

$<HTMLInputElement>('#file').addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  const read = readSyx(new Uint8Array(await f.arrayBuffer()))
  loaded = read.voices.map((v) => ({ voice: v.voice, source: v.source.replace(/^bank \d+ \/ /, '') }))
  loadedName = `${f.name}${read.notes.length ? ` (${read.notes.length} notes: ${read.notes[0]})` : ''}`
  listVoices()
})

listVoices()
selectVoice(builtIn[0].voice)
voicesEl.querySelector<HTMLLIElement>('li[data-index]')?.classList.add('sel')
