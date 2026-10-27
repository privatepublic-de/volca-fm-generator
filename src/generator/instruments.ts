// Instruments to start from (PLAN §4): the classic DX7 territory the wheel's tonalities don't cover on their own,
// as recipes in the same form: a skeleton, envelopes per role or per operator, and what an instrument needs beyond
// that (keyboard scaling, LFO, a pitch envelope, a pitch drop for drums, its register). An instrument is the base of
// a voice in place of the heaviest pin; pins colour it. Most are the Yamaha originals, operator by operator, as
// tools/recipe-from-voice.ts reads them from a DX7 library (the comment above each names its source); the drums,
// choirs and the whistle are our own.
// Envelope times (docs/SOUND.md): attack R1 99 instant, 60 ≈ 0.06 s, 40 ≈ 0.55 s; a fall to −40 dB at R 30 ≈ 5.5 s,
// 40 ≈ 2 s, 50 ≈ 0.6 s, 60 ≈ 0.2 s, 70 ≈ 0.08 s. Fixed frequencies in Hz; levels 0–99.
import type { GeneratorChoices, Tonality } from './choices'
import type { Eg } from './shapes'
import type { Rng } from './random'
import type { Skeleton } from './tonalities'

export const INSTRUMENT_GROUPS = ['keys', 'plucked', 'mallets', 'bass', 'winds', 'brass', 'strings', 'percussion', 'voices'] as const
export type InstrumentGroup = (typeof INSTRUMENT_GROUPS)[number]
export const INSTRUMENT_GROUP_LABELS: Record<InstrumentGroup, string> = {
  keys: 'Keys', plucked: 'Plucked', mallets: 'Mallets', bass: 'Bass', winds: 'Winds', brass: 'Brass', strings: 'Strings', percussion: 'Percussion', voices: 'Voices',
}

export interface Instrument {
  /** its name, in 10 characters (it names the voice) */
  label: string
  /** its full name, where the label is shortened */
  name?: string
  group: InstrumentGroup
  hint: string
  /** the tonality it is closest to: its colour, and what its operators are drawn in */
  family: Tonality
  skeleton: Skeleton
  /** envelopes by role, when none of the shapes fits; a shape chosen in the controls replaces them */
  eg?: { carrier: Eg; modulator: Eg }
  /** semitones, as played from C3–C5 */
  transpose?: number
  /** 0–7 on every operator: shorter decays up the keyboard */
  rateScaling?: number
  /** −1 darker … +1 brighter up the keyboard (the modulators' level scaling right of C3) */
  treble?: number
  /** a tremolo: LFO speed and amplitude depth, on the carriers (sensitivity 1: depth 45 dips about 5 dB) */
  tremolo?: readonly [speed: number, depth: number]
  /** a drum's pitch drop: where the pitch starts (pitch EG level, 50 = the note) and how fast it falls */
  pitchDrop?: readonly [level: number, rate: number]
  /** the LFO as a classic patch sets it (over vibrato and tremolo): speed, delay, pitch depth, amplitude depth,
   *  wave (0 triangle … 5 sample and hold), pitch sensitivity 0–7; the operators' amplitude sensitivity in `ops` */
  lfo?: readonly [speed: number, delay: number, pitchDepth: number, ampDepth: number, wave: number, pitchSens: number]
  /** false: the oscillators run free between notes (the original's choice; it matters on the hardware) */
  keySync?: boolean
  /** the pitch envelope: a lip's bend into the note (it starts and ends on 50, so a release doesn't glide) */
  pitchEg?: Eg
  /** a short pitch fall or scoop into every note */
  accent?: 'above' | 'below'
  /** the controls it starts with */
  controls?: Partial<Omit<GeneratorChoices, 'pins' | 'instrument'>>
  /** other originals of the same instrument, one picked per seed (the recipe itself is one of them) */
  variants?: readonly InstrumentVariant[]
  /** per operator, over the above: what a classic patch sets operator by operator */
  ops?: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, OpDetail>>
}

/** A variant replaces the sound of the recipe; its name, group and colour stay. */
export type InstrumentVariant = Omit<Instrument, 'label' | 'name' | 'group' | 'hint' | 'family' | 'variants'>

/** How many originals an instrument has: its recipe and its variants. */
export const variantCount = (inst: Instrument) => (inst.variants?.length ?? 0) + 1

/** The recipe (0) or one of its variants: the one `pick`ed, else by the seed's first draw. The draw is made either
 *  way, so the rest of the seed's draws stay as they were (an instrument without variants draws nothing). */
export function variantOf(inst: Instrument, rng: Rng, pick?: number): Instrument {
  if (!inst.variants?.length) return inst
  const drawn = rng.int(0, inst.variants.length)
  const i = pick === undefined ? drawn : pick % variantCount(inst)
  if (i === 0) return inst
  // a variant's sound in full: none of the recipe's own settings carry over
  const { label, name, group, hint, family } = inst
  return { label, name, group, hint, family, ...inst.variants[i - 1] }
}

export interface OpDetail {
  /** its own envelope (a shape chosen in the controls replaces it) */
  eg?: Eg
  /** 0–7 */
  rateScaling?: number
  /** amplitude modulation sensitivity 0–3 (the LFO's amplitude depth on this operator) */
  ams?: number
  /** keyboard level scaling: break point (39 = C3), depths 0–99, curves 0 −lin, 1 −exp, 2 +exp, 3 +lin */
  scaling?: readonly [breakPoint: number, leftDepth: number, rightDepth: number, leftCurve: number, rightCurve: number]
}

const eg = (rates: Eg['rates'], levels: Eg['levels']): Eg => ({ rates, levels })

