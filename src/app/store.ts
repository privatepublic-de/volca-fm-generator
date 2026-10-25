// The app's state (PLAN §6): the pins and controls, the voice they make, the session's history and the kept
// favourites. Pins, controls and favourites are kept in this browser; the history lasts the session.
import { create } from 'zustand'
import { readSyx } from '../dx7/sysex'
import { setVoiceName, VC, voiceName, type Voice } from '../dx7/voice'
import type { Model } from '../engine/models'
import { angleOf, DEFAULT_CHOICES, mixOf, TONALITY_HUES, type GeneratorChoices, type Pin, type Tonality } from '../generator/choices'
import { mutateChoices } from '../generator/explore'
import { generate, type Generated } from '../generator/generate'
import { rng as makeRng } from '../generator/random'
import { newSeed } from '../generator/random'
import { Playback } from '../ui/playback'

export const playback = new Playback()

export type Controls = Omit<GeneratorChoices, 'pins'>

export interface AppPin extends Pin {
  id: number
}

export interface Entry {
  id: number
  voice: Voice
  name: string
  /** the dominant tonality's hue, for the tiles */
  hue: number
  /** what made it, when the generator did: to take its pins and controls back */
  made?: { pins: AppPin[]; controls: Controls; seed: number; wild: number }
}

/** The most pins on the wheel. */
export const MAX_PINS = 3
const HISTORY_LENGTH = 48
const STATE_KEY = 'volca:app'
const FAVOURITES_KEY = 'volca:favourites'

interface Saved {
  pins: AppPin[]
  controls: Controls
  wild: number
  seed: number
  /** play a note after every change */
  autoplay: boolean
}

interface State extends Saved {
  model: Model
  /** what the generator made from the current pins and controls (null: a voice from the history or a file) */
  generated: Generated | null
  voice: Voice
  /** the history entry the voice is, if any */
  currentId: number | null
  history: Entry[]
  favourites: Entry[]
  selectedPin: number | null

  addPin(angle: number, radius: number): number | null
  movePin(id: number, angle: number, radius: number): void
  setWeight(id: number, weight: number): void
  removePin(id: number): void
  selectPin(id: number | null): void
  setControl<K extends keyof Controls>(key: K, value: Controls[K]): void
  setWild(wild: number): void
  setModel(model: Model): void
  setAutoplay(on: boolean): void
  /** the same seed again (after a change); `record` puts it in the history */
  regenerate(record?: boolean): void
  generateNew(): void
  /** back to the start: one mild Warm pin, everything dialled down, a plain held sine */
  initVoice(): void
  variation(): void
  mutateCurrent(): void
  recall(entry: Entry): void
  /** undo and redo: the voice before or after the current one in this session's history */
  back(): void
  forward(): void
  keep(): void
  unkeep(id: number): void
  rename(id: number, name: string): void
  importFile(bytes: Uint8Array, fileName: string): string
}

let nextId = 1
const hueOf = (g: Generated | null) => TONALITY_HUES[g?.mix[0]?.tonality ?? 'warm']

function load(): Saved {
  const fallback: Saved = {
    pins: [{ id: nextId++, angle: 60, radius: 0.6, weight: 0.6 }, { id: nextId++, angle: 210, radius: 0.5, weight: 0.4 }],
    controls: { ...DEFAULT_CHOICES },
    wild: 0,
    seed: newSeed(),
    autoplay: true,
  }
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') as Saved | null
    if (!s) return fallback
    s.pins.forEach((p) => (p.id = nextId++))
    return { ...fallback, ...s, controls: { ...DEFAULT_CHOICES, ...s.controls } }
  } catch {
    return fallback
  }
}

function loadFavourites(): Entry[] {
  try {
    const list = JSON.parse(localStorage.getItem(FAVOURITES_KEY) ?? '[]') as { voice: number[]; name: string; hue: number; made?: Entry['made'] }[]
    return list.map((f) => ({
      id: nextId++, voice: Uint8Array.from(f.voice), name: f.name, hue: f.hue,
      made: f.made && { ...f.made, pins: f.made.pins.map((p) => ({ ...p, id: nextId++ })) },
    }))
  } catch {
    return []
  }
}