const RECIPES = {
  // ---------- keys ----------
  // after STEINWAY (Original Yamaha/TX7/TX18 #18)
  piano: {
    label: 'Grand', name: 'Grand piano', group: 'keys', family: 'tine', hint: 'The classic DX7 grands: a Steinway or a Bösendorfer: pick it again for the next',
    skeleton: {
      algorithms: [13], shape: 'struck',
      ops: {
        1: { ratio: [1], level: 99, velocity: 6 },
        2: { ratio: [1], level: 82, detune: -1, velocity: 1 },
        3: { ratio: [1], level: 99, detune: -2, velocity: 3 },
        4: { ratio: [5], level: 71, detune: -3, velocity: 2 },
        5: { ratio: [1], level: 79, detune: 1 },
        6: { ratio: [11], level: 82, velocity: 6 },
      },
    },
    ops: {
      1: { eg: eg([75,21,29,82], [99,99,0,0]), rateScaling: 2, scaling: [63,0,75,0,2] },
      2: { eg: eg([99,49,7,64], [99,98,0,0]), scaling: [15,0,5,0,3] },
      3: { eg: eg([85,99,29,60], [99,99,0,0]), rateScaling: 1 },
      4: { eg: eg([89,89,28,0], [99,99,0,0]), rateScaling: 3, scaling: [42,14,8,3,0] },
      5: { eg: eg([99,29,27,7], [99,40,0,0]), scaling: [42,1,0,3,0] },
      6: { eg: eg([84,45,28,10], [99,94,0,0]), rateScaling: 6, scaling: [41,12,99,3,0] },
    },
    transpose: -12,
    variants: [
      // after Bosendorfr (Original Yamaha/TX7/TX11 #10)
      {
        skeleton: {
          algorithms: [4], shape: 'struck', feedback: 1,
          ops: {
            1: { ratio: [1], level: 99, velocity: 4 },
            2: { ratio: [1], level: 88, detune: 1, velocity: 2 },
            3: { ratio: [8], level: 74, detune: 2, velocity: 3 },
            4: { ratio: [1], level: 99, velocity: 3 },
            5: { ratio: [1], level: 84, velocity: 1 },
            6: { ratio: [2], level: 88, detune: 1, velocity: 2 },
          },
        },
        ops: {
          1: { eg: eg([85,32,29,49], [99,95,0,0]), rateScaling: 5, scaling: [32,25,31,3,0] },
          2: { eg: eg([90,29,21,25], [99,85,80,0]), rateScaling: 4, scaling: [0,0,19,0,1] },
          3: { eg: eg([90,17,20,25], [99,95,80,0]), rateScaling: 4, scaling: [38,98,41,2,1] },
          4: { eg: eg([95,30,28,48], [99,99,0,0]), rateScaling: 5 },
          5: { eg: eg([99,10,18,0], [99,81,80,0]), rateScaling: 5, scaling: [63,0,5,0,3] },
          6: { eg: eg([93,5,20,0], [76,51,70,0]), rateScaling: 5, scaling: [10,32,10,0,0] },
        },
        transpose: -12, keySync: false,
      },
    ],
  },
  // after UPRIGHT (Original Yamaha/TX7/TX18 #21)
  upright: {
    label: 'Upright', name: 'Upright piano', group: 'keys', family: 'tine', hint: 'Four classic DX7 uprights, honky and short: pick it again for the next',
    skeleton: {
      algorithms: [3], shape: 'struck', feedback: 7,
      ops: {
        1: { ratio: [1], level: 99, detune: -2, velocity: 1 },
        2: { ratio: [1], level: 90, detune: 2, velocity: 2 },
        3: { ratio: [4], level: 82, detune: -2, velocity: 1 },
        4: { ratio: [1], level: 99, detune: -4, velocity: 1 },
        5: { ratio: [2], level: 71, detune: -3, velocity: 2 },
        6: { ratio: [3], level: 54, velocity: 1 },
      },
    },
    ops: {
      1: { eg: eg([70,25,20,48], [99,82,0,0]), rateScaling: 5, scaling: [0,85,0,3,0] },
      2: { eg: eg([99,0,65,0], [99,75,0,0]), rateScaling: 5, scaling: [50,0,21,0,0] },
      3: { eg: eg([99,72,25,39], [24,85,0,0]), rateScaling: 5, scaling: [46,32,25,3,0] },
      4: { eg: eg([82,42,22,45], [99,99,52,0]), rateScaling: 4 },
      5: { eg: eg([99,60,31,39], [99,96,71,0]), rateScaling: 2, scaling: [48,0,15,0,0] },
      6: { eg: eg([77,20,0,85], [99,47,89,0]), rateScaling: 2, scaling: [65,0,38,1,0] },
    },
    variants: [
      // after AC.PNO 1.1 (Original Yamaha/TX816/Tfi1 #1)
      {
        skeleton: {
          algorithms: [16], shape: 'struck', feedback: 7,
          ops: {
            1: { ratio: [1], level: 99, velocity: 3 },
            2: { fixed: [74.1, 74.1], level: 80, velocity: 2 },
            3: { ratio: [1], level: 77, detune: -1, velocity: 1 },
            4: { ratio: [4], level: 77, detune: 1, velocity: 1 },
            5: { ratio: [20], level: 72, detune: 2, velocity: 3 },
            6: { ratio: [8], level: 58, detune: 7, velocity: 1 },
          },
        },
        ops: {
          1: { eg: eg([70,23,17,46], [99,79,0,0]), rateScaling: 6 },
          2: { eg: eg([66,61,64,55], [99,82,0,0]), rateScaling: 1, scaling: [96,20,0,0,0] },
          3: { eg: eg([65,15,13,43], [99,88,0,0]), rateScaling: 3, scaling: [51,0,95,0,0] },
          4: { eg: eg([64,14,11,43], [99,88,0,0]), rateScaling: 6, scaling: [3,0,87,3,1] },
          5: { eg: eg([72,16,0,42], [99,92,0,0]), rateScaling: 4, scaling: [11,20,84,0,0] },
          6: { eg: eg([94,19,0,42], [99,92,0,0]), scaling: [26,8,0,3,0] },
        },
        pitchEg: eg([99,99,99,99], [49,50, 50, 50]),
      },
      // after GOOD PIANO (!Instruments/Keyboard/Piano/PIANO_13 #10)
      {
        skeleton: {
          algorithms: [4], shape: 'struck',
          ops: {
            1: { ratio: [1], level: 99, detune: -4, velocity: 2 },
            2: { ratio: [1], level: 80, detune: 1, velocity: 1 },
            3: { ratio: [6], level: 85, detune: -4, velocity: 2 },
            4: { ratio: [1], level: 99, detune: 1, velocity: 3 },
            5: { ratio: [1], level: 54, detune: 4, velocity: 5 },
            6: { ratio: [4], level: 93, detune: 4, velocity: 4 },
          },
        },
        ops: {
          1: { eg: eg([71,32,20,48], [99,96,0,0]), rateScaling: 4 },
          2: { eg: eg([85,34,17,35], [99,95,0,0]), rateScaling: 2, scaling: [53,0,59,3,0] },
          3: { eg: eg([80,24,19,4], [99,93,0,0]), rateScaling: 5, scaling: [22,3,32,3,0] },
          4: { eg: eg([71,32,20,48], [99,96,0,0]), rateScaling: 3 },
          5: { eg: eg([78,42,19,35], [99,94,0,0]), rateScaling: 4, scaling: [0,8,0,0,3] },
          6: { eg: eg([87,29,22,4], [99,95,0,0]), rateScaling: 4, scaling: [22,2,17,3,0] },
        },
        pitchEg: eg([99,99,99,99], [51,50, 50, 50]),
        transpose: -12, keySync: false,
      },
      // after PianoBo 7\ (!Instruments/Keyboard/Piano/PIANO_08 #30)
      {
        skeleton: {
          algorithms: [9], shape: 'struck', feedback: 7,
          ops: {
            1: { ratio: [1], level: 99, detune: -4, velocity: 3 },
            2: { ratio: [1.01], level: 72, detune: -7, velocity: 1 },
            3: { ratio: [1], level: 99, detune: 1, velocity: 3 },
            4: { fixed: [123, 123], level: 87, detune: -1, velocity: 2 },
            5: { ratio: [1], level: 89, detune: 4, velocity: 4 },
            6: { ratio: [5], level: 63 },
          },
        },
        ops: {
          1: { eg: eg([62,21,7,44], [99,79,0,0]), rateScaling: 7 },
          2: { eg: eg([66,8,0,39], [98,79,0,0]), rateScaling: 3, scaling: [39,6,6,3,0] },
          3: { eg: eg([62,21,7,44], [99,79,0,0]), rateScaling: 7 },
          4: { eg: eg([78,73,51,55], [99,58,0,0]), rateScaling: 1, scaling: [51,12,19,3,3] },
          5: { eg: eg([69,22,13,42], [99,88,0,0]), rateScaling: 1, scaling: [34,12,18,3,0] },
          6: { eg: eg([67,11,0,42], [99,94,0,0]), rateScaling: 6, scaling: [2,0,45,3,1] },
        },
      },
    ],
  },
  // after E.PIANO 1 (Original Yamaha/DX7 ROM1/ROM1A #11)
  epiano: {
    label: 'E.Piano', name: 'Electric piano', group: 'keys', family: 'tine', hint: 'The DX7 e-piano: a bell-like tine over a soft body, both on velocity',
    skeleton: {
      algorithms: [5], shape: 'struck', feedback: 6,
      ops: {
        1: { ratio: [1], level: 99, detune: 3, velocity: 2 },
        2: { ratio: [14], level: 58, velocity: 7 },
        3: { ratio: [1], level: 99, velocity: 2 },
        4: { ratio: [1], level: 89, velocity: 6 },
        5: { ratio: [1], level: 99, detune: -7 },
        6: { ratio: [1], level: 79, detune: 7, velocity: 6 },
      },
    },
    ops: {
      1: { eg: eg([96,25,25,67], [99,75,0,0]), rateScaling: 3 },
      2: { eg: eg([95,50,35,78], [99,75,0,0]), rateScaling: 3 },
      3: { eg: eg([95,20,20,50], [99,95,0,0]), rateScaling: 3 },
      4: { eg: eg([95,29,20,50], [99,95,0,0]), rateScaling: 3 },
      5: { eg: eg([95,20,20,50], [99,95,0,0]), rateScaling: 3 },
      6: { eg: eg([95,29,20,50], [99,95,0,0]), rateScaling: 3, scaling: [41,0,19,0,0] },
    },
    keySync: false,
  },
  // after HARPSICH 1 (Original Yamaha/DX7 ROM1/ROM1A #19)
  harpsichord: {
    label: 'Harpsichrd', name: 'Harpsichord', group: 'keys', family: 'reed', hint: 'Plucked by quills: bright and buzzy, no touch, a quick damper',
    skeleton: {
      algorithms: [5], shape: 'pluck', feedback: 1,
      ops: {
        1: { ratio: [4], level: 89, velocity: 2 },
        2: { ratio: [0.5], level: 99 },
        3: { ratio: [1], level: 85, detune: -1, velocity: 2 },
        4: { ratio: [3], level: 99 },
        5: { ratio: [4], level: 83, detune: -1, velocity: 3 },
        6: { ratio: [6], level: 87 },
      },
    },
    ops: {
      1: { eg: eg([95,28,27,47], [99,90,0,0]), rateScaling: 3 },
      2: { eg: eg([95,72,71,99], [99,97,91,98]), rateScaling: 1 },
      3: { eg: eg([95,28,27,47], [99,90,0,0]), rateScaling: 3 },
      4: { eg: eg([95,72,71,99], [99,97,91,98]), rateScaling: 1, scaling: [64,0,46,0,0] },
      5: { eg: eg([95,28,27,47], [99,90,0,0]), rateScaling: 3 },
      6: { eg: eg([95,72,71,99], [99,97,91,98]), rateScaling: 1, scaling: [64,0,55,0,0] },
    },
  },
  // after CLAV    1 (Original Yamaha/DX7 ROM3/ROM3A #13)
  clavinet: {
    label: 'Clavinet', group: 'keys', family: 'reed', hint: 'Funky and percussive, buzzing, very touch-sensitive',
    skeleton: {
      algorithms: [18], shape: 'pluck', feedback: 3,
      ops: {
        1: { ratio: [1], level: 99, detune: 1, velocity: 7 },
        2: { ratio: [0.5], level: 82, detune: -1, velocity: 5 },
        3: { ratio: [4.5], level: 85, velocity: 7 },
        4: { ratio: [3], level: 81, velocity: 3 },
        5: { ratio: [4], level: 74, detune: -2, velocity: 4 },
        6: { ratio: [12], level: 82, velocity: 2 },
      },
    },
    ops: {
      1: { eg: eg([95,92,28,60], [99,90,0,0]), rateScaling: 3 },
      2: { eg: eg([95,95,0,0], [99,96,89,0]), rateScaling: 3 },
      3: { eg: eg([98,87,0,0], [87,86,0,0]), rateScaling: 3, scaling: [32,0,21,0,0] },
      4: { eg: eg([95,92,28,60], [99,90,0,0]), rateScaling: 3 },
      5: { eg: eg([95,95,54,0], [99,96,89,0]), rateScaling: 3 },
      6: { eg: eg([98,87,0,0], [87,86,0,0]), rateScaling: 3, scaling: [32,0,21,0,0] },
    },
  },
  // ---------- plucked ----------
  // after SPANISHGTR (Original Yamaha/DX7 ROM3/ROM3B #24)
  nylonGuitar: {
    label: 'Nylon Gtr', name: 'Nylon guitar', group: 'plucked', family: 'string', hint: 'A classical guitar: soft pluck, warm body',
    skeleton: {
      algorithms: [14], shape: 'pluck', feedback: 4,
      ops: {
        1: { ratio: [1], level: 39, velocity: 3 },
        2: { ratio: [27], level: 90, detune: 2, velocity: 1 },
        3: { ratio: [1], level: 85, velocity: 1 },
        4: { ratio: [3], level: 63, velocity: 2 },
        5: { ratio: [1], level: 61, velocity: 3 },
        6: { ratio: [5], level: 74, velocity: 2 },
      },
    },
    ops: {
      1: { eg: eg([75,79,24,66], [99,27,0,0]), rateScaling: 3 },
      2: { eg: eg([91,98,24,53], [99,27,0,0]), rateScaling: 3 },
      3: { eg: eg([75,28,24,66], [99,27,0,0]), rateScaling: 3 },
      4: { eg: eg([91,28,24,53], [99,27,0,0]), rateScaling: 3 },
      5: { eg: eg([52,23,24,53], [96,27,0,0]), rateScaling: 3 },
      6: { eg: eg([91,28,24,53], [99,27,0,0]), rateScaling: 3 },
    },
    transpose: -12, lfo: [39,85,1,0,4,1], keySync: false,
  },
  // after FOLK GUIT (Original Yamaha/DX7 ROM3/ROM3B #25)
  steelGuitar: {
    label: 'Steel Gtr', name: 'Steel-string guitar', group: 'plucked', family: 'string', hint: 'A steel-string guitar: brighter pick, a little shimmer',
    skeleton: {
      algorithms: [14], shape: 'pluck', feedback: 4,
      ops: {
        1: { ratio: [3], level: 66, velocity: 3 },
        2: { ratio: [1], level: 98, detune: 2 },
        3: { ratio: [1], level: 85, velocity: 1 },
        4: { ratio: [4], level: 78, velocity: 1 },
        5: { ratio: [1], level: 60 },
        6: { ratio: [3], level: 76 },
      },
    },
    ops: {
      1: { eg: eg([99,49,24,66], [99,0,0,0]), rateScaling: 3 },
      2: { eg: eg([99,99,0,55], [99,99,0,0]), rateScaling: 3 },
      3: { eg: eg([75,31,20,55], [99,80,0,0]), rateScaling: 3 },
      4: { eg: eg([91,25,17,53], [99,27,0,0]), rateScaling: 3 },
      5: { eg: eg([99,20,18,53], [96,79,89,0]), rateScaling: 3 },
      6: { eg: eg([91,29,19,53], [99,52,0,0]), rateScaling: 3 },
    },
    transpose: -12, lfo: [37,85,1,0,4,1], keySync: false,
  },
  // after HARP    1 (Original Yamaha/DX7 ROM1/ROM1B #29)
  harp: {
    label: 'Harp', group: 'plucked', family: 'glass', hint: 'A concert harp: a gentle pluck that rings long',
    skeleton: {
      algorithms: [3], shape: 'pluck', feedback: 7,
      ops: {
        1: { ratio: [1], level: 99, velocity: 7 },
        2: { ratio: [1], level: 75, velocity: 3 },
        3: { ratio: [1], level: 87 },
        4: { ratio: [1], level: 99, velocity: 7 },
        5: { ratio: [1], level: 55, velocity: 4 },
        6: { ratio: [2], level: 86, velocity: 1 },
      },
    },
    ops: {
      1: { eg: eg([95,27,45,31], [99,70,0,0]), rateScaling: 3 },
      2: { eg: eg([95,30,99,30], [99,70,0,0]), rateScaling: 3, scaling: [52,8,0,3,0] },
      3: { eg: eg([95,42,44,35], [99,70,0,0]), rateScaling: 3, scaling: [58,0,37,0,0] },
      4: { eg: eg([95,29,49,30], [99,70,0,0]), rateScaling: 3 },
      5: { eg: eg([95,38,99,17], [99,70,0,0]), rateScaling: 3 },
      6: { eg: eg([95,46,28,23], [94,79,0,0]), rateScaling: 6 },
    },
  },
  // after KOTO (Original Yamaha/DX7 ROM1/ROM1A #23)
  koto: {
    label: 'Koto', group: 'plucked', family: 'wooden', hint: 'A Japanese koto: a hard pluck with a little pitch fall',
    skeleton: {
      algorithms: [2], shape: 'pluck', feedback: 7,
      ops: {
        1: { ratio: [1], level: 90, velocity: 3 },
        2: { ratio: [4], level: 99 },
        3: { ratio: [1], level: 99, velocity: 3 },
        4: { ratio: [1], level: 82, velocity: 1 },
        5: { ratio: [4], level: 83, velocity: 1 },
        6: { ratio: [3], level: 81, velocity: 1 },
      },
    },
    ops: {
      1: { eg: eg([94,62,58,34], [99,92,0,0]), rateScaling: 6 },
      2: { eg: eg([99,68,28,48], [99,83,0,0]), rateScaling: 6, scaling: [0,0,10,0,0] },
      3: { eg: eg([94,64,30,33], [99,92,0,0]), rateScaling: 5 },
      4: { eg: eg([90,28,17,39], [99,76,0,0]), rateScaling: 6, scaling: [10,0,17,0,1] },
      5: { eg: eg([91,37,29,29], [99,90,0,0]), rateScaling: 6, scaling: [0,0,5,0,0] },
      6: { eg: eg([82,53,37,48], [99,81,0,0]), rateScaling: 6, scaling: [0,0,5,0,0] },
    },
    pitchEg: eg([85,99,75,0], [49,50, 50, 50]),
    lfo: [30,40,17,15,4,2],
  },
  // after SITAR (Original Yamaha/DX7 ROM1/ROM1B #22)
  sitar: {
    label: 'Sitar', group: 'plucked', family: 'string', hint: 'A sitar: a long, buzzing, slightly out-of-true ring',
    skeleton: {
      algorithms: [8], shape: 'pluck',
      ops: {
        1: { ratio: [20], level: 73, velocity: 1 },
        2: { ratio: [1], level: 97, velocity: 2 },
        3: { ratio: [1], level: 91, velocity: 2 },
        4: { ratio: [7], level: 90, detune: -3, velocity: 1 },
        5: { ratio: [1], level: 87, detune: -5, velocity: 2 },
        6: { ratio: [9], level: 37, detune: 1, velocity: 3 },
      },
    },
    ops: {
      1: { eg: eg([99,77,26,42], [99,98,0,0]), rateScaling: 2 },
      2: { eg: eg([99,41,26,7], [99,98,0,0]), rateScaling: 2 },
      3: { eg: eg([99,77,26,28], [99,98,0,0]), rateScaling: 2 },
      4: { eg: eg([99,41,42,7], [99,98,0,0]), rateScaling: 2 },
      5: { eg: eg([99,77,26,7], [99,98,0,0]), rateScaling: 2 },
      6: { eg: eg([99,41,26,10], [99,98,0,0]), rateScaling: 2 },
    },
  },
  // after PIZZ STGS (Original Yamaha/DX7 ROM4/ROM4A #18)
  pizzicato: {
    label: 'Pizzicato', group: 'plucked', family: 'string', hint: 'Plucked orchestral strings: short and round',
    skeleton: {
      algorithms: [2], shape: 'pluck', feedback: 7,
      ops: {
        1: { ratio: [1], level: 99, velocity: 3 },
        2: { ratio: [1], level: 73, velocity: 3 },
        3: { ratio: [1], level: 99, velocity: 2 },
        4: { ratio: [1], level: 66, velocity: 7 },
        5: { ratio: [1], level: 70, velocity: 7 },
        6: { ratio: [1], level: 44, velocity: 7 },
      },
    },
    ops: {
      1: { eg: eg([99,57,20,41], [99,0,0,0]), rateScaling: 3 },
      2: { eg: eg([98,48,17,50], [98,0,0,0]) },
      3: { eg: eg([86,57,20,41], [99,0,0,0]), rateScaling: 4, scaling: [32,99,25,3,0] },
      4: { eg: eg([96,19,20,54], [99,92,86,0]), rateScaling: 4 },
      5: { eg: eg([53,19,20,54], [86,92,86,0]), rateScaling: 6 },
      6: { eg: eg([53,19,20,54], [99,92,86,0]), rateScaling: 7 },
    },
    lfo: [33,39,8,0,4,1],
  },
  // ---------- mallets ----------
  // after VIBE    1 (Original Yamaha/DX7 ROM1/ROM1A #21)
  vibraphone: {
    label: 'Vibraphone', name: 'Vibraphone', group: 'mallets', family: 'tine', hint: 'Vibes: a soft mallet, a long ring, the motor’s tremolo',
    skeleton: {
      algorithms: [23], shape: 'struck', feedback: 5,
      ops: {
        1: { ratio: [4], level: 50, velocity: 7 },
        2: { ratio: [1], level: 99, velocity: 1 },
        3: { ratio: [3], level: 72, velocity: 4 },
        4: { ratio: [1], level: 99, detune: -7, velocity: 1 },
        5: { ratio: [1], level: 99, detune: 7, velocity: 5 },
        6: { ratio: [14], level: 57, velocity: 7 },
      },
    },
    ops: {
      1: { eg: eg([99,28,99,50], [99,25,0,0]), rateScaling: 2, scaling: [39,12,12,0,3] },
      2: { eg: eg([80,85,24,50], [99,90,0,0]), rateScaling: 2, scaling: [39,4,12,0,3] },
      3: { eg: eg([80,85,43,50], [99,74,0,0]), rateScaling: 4, scaling: [39,12,12,0,3] },
      4: { eg: eg([80,85,24,50], [99,90,0,0]), rateScaling: 3 },
      5: { eg: eg([80,85,24,50], [99,90,42,0]), rateScaling: 3 },
      6: { eg: eg([99,48,99,50], [99,32,0,0]), rateScaling: 5, scaling: [39,12,12,0,3] },
    },
  },
  // after XYLOPHONE (Original Yamaha/DX7 ROM2/ROM2A #24)
  xylophone: {
    label: 'Xylophone', group: 'mallets', family: 'wooden', hint: 'A xylophone: hard, bright, short',
    skeleton: {
      algorithms: [7], shape: 'pluck',
      ops: {
        1: { ratio: [0.5], level: 99, velocity: 5 },
        2: { ratio: [3], level: 99, velocity: 2 },
        3: { ratio: [0.5], level: 99, velocity: 6 },
        4: { ratio: [3], level: 94, velocity: 2 },
        5: { ratio: [0.5], level: 79, velocity: 2 },
        6: { ratio: [4], level: 75, velocity: 5 },
      },
    },
    ops: {
      1: { eg: eg([95,43,49,53], [99,92,0,0]), rateScaling: 2 },
      2: { eg: eg([99,71,0,0], [82,48,0,0]), scaling: [54,0,46,0,0] },
      3: { eg: eg([95,50,49,41], [99,92,0,0]), rateScaling: 3 },
      4: { eg: eg([99,73,0,14], [82,48,0,0]), scaling: [54,0,46,0,0] },
      5: { eg: eg([99,86,55,0], [96,78,0,0]) },
      6: { eg: eg([0,81,55,0], [78,78,0,0]) },
    },
    transpose: 24,
  },
  // after GLOCKEN  1 (Original Yamaha/DX7 VRC Cartridges/VRC-101/VRC-101 KEYBORD,PLUCKD & TUNED PERCUSSION GROUP (B) #27)
  glockenspiel: {
    label: 'Glocken', name: 'Glockenspiel', group: 'mallets', family: 'glass', hint: 'A glockenspiel: small, high, ringing bars',
    skeleton: {
      algorithms: [23], shape: 'struck',
      ops: {
        1: { ratio: [1], level: 50 },
        2: { ratio: [4], level: 99 },
        5: { ratio: [1], level: 99, detune: 7 },
        6: { ratio: [14], level: 71 },
      },
    },
    ops: {
      1: { eg: eg([99,28,99,45], [99,25,0,0]), rateScaling: 2, scaling: [39,12,12,0,3] },
      2: { eg: eg([80,85,24,45], [99,90,0,0]), rateScaling: 2, scaling: [39,4,12,0,3] },
      5: { eg: eg([80,85,24,32], [99,90,42,0]), rateScaling: 3 },
      6: { eg: eg([99,48,99,27], [99,60,0,0]), rateScaling: 5, scaling: [39,12,12,0,3] },
    },
    transpose: 12,
  },
  // after STEEL DRUM (Original Yamaha/DX7 ROM1/ROM1A #27)
  steelDrum: {
    label: 'Steel Drum', group: 'mallets', family: 'tine', hint: 'A steel pan: a round, slightly bending ring',
    skeleton: {
      algorithms: [15], shape: 'struck', feedback: 5,
      ops: {
        1: { ratio: [1], level: 99 },
        2: { ratio: [1.7], level: 64, velocity: 2 },
        3: { ratio: [1], level: 99, velocity: 3 },
        4: { ratio: [2], level: 88, detune: 7, velocity: 1 },
        5: { ratio: [5.32], level: 64 },
        6: { fixed: [398.1, 398.1], level: 49 },
      },
    },
    ops: {
      1: { eg: eg([99,40,33,38], [99,92,0,0]), rateScaling: 4 },
      2: { eg: eg([99,19,20,9], [99,87,0,0]), rateScaling: 2, scaling: [57,0,71,2,0] },
      3: { eg: eg([99,30,35,42], [99,92,0,0]), rateScaling: 3 },
      4: { eg: eg([99,44,50,21], [91,82,0,0]), rateScaling: 3 },
      5: { eg: eg([99,40,38,0], [91,82,0,0]), rateScaling: 3 },
      6: { eg: eg([99,49,28,12], [91,82,0,0]), rateScaling: 3 },
    },
    lfo: [25,0,10,99,4,2],
  },
  // ---------- bass ----------
  // after BASS    1 (Original Yamaha/DX7 ROM1/ROM1A #15)
  fmBass: {
    label: 'FM Bass', group: 'bass', family: 'brass', hint: 'The punchy DX bass: a bright attack settling into a round body',
    skeleton: {
      algorithms: [16], shape: 'pluck', feedback: 7,
      ops: {
        1: { ratio: [0.5], level: 99 },
        2: { ratio: [0.5], level: 80 },
        3: { ratio: [0.5], level: 99, velocity: 3 },
        4: { ratio: [5], level: 93, velocity: 5 },
        5: { ratio: [0.5], level: 62, velocity: 3 },
        6: { ratio: [9], level: 85, velocity: 7 },
      },
    },
    ops: {
      1: { eg: eg([95,62,17,58], [99,95,32,0]), rateScaling: 7, scaling: [36,57,14,3,0] },
      2: { eg: eg([99,20,0,0], [99,0,0,0]), rateScaling: 7 },
      3: { eg: eg([88,96,32,30], [79,65,0,0]), rateScaling: 6 },
      4: { eg: eg([90,42,7,55], [90,30,0,0]), rateScaling: 5 },
      5: { eg: eg([99,0,0,0], [99,0,0,0]), rateScaling: 7, scaling: [52,75,0,0,0] },
      6: { eg: eg([94,56,24,55], [93,28,0,0]), rateScaling: 1 },
    },
    transpose: -12,
  },
  // after Slap.Bass (Original Yamaha/DX7II VRC Cartridges/VRC-1001_DECAY group_A(33-64) #22)
  slapBass: {
    label: 'Slap Bass', group: 'bass', family: 'string', hint: 'Slapped and popped: a sharp click, played hard',
    skeleton: {
      algorithms: [17], shape: 'pluck', feedback: 4,
      ops: {
        1: { ratio: [1], level: 99 },
        2: { ratio: [0.5], level: 86, velocity: 5 },
        3: { ratio: [0.5], level: 94, velocity: 6 },
        4: { ratio: [0.505], level: 72, velocity: 7 },
        5: { ratio: [5], level: 73, velocity: 5 },
        6: { ratio: [18.02], level: 67, velocity: 6 },
      },
    },
    ops: {
      1: { eg: eg([90,34,16,60], [99,86,0,0]), rateScaling: 4 },
      2: { eg: eg([90,99,5,67], [91,99,0,0]), rateScaling: 1, scaling: [29,0,18,0,0] },
      3: { eg: eg([76,86,48,55], [43,99,0,0]), scaling: [43,0,17,0,0] },
      4: { eg: eg([69,99,37,68], [89,99,0,0]), rateScaling: 4, scaling: [29,0,4,0,0] },
      5: { eg: eg([66,99,36,32], [70,99,67,0]), rateScaling: 2, scaling: [28,6,18,3,0] },
      6: { eg: eg([73,85,47,64], [71,99,0,0]), rateScaling: 2, scaling: [32,0,25,0,0] },
    },
    pitchEg: eg([86,86,85,99], [50,54, 50, 50]),
    keySync: false,
  },
  // after JazzBass (Original Yamaha/DX7IIFD/DX7IIFDVoice64B #18)
  uprightBass: {
    label: 'Upright', name: 'Upright bass', group: 'bass', family: 'wooden', hint: 'A double bass, plucked: soft, woody, round',
    skeleton: {
      algorithms: [15], shape: 'pluck', feedback: 7,
      ops: {
        1: { ratio: [1.01], level: 99 },
        2: { fixed: [512.9, 512.9], level: 70, velocity: 3 },
        3: { ratio: [1], level: 99, detune: 3, velocity: 2 },
        4: { ratio: [1], level: 86, detune: -2, velocity: 1 },
        5: { ratio: [2], level: 89, detune: 1, velocity: 1 },
        6: { ratio: [2], level: 99, velocity: 2 },
      },
    },
    ops: {
      1: { eg: eg([68,62,35,50], [99,80,0,0]), rateScaling: 4 },
      2: { eg: eg([49,57,65,53], [70,90,17,66]), rateScaling: 3 },
      3: { eg: eg([80,38,20,53], [99,85,31,0]), rateScaling: 5, scaling: [46,0,9,3,0] },
      4: { eg: eg([99,80,63,39], [82,0,79,0]), rateScaling: 5, scaling: [38,0,25,3,0] },
      5: { eg: eg([80,60,99,82], [99,70,62,79]), rateScaling: 5, scaling: [30,0,25,0,0] },
      6: { eg: eg([76,28,23,22], [50,74,0,77]), rateScaling: 5, scaling: [42,0,43,3,0] },
    },
    pitchEg: eg([44,53,50,45], [51,51, 50, 50]),
    transpose: -12,
  },
  // after SYN-BASS 1 (Original Yamaha/DX7 ROM2/ROM2B #15)
  synthBass: {
    label: 'Synth Bass', group: 'bass', family: 'brass', hint: 'A saw-like synth bass with a closing filter',
    skeleton: {
      algorithms: [3], shape: 'gate', feedback: 7,
      ops: {
        1: { ratio: [2], level: 99 },
        2: { ratio: [1], level: 76 },
        3: { ratio: [1], level: 83 },
        4: { ratio: [1], level: 99, detune: 7 },
        5: { ratio: [1], level: 78, detune: 7 },
        6: { ratio: [1], level: 75, detune: 7 },
      },
    },
    ops: {
      1: { eg: eg([99,76,99,99], [99,88,96,0]) },
      2: { eg: eg([61,38,25,47], [99,72,72,0]) },
      3: { eg: eg([99,39,25,35], [99,71,64,0]) },
      4: { eg: eg([99,76,99,99], [99,88,96,0]) },
      5: { eg: eg([99,39,25,71], [99,71,64,0]) },
      6: { eg: eg([61,38,25,32], [99,72,72,0]) },
    },
    transpose: -24,
  },
  // ---------- winds ----------
  // after OBOE (Original Yamaha/DX7 ROM2/ROM2A #3)
  oboe: {
    label: 'Oboe', group: 'winds', family: 'reed', hint: 'A double reed: nasal, focused, with vibrato',
    skeleton: {
      algorithms: [3], shape: 'bowed', feedback: 5,
      ops: {
        1: { ratio: [4], level: 99, velocity: 2 },
        2: { ratio: [1], level: 76 },
        3: { ratio: [8], level: 75 },
        4: { ratio: [8], level: 75, velocity: 2 },
        5: { ratio: [1], level: 75 },
        6: { ratio: [1], level: 79 },
      },
    },
    ops: {
      1: { eg: eg([60,40,20,70], [95,95,85,0]), rateScaling: 3 },
      2: { eg: eg([63,0,12,70], [99,90,99,0]), rateScaling: 1 },
      3: { eg: eg([97,80,80,70], [99,90,80,0]), rateScaling: 1 },
      4: { eg: eg([50,45,27,70], [99,99,95,0]), rateScaling: 3 },
      5: { eg: eg([63,0,12,70], [99,90,99,0]), rateScaling: 1 },
      6: { eg: eg([63,0,12,70], [99,90,99,0]), rateScaling: 1 },
    },
    keySync: false,
  },
  // after BASSOON (Original Yamaha/DX7 ROM2/ROM2A #6)
  bassoon: {
    label: 'Bassoon', group: 'winds', family: 'reed', hint: 'The low double reed: reedy, a little dark',
    skeleton: {
      algorithms: [2], shape: 'bowed', feedback: 3,
      ops: {
        1: { ratio: [2], level: 99, velocity: 3 },
        2: { ratio: [0.5], level: 78 },
        3: { ratio: [2], level: 99, velocity: 1 },
        4: { ratio: [0.5], level: 72, velocity: 1 },
        5: { ratio: [5], level: 79 },
        6: { ratio: [6.24], level: 66 },
      },
    },
    ops: {
      1: { eg: eg([60,45,27,70], [99,95,85,0]), rateScaling: 3, scaling: [17,0,21,0,0] },
      2: { eg: eg([55,0,12,70], [99,90,99,0]), rateScaling: 1 },
      3: { eg: eg([60,45,27,70], [99,95,85,0]), rateScaling: 3 },
      4: { eg: eg([55,0,12,70], [99,90,99,0]), rateScaling: 1 },
      5: { eg: eg([97,80,80,70], [99,90,70,0]), rateScaling: 1 },
      6: { eg: eg([55,45,27,70], [99,95,85,0]), rateScaling: 3, scaling: [40,10,62,3,0] },
    },
    transpose: -12, keySync: false,
  },
  // after SAXOPHONE3 (Original Yamaha/DX7 VRC Cartridges/VRC-102/VRC-102 WIND INSTRUMENT GROUP (A) #20)
  sax: {
    label: 'Sax', name: 'Saxophone', group: 'winds', family: 'brass', hint: 'A saxophone: a breathy, growling reed',
    skeleton: {
      algorithms: [18], shape: 'bowed', feedback: 7,
      ops: {
        1: { ratio: [1], level: 99, velocity: 1 },
        2: { ratio: [1], level: 68, velocity: 1 },
        3: { ratio: [0.5], level: 60, velocity: 1 },
        4: { ratio: [1], level: 71 },
        5: { ratio: [3], level: 71, velocity: 3 },
        6: { ratio: [0.5], level: 99, velocity: 2 },
      },
    },
    ops: {
      1: { eg: eg([64,11,7,65], [99,99,99,0]), rateScaling: 1 },
      2: { eg: eg([95,20,25,54], [99,99,99,0]), rateScaling: 4, scaling: [39,0,53,0,0] },
      3: { eg: eg([99,16,14,64], [99,94,83,0]), rateScaling: 2, ams: 2 },
      4: { eg: eg([76,20,16,64], [99,99,96,0]), rateScaling: 7 },
      5: { eg: eg([98,10,6,62], [98,99,99,0]), rateScaling: 2 },
      6: { eg: eg([90,52,25,54], [99,99,99,0]), rateScaling: 3 },
    },
    transpose: -12, lfo: [28,53,14,73,4,1], keySync: false,
  },
  // after HARMONICA1 (Original Yamaha/DX7 ROM3/ROM3A #14)
  harmonica: {
    label: 'Harmonica', group: 'winds', family: 'reed', hint: 'A harmonica: a bright reed with air and a quick vibrato',
    skeleton: {
      algorithms: [1], shape: 'bowed', feedback: 7,
      ops: {
        3: { ratio: [1], level: 99 },
        4: { ratio: [0.505], level: 72 },
        5: { ratio: [5], level: 61, detune: 7 },
        6: { ratio: [7.62], level: 41, velocity: 7 },
      },
    },
    ops: {
      3: { eg: eg([54,56,28,64], [92,87,0,0]) },
      4: { eg: eg([38,17,99,61], [89,10,43,0]) },
      5: { eg: eg([65,86,98,62], [98,0,98,0]) },
      6: { eg: eg([99,32,98,62], [99,67,52,0]) },
    },
    transpose: 12, lfo: [38,57,6,0,4,2], keySync: false,
  },
  // after ACCORDION (Original Yamaha/DX7 ROM3/ROM3B #19)
  accordion: {
    label: 'Accordion', group: 'winds', family: 'organ', hint: 'A musette accordion: reeds tuned apart, held like an organ',
    skeleton: {
      algorithms: [4], shape: 'gate', feedback: 7,
      ops: {
        1: { ratio: [0.5], level: 83 },
        2: { ratio: [1], level: 79, detune: 6 },
        3: { ratio: [3], level: 52, detune: 7 },
        4: { ratio: [1], level: 86 },
        5: { ratio: [0.5], level: 70, detune: -1 },
        6: { ratio: [6], level: 57, detune: 1 },
      },
    },
    ops: {
      1: { eg: eg([49,15,10,74], [99,92,82,0]) },
      2: { eg: eg([91,15,10,55], [99,92,71,0]) },
      3: { eg: eg([87,15,10,46], [99,92,71,0]) },
      4: { eg: eg([60,15,10,69], [99,92,99,0]) },
      5: { eg: eg([63,15,10,46], [99,92,68,0]) },
      6: { eg: eg([98,15,10,50], [90,92,68,0]) },
    },
    transpose: 12,
  },
  // ---------- brass ----------
  // After the classic DX7 brass. What they share: modulators that open slower than the carrier, so the brightness
  // swells in after the attack (the lips building up); a bright modulator high up (8.47:1) that blats at the start
  // and dies; feedback 7; the pitch bending into the note from just above.
  // after BR TRUMPET (Original Yamaha/DX7 ROM3/ROM3A #6)
  trumpet: {
    label: 'Trumpet', group: 'brass', family: 'brass', hint: 'After the classic DX7 trumpet: a blat at the start, brightness swelling in, a lip bend',
    skeleton: {
      algorithms: [18], shape: 'bowed', feedback: 7,
      ops: {
        1: { ratio: [1], level: 99, velocity: 4 },
        2: { ratio: [2.1], level: 50, velocity: 7 },
        3: { ratio: [1], level: 79, velocity: 1 },
        4: { ratio: [1], level: 74, velocity: 4 },
        5: { ratio: [6.24], level: 50, detune: -1 },
        6: { ratio: [8.47], level: 99, velocity: 3 },
      },
    },
    ops: {
      1: { eg: eg([70,24,19,55], [99,86,86,0]), rateScaling: 2 },
      2: { eg: eg([99,12,22,50], [85,0,0,0]), rateScaling: 2, scaling: [68,0,96,0,1] },
      3: { eg: eg([41,12,22,50], [99,61,61,0]), rateScaling: 5 },
      4: { eg: eg([66,76,22,50], [99,61,61,0]), rateScaling: 5 },
      5: { eg: eg([48,12,22,50], [99,61,61,0]), rateScaling: 5 },
      6: { eg: eg([42,56,20,70], [99,0,0,0]), rateScaling: 7 },
    },
    pitchEg: eg([86,67,95,60], [52,50, 50, 50]),
    lfo: [34,45,5,0,0,2],
  },
  // after TROMBONE 1 (Original Yamaha/DX7 VRC Cartridges/VRC-102/VRC-102 WIND INSTRUMENT GROUP (B) #6)
  trombone: {
    label: 'Trombone', group: 'brass', family: 'brass', hint: 'After the classic DX7 trombone: slower to speak, a wide lip bend, an octave down',
    skeleton: {
      algorithms: [18], shape: 'bowed', feedback: 7,
      ops: {
        1: { ratio: [1], level: 99, velocity: 2 },
        2: { ratio: [1], level: 67 },
        3: { ratio: [1], level: 81, velocity: 1 },
        4: { ratio: [1], level: 82, velocity: 1 },
        5: { ratio: [3.18], level: 70, detune: -1 },
        6: { ratio: [8.47], level: 79 },
      },
    },
    ops: {
      1: { eg: eg([56,24,19,60], [99,99,99,0]), rateScaling: 3 },
      2: { eg: eg([37,34,15,64], [85,0,0,0]), rateScaling: 2 },
      3: { eg: eg([46,25,22,56], [99,94,92,0]), rateScaling: 3 },
      4: { eg: eg([66,92,22,50], [53,61,62,0]) },
      5: { eg: eg([48,55,22,50], [98,61,62,0]) },
      6: { eg: eg([77,56,20,70], [99,0,0,0]), rateScaling: 7 },
    },
    pitchEg: eg([94,67,98,98], [53,50, 50, 50]),
    transpose: -12, lfo: [35,0,5,0,0,1],
  },
  // after HORN     1 (Original Yamaha/DX7 VRC Cartridges/VRC-102/VRC-102 WIND INSTRUMENT GROUP (A) #22)
  frenchHorn: {
    label: 'Horn', name: 'French horn', group: 'brass', family: 'brass', hint: 'After the classic DX7 horn: round and soft, the brightness growing as it speaks',
    skeleton: {
      algorithms: [10], shape: 'bowed', feedback: 7,
      ops: {
        1: { ratio: [1], level: 99, velocity: 2 },
        2: { ratio: [1], level: 71, velocity: 1 },
        3: { ratio: [1], level: 97, velocity: 1 },
        4: { ratio: [1], level: 99, velocity: 2 },
        5: { ratio: [1], level: 72, velocity: 2 },
        6: { ratio: [2], level: 81, velocity: 1 },
      },
    },
    ops: {
      1: { eg: eg([99,55,28,55], [63,99,99,0]), rateScaling: 3 },
      2: { eg: eg([99,37,35,54], [60,96,92,0]), rateScaling: 3 },
      3: { eg: eg([70,99,70,50], [70,99,80,0]), scaling: [19,0,15,0,0] },
      4: { eg: eg([99,55,28,57], [63,99,99,0]), rateScaling: 3 },
      5: { eg: eg([99,37,35,54], [60,96,92,0]), rateScaling: 3 },
      6: { eg: eg([70,99,70,50], [70,99,80,0]), rateScaling: 3, scaling: [19,0,15,0,0] },
    },
    pitchEg: eg([60,67,95,60], [49,50, 50, 50]),
  },
  // after TUBA (Original Yamaha/DX7 VRC Cartridges/VRC-102/VRC-102 WIND INSTRUMENT GROUP (B) #11)
  tuba: {
    label: 'Tuba', group: 'brass', family: 'brass', hint: 'After the classic DX7 tuba: dark, slow to speak, rising into the note',
    skeleton: {
      algorithms: [18], shape: 'bowed', feedback: 7,
      ops: {
        1: { ratio: [1], level: 99 },
        2: { ratio: [2], level: 89 },
        3: { ratio: [0.5], level: 81, velocity: 1 },
        4: { ratio: [1], level: 96, velocity: 1 },
        5: { ratio: [0.5], level: 89, velocity: 1 },
        6: { ratio: [0.5], level: 86, velocity: 1 },
      },
    },
    ops: {
      1: { eg: eg([72,49,35,54], [71,99,84,0]), rateScaling: 2, scaling: [68,0,99,0,0] },
      2: { eg: eg([56,35,28,17], [84,89,84,0]), rateScaling: 3, scaling: [0,0,99,0,0] },
      3: { eg: eg([99,49,31,46], [46,97,91,0]), rateScaling: 6 },
      4: { eg: eg([66,92,22,50], [53,61,62,0]) },
      5: { eg: eg([48,55,22,50], [98,61,62,0]) },
      6: { eg: eg([77,56,20,70], [99,88,89,0]), rateScaling: 7 },
    },
    pitchEg: eg([67,67,98,98], [48,50, 50, 50]),
    transpose: -12,
  },
  // after BRASS   1 (Original Yamaha/DX7 ROM1/ROM1A #1)
  brassSection: {
    label: 'Brass Sect', name: 'Brass section', group: 'brass', family: 'brass', hint: 'After the DX7 BRASS 1: a section in unison, swelling bright, an octave pair under it',
    skeleton: {
      algorithms: [22], shape: 'bowed', feedback: 7,
      ops: {
        1: { ratio: [0.5], level: 98, detune: 7 },
        2: { ratio: [0.5], level: 86, detune: 7 },
        3: { ratio: [1], level: 99, detune: -2, velocity: 2 },
        4: { ratio: [1], level: 99, velocity: 2 },
        5: { ratio: [1], level: 98, detune: 1, velocity: 2 },
        6: { ratio: [1], level: 82, velocity: 2 },
      },
    },
    ops: {
      1: { eg: eg([72,76,99,71], [99,88,96,0]), scaling: [39,0,14,3,3] },
      2: { eg: eg([62,51,29,71], [82,95,96,0]), scaling: [27,0,7,3,1] },
      3: { eg: eg([77,76,82,71], [99,98,98,0]) },
      4: { eg: eg([77,36,41,71], [99,98,98,0]) },
      5: { eg: eg([77,36,41,71], [99,98,98,0]) },
      6: { eg: eg([49,99,28,68], [98,98,91,0]), rateScaling: 4, scaling: [39,54,50,1,1] },
    },
    lfo: [37,0,5,0,4,3],
  },
  // ---------- strings ----------
  // after VIOLIN   4 (Original Yamaha/DX7 VRC Cartridges/VRC-103/VRC-103 SUSTAIN GROUP (A) #4)
  violin: {
    label: 'Violin', group: 'strings', family: 'string', hint: 'A solo violin: a bowed saw-like tone with a singing vibrato',
    skeleton: {
      algorithms: [18], shape: 'bowed', feedback: 7,
      ops: {
        1: { ratio: [2], level: 99, velocity: 3 },
        2: { ratio: [4], level: 79, detune: 2 },
        3: { ratio: [4], level: 73, detune: 1 },
        4: { ratio: [6], level: 85, velocity: 1 },
        5: { ratio: [6], level: 75, detune: 1, velocity: 5 },
        6: { ratio: [15], level: 90, detune: 5, velocity: 5 },
      },
    },
    ops: {
      1: { eg: eg([50,22,18,61], [97,97,85,0]), rateScaling: 2 },
      2: { eg: eg([99,16,13,37], [99,98,98,0]), rateScaling: 1, scaling: [27,2,60,3,0] },
      3: { eg: eg([99,16,13,37], [99,97,96,0]), rateScaling: 1, scaling: [39,3,7,3,0] },
      4: { eg: eg([99,43,39,53], [99,90,85,0]), rateScaling: 3, scaling: [46,4,13,3,0] },
      5: { eg: eg([99,43,39,53], [99,88,87,0]), rateScaling: 3, scaling: [46,4,13,3,0] },
      6: { eg: eg([99,60,50,51], [99,0,0,0]), scaling: [46,13,0,0,0] },
    },
    pitchEg: eg([98,98,98,98], [46,51, 50, 50]),
    transpose: -12, keySync: false,
  },
  // after CELLO  7.4 (Original Yamaha/TX816/Tfi4 #7)
  cello: {
    label: 'Cello', group: 'strings', family: 'string', hint: 'A solo cello: warm, bowed, with vibrato',
    skeleton: {
      algorithms: [16], shape: 'bowed', feedback: 6,
      ops: {
        1: { ratio: [1], level: 99, detune: 5, velocity: 2 },
        2: { ratio: [1], level: 70, detune: 4 },
        3: { ratio: [1], level: 70, detune: 5 },
        4: { ratio: [3], level: 77, detune: 3, velocity: 2 },
        5: { ratio: [1], level: 72, detune: 3 },
        6: { ratio: [7], level: 80, detune: 4, velocity: 1 },
      },
    },
    ops: {
      1: { eg: eg([48,30,25,41], [94,98,97,0]), rateScaling: 3, scaling: [42,0,5,0,0] },
      2: { eg: eg([68,81,15,48], [82,90,91,0]), rateScaling: 2, scaling: [46,26,24,3,0] },
      3: { eg: eg([89,45,35,44], [94,97,99,0]), rateScaling: 3 },
      4: { eg: eg([96,50,32,48], [98,94,92,0]), rateScaling: 3 },
      5: { eg: eg([90,88,38,25], [97,92,84,0]), rateScaling: 4 },
      6: { eg: eg([84,77,32,68], [98,93,89,0]), rateScaling: 7, scaling: [42,4,13,3,0] },
    },
    pitchEg: eg([61,53,50,60], [49,51, 50, 50]),
    transpose: -12, lfo: [37,20,55,0,4,1], keySync: false,
  },
  // ---------- percussion ----------
  kick: {
    label: 'Kick', group: 'percussion', family: 'wooden', hint: 'A kick drum: a low thump with a fast pitch drop, the same on every key',
    skeleton: {
      algorithms: [5], shape: 'pluck',
      ops: { 1: { fixed: [50, 60], level: 99 }, 2: { fixed: [100, 120], level: [55, 62], fast: true } },
    },
    eg: { carrier: eg([99, 55, 50, 65], [99, 0, 0, 0]), modulator: eg([99, 80, 70, 70], [99, 0, 0, 0]) },
    pitchDrop: [88, 82],
  },
  snare: {
    label: 'Snare', group: 'percussion', family: 'noise', hint: 'A snare drum: a short tone and a burst of noise',
    skeleton: {
      algorithms: [5], shape: 'pluck', feedback: 7,
      ops: {
        1: { fixed: [170, 200], level: 99 }, 2: { fixed: [320, 360], level: [56, 62], fast: true },
        5: { ratio: [5.19], level: [86, 92] }, 6: { ratio: [7.07], level: 99, noise: true },
      },
    },
    eg: { carrier: eg([99, 58, 52, 68], [99, 0, 0, 0]), modulator: eg([99, 66, 58, 68], [99, 0, 0, 0]) },
    pitchDrop: [62, 75],
  },
  tom: {
    label: 'Tom', group: 'percussion', family: 'wooden', hint: 'A tom: a tuned drum with a pitch drop, following the keys',
    skeleton: {
      algorithms: [5], shape: 'pluck',
      ops: { 1: { ratio: [1], level: 99 }, 2: { ratio: [1.41], level: [48, 54], fast: true } },
    },
    eg: { carrier: eg([99, 50, 45, 60], [99, 0, 0, 0]), modulator: eg([99, 75, 60, 60], [80, 0, 0, 0]) },
    transpose: -12, pitchDrop: [64, 62],
  },
  hiHat: {
    label: 'Hi-Hat', group: 'percussion', family: 'noise', hint: 'A closed hi-hat: a short metallic tick',
    skeleton: {
      algorithms: [5], shape: 'pluck', feedback: 7,
      ops: {
        1: { fixed: [7000, 9000], level: [72, 78] }, 2: { fixed: [3200, 3800], level: [84, 90] },
        5: { ratio: [13], level: 99 }, 6: { ratio: [7.07], level: 99, noise: true },
      },
    },
    eg: { carrier: eg([99, 68, 64, 75], [99, 0, 0, 0]), modulator: eg([99, 68, 64, 75], [99, 0, 0, 0]) },
  },
  cymbal: {
    label: 'Cymbal', group: 'percussion', family: 'metallic', hint: 'A crash cymbal: a long metallic wash',
    skeleton: {
      algorithms: [5], shape: 'struck', feedback: 7,
      ops: {
        1: { fixed: [4500, 5500], level: [78, 84] }, 2: { fixed: [3000, 4500], level: [88, 94] },
        3: { fixed: [6500, 7500], level: [70, 76] }, 4: { fixed: [1400, 1700], level: [84, 90] },
        5: { ratio: [13], level: [92, 96] }, 6: { ratio: [7.07], level: 99, noise: true },
      },
    },
    eg: { carrier: eg([99, 40, 35, 45], [99, 60, 0, 0]), modulator: eg([99, 45, 38, 45], [99, 70, 0, 0]) },
  },
  cowbell: {
    label: 'Cowbell', group: 'percussion', family: 'metallic', hint: 'The drum-machine cowbell: two square-ish tones, short',
    skeleton: {
      algorithms: [32], shape: 'pluck', feedback: 3,
      ops: { 1: { fixed: [540, 540], level: 99 }, 2: { fixed: [800, 800], level: [88, 94] } },
    },
    eg: { carrier: eg([99, 60, 50, 65], [99, 40, 0, 0]), modulator: eg([99, 60, 50, 65], [99, 40, 0, 0]) },
  },
  // after TIMPANI (Original Yamaha/DX7 ROM3/ROM3A #20)
  timpani: {
    label: 'Timpani', group: 'percussion', family: 'warm', hint: 'Timpani: a deep, round, ringing drum',
    skeleton: {
      algorithms: [16], shape: 'struck', feedback: 7,
      ops: {
        1: { ratio: [0.5], level: 99, velocity: 7 },
        2: { ratio: [0.5], level: 80, detune: 3, velocity: 1 },
        3: { ratio: [0.68], level: 85, detune: -3 },
        4: { ratio: [0.875], level: 87, velocity: 6 },
        5: { ratio: [0.5], level: 73, velocity: 1 },
        6: { ratio: [0.78], level: 73, velocity: 1 },
      },
    },
    ops: {
      1: { eg: eg([91,36,98,33], [99,0,0,0]), rateScaling: 3 },
      2: { eg: eg([99,76,26,23], [99,72,99,0]), rateScaling: 4 },
      3: { eg: eg([99,77,26,23], [99,72,0,0]), rateScaling: 3 },
      4: { eg: eg([65,31,17,30], [99,75,0,0]), rateScaling: 3, scaling: [41,0,15,3,0] },
      5: { eg: eg([99,50,26,19], [99,0,0,0]) },
      6: { eg: eg([98,2,26,27], [98,0,0,0]), rateScaling: 4, scaling: [41,0,24,0,0] },
    },
    pitchEg: eg([98,98,75,60], [50,51, 50, 50]),
    lfo: [11,0,16,0,0,2],
  },
  // ---------- voices ----------
  choir: {
    label: 'Choir', group: 'voices', family: 'string', hint: 'An "aah" choir: voices side by side, the vowel in the partials',
    skeleton: {
      algorithms: [32], shape: 'pad', vibrato: [60, 60, 5],
      ops: {
        1: { ratio: [1], level: 99, detune: -2 }, 2: { ratio: [1], level: 95, detune: 3 },
        3: { ratio: [3], level: [70, 76] }, 4: { ratio: [4], level: [62, 68] },
        5: { ratio: [2], level: [70, 76] }, 6: { ratio: [6], level: [48, 54] },
      },
    },
    eg: { carrier: eg([40, 45, 45, 45], [99, 97, 95, 0]), modulator: eg([40, 45, 45, 45], [90, 88, 86, 0]) },
  },
  ooh: {
    label: 'Ooh', name: 'Ooh choir', group: 'voices', family: 'warm', hint: 'An "ooh" choir: soft, round voices',
    skeleton: {
      algorithms: [32], shape: 'pad', vibrato: [58, 65, 5],
      ops: { 1: { ratio: [1], level: 99, detune: -2 }, 2: { ratio: [1], level: 95, detune: 3 }, 3: { ratio: [2], level: [62, 68] } },
    },
    eg: { carrier: eg([40, 45, 45, 45], [99, 97, 95, 0]), modulator: eg([40, 45, 45, 45], [90, 88, 86, 0]) },
  },
  whistle: {
    label: 'Whistle', group: 'voices', family: 'breath', hint: 'Whistling: a pure tone with a little air and vibrato',
    skeleton: {
      algorithms: [5], shape: 'bowed', feedback: 7, vibrato: [80, 40, 8],
      ops: { 1: { ratio: [1], level: 99 }, 5: { ratio: [1], level: [44, 50] }, 6: { ratio: [7.07], level: 99, noise: true } },
    },
    eg: { carrier: eg([60, 50, 45, 60], [99, 95, 93, 0]), modulator: eg([60, 50, 45, 60], [99, 95, 93, 0]) },
    transpose: 12,
  },
} satisfies Record<string, Instrument>

export type InstrumentId = keyof typeof RECIPES
export const INSTRUMENTS: Record<InstrumentId, Instrument> = RECIPES
export const INSTRUMENT_IDS = Object.keys(INSTRUMENTS) as InstrumentId[]

/** The full name to show. */
export const instrumentName = (i: Instrument) => i.name ?? i.label