function saveFavourites(list: Entry[]) {
  try {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(list.map((f) => ({ voice: Array.from(f.voice), name: f.name, hue: f.hue, made: f.made }))))
  } catch { /* private window */ }
}

/** Init voice's controls: everything down, the gate envelope. */
const { pins: _noPins, ...DEFAULT_CONTROLS } = DEFAULT_CHOICES
export const INIT_CONTROLS: Controls = { ...DEFAULT_CONTROLS, shape: 'gate', brightness: -1, complexity: 0, motion: 0, length: 0, velocity: 0, pitchAccent: false, register: null }

/** The same sound: every byte but the name (a renamed kept voice is still the voice the wheel made). */
export const sameSound = (a: Voice, b: Voice) => a.subarray(0, VC.name).every((x, i) => x === b[i])

export const choicesOf = (s: Pick<State, 'pins' | 'controls'>): GeneratorChoices => ({ ...s.controls, pins: s.pins })

export const useApp = create<State>((set, get) => {
  const saved = load()

  const persist = () => {
    const { pins, controls, wild, seed, autoplay } = get()
    try { localStorage.setItem(STATE_KEY, JSON.stringify({ pins, controls, wild, seed, autoplay })) } catch { /* private window */ }
  }

  /** A new voice on stage: to the player, and to the history when it's a step. */
  const show = (voice: Voice, generated: Generated | null, record: boolean, wildUsed = get().wild) => {
    playback.setVoice(voice)
    let currentId: number | null = null
    let history = get().history
    if (record) {
      const s = get()
      const entry: Entry = {
        id: nextId++, voice, name: voiceName(voice), hue: hueOf(generated),
        made: generated ? { pins: s.pins.map((p) => ({ ...p })), controls: { ...s.controls }, seed: s.seed, wild: wildUsed } : undefined,
      }
      history = [...history, entry].slice(-HISTORY_LENGTH)
      currentId = entry.id
    }
    set({ voice, generated, currentId, history })
  }

  /** The voice of the current pins and controls; `wild` for this roll only (Variation rolls wilder). */
  const make = (record: boolean, wild = get().wild) => {
    const s = get()
    const g = generate(choicesOf(s), { seed: s.seed, model: s.model, wild })
    persist()
    show(g.voice, g, record, wild)
  }

  const first = generate(choicesOf(saved), { seed: saved.seed, model: playback.settings.model, wild: saved.wild })
  playback.setVoice(first.voice)

  return {
    ...saved,
    model: playback.settings.model,
    generated: first,
    voice: first.voice,
    currentId: null,
    history: [],
    favourites: loadFavourites(),
    selectedPin: null,

    addPin(angle, radius) {
      if (get().pins.length >= MAX_PINS) return null
      const id = nextId++
      set({ pins: [...get().pins, { id, angle, radius, weight: 0.5 }], selectedPin: id })
      make(false)
      return id
    },
    movePin(id, angle, radius) {
      set({ pins: get().pins.map((p) => (p.id === id ? { ...p, angle, radius } : p)) })
      make(false)
    },
    setWeight(id, weight) {
      set({ pins: get().pins.map((p) => (p.id === id ? { ...p, weight: Math.max(0.05, Math.min(1, weight)) } : p)) })
      make(false)
    },
    removePin(id) {
      set({ pins: get().pins.filter((p) => p.id !== id), selectedPin: null })
      make(true)
    },
    selectPin(id) {
      set({ selectedPin: id })
    },
    setControl(key, value) {
      set({ controls: { ...get().controls, [key]: value } })
      make(false)
    },
    setWild(wild) {
      set({ wild })
      make(false)
    },
    setModel(model) {
      playback.set({ model })
      set({ model })
      make(false)
    },
    setAutoplay(autoplay) {
      set({ autoplay })
      persist()
    },
    regenerate(record = false) {
      make(record)
    },
    initVoice() {
      set({
        pins: [{ id: nextId++, angle: angleOf('warm'), radius: 0, weight: 1 }],
        controls: { ...INIT_CONTROLS },
        wild: 0,
        seed: newSeed(),
        selectedPin: null,
      })
      make(true)
    },
    generateNew() {
      set({ seed: newSeed() })
      make(true)
    },
    variation() {
      // the same pins and controls, another roll, and a free one: at least three quarters of the way to Wild
      set({ seed: newSeed() })
      make(true, Math.min(1, Math.max(get().wild, 0.5) + 0.25))
    },
    mutateCurrent() {
      // the pins move and the controls get a push; then a new voice from there
      const s = get()
      const m = mutateChoices(choicesOf(s), makeRng(newSeed()), 0.6, MAX_PINS)
      const { pins, ...controls } = m
      set({ pins: pins.map((p, i) => ({ ...p, id: s.pins[i]?.id ?? nextId++ })), controls, seed: newSeed(), selectedPin: null })
      make(true)
    },
    recall(entry) {
      if (entry.made) {
        set({ pins: entry.made.pins.map((p) => ({ ...p })), controls: { ...entry.made.controls }, seed: entry.made.seed, wild: entry.made.wild })
        persist()
      }
      // the entry's own bytes (a mutation can't be made again from pins), with the generator's view when it has one
      const g = entry.made ? generate(choicesOf(get()), { seed: get().seed, model: get().model, wild: get().wild }) : null
      playback.setVoice(entry.voice)
      // the generator's view only if it makes exactly these bytes (another model, or a mutation, doesn't)
      const same = g !== null && sameSound(g.voice, entry.voice)
      set({ voice: entry.voice, generated: same ? g : null, currentId: entry.id })
    },
    back() {
      const { history, currentId, recall } = get()
      const i = history.findIndex((h) => h.id === currentId)
      // not on an entry (a kept voice, or just changed): back to the newest
      const to = i < 0 ? history.at(-1) : history[i - 1]
      if (to) recall(to)
    },
    forward() {
      const { history, currentId, recall } = get()
      const i = history.findIndex((h) => h.id === currentId)
      if (i >= 0 && history[i + 1]) recall(history[i + 1])
    },
    keep() {
      const s = get()
      const current = s.history.find((h) => h.id === s.currentId)
      const hue = current?.hue ?? hueOf(s.generated)
      if (s.favourites.some((f) => sameSound(f.voice, s.voice))) return
      // with what made it, so it brings its pins and controls back
      const made = current && sameSound(current.voice, s.voice) ? current.made : undefined
      const favourites = [...s.favourites, { id: nextId++, voice: s.voice, name: voiceName(s.voice), hue, made }]
      saveFavourites(favourites)
      set({ favourites })
    },
    unkeep(id) {
      const favourites = get().favourites.filter((f) => f.id !== id)
      saveFavourites(favourites)
      set({ favourites })
    },
    rename(id, name) {
      const favourites = get().favourites.map((f) => {
        if (f.id !== id) return f
        const voice = Uint8Array.from(f.voice)
        setVoiceName(voice, name)
        return { ...f, voice, name: voiceName(voice) }
      })
      saveFavourites(favourites)
      set({ favourites })
    },
    importFile(bytes, fileName) {
      const read = readSyx(bytes)
      if (!read.voices.length) return `${fileName} has no DX7 voices.`
      const entries = read.voices.map((v) => ({ id: nextId++, voice: v.voice, name: voiceName(v.voice), hue: 260 }))
      const favourites = [...get().favourites, ...entries]
      saveFavourites(favourites)
      set({ favourites })
      return `${entries.length} voice${entries.length === 1 ? '' : 's'} from ${fileName} kept.`
    },
  }
})

/** The last note played (C4 until one is) after a change, when play-on-change is on. */
export function audition(velocity = 100) {
  if (useApp.getState().autoplay) setTimeout(() => playback.audition(playback.lastNote, velocity), 140)
}

/** The tonalities the pins read as, heaviest first. */
export const useMix = () => mixOf(useApp((s) => s.pins))
export type { Tonality }
