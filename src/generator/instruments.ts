// Instruments to start from (PLAN §4): the classic DX7 territory the wheel's tonalities don't cover on their own,
// as recipes in the same form: a skeleton, envelopes per role where the shapes don't fit, and what an instrument
// needs beyond that (keyboard scaling, velocity, tremolo, a pitch drop for drums, its register). An instrument is
// the base of a voice in place of the heaviest pin; pins colour it. Starting points to tune by ear, aiming at the
// classic DX7 versions of these sounds, not at realism.
// Envelope times (docs/SOUND.md): attack R1 99 instant, 60 ≈ 0.06 s, 40 ≈ 0.55 s; a fall to −40 dB at R 30 ≈ 5.5 s,
// 40 ≈ 2 s, 50 ≈ 0.6 s, 60 ≈ 0.2 s, 70 ≈ 0.08 s. Fixed frequencies in Hz; levels 0–99.
import type { GeneratorChoices, Tonality } from './choices'
import type { Eg } from './shapes'
import type { Skeleton } from './tonalities'

export const INSTRUMENT_GROUPS = ['keys', 'plucked', 'mallets', 'bass', 'winds', 'strings', 'percussion', 'voices'] as const
export type InstrumentGroup = (typeof INSTRUMENT_GROUPS)[number]
export const INSTRUMENT_GROUP_LABELS: Record<InstrumentGroup, string> = {
  keys: 'Keys', plucked: 'Plucked', mallets: 'Mallets', bass: 'Bass', winds: 'Winds', strings: 'Strings', percussion: 'Percussion', voices: 'Voices',
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
  /** a short pitch fall or scoop into every note */
  accent?: 'above' | 'below'
  /** the controls it starts with */
  controls?: Partial<Omit<GeneratorChoices, 'pins' | 'instrument'>>
  /** per operator, over the above: what a classic patch sets operator by operator */
  ops?: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, OpDetail>>
}

export interface OpDetail {
  /** its own envelope (a shape chosen in the controls replaces it) */
  eg?: Eg
  /** 0–7 */
  rateScaling?: number
  /** keyboard level scaling: break point (39 = C3), depths 0–99, curves 0 −lin, 1 −exp, 2 +exp, 3 +lin */
  scaling?: readonly [breakPoint: number, leftDepth: number, rightDepth: number, leftCurve: number, rightCurve: number]
}

const eg = (rates: Eg['rates'], levels: Eg['levels']): Eg => ({ rates, levels })

const RECIPES = {
  // ---------- keys ----------
  // the grand after the most copied DX7 piano (1ST-PIANO, REAL PIANO and the TX816 A.PNO 17 family share it): two
  // three-operator stacks at 1:1, a 5:1 hammer that fades up the keys, a modulator that dips and comes back (the
  // thump), a slow two-stage fall
  piano: {
    label: 'Grand', name: 'Grand piano', group: 'keys', family: 'tine', hint: 'After the classic DX7 grands: two detuned string stacks, a hammer that softens up the keys, a long two-stage fade',
    skeleton: {
      algorithms: [4], shape: 'struck', feedback: [4, 5],
      ops: {
        1: { ratio: [1], level: 99, velocity: 4 }, 2: { ratio: [1], level: [86, 89], detune: 2, velocity: 1 },
        3: { ratio: [5], level: [77, 80], detune: 2, velocity: 3 }, 4: { ratio: [1], level: [97, 98], detune: [-1, 0], velocity: 4 },
        5: { ratio: [1], level: [67, 70], detune: 3, velocity: 3 }, 6: { ratio: [1], level: [57, 60] },
      },
    },
    ops: {
      1: { eg: eg([88, 28, 27, 50], [99, 90, 0, 0]), rateScaling: 2 },
      2: { eg: eg([88, 92, 71, 63], [99, 67, 91, 90]), rateScaling: 2, scaling: [39, 0, 13, 0, 0] },
      3: { eg: eg([95, 28, 27, 47], [99, 90, 0, 0]), rateScaling: 2, scaling: [5, 0, 99, 0, 1] },
      4: { eg: eg([88, 28, 27, 50], [99, 90, 0, 0]), rateScaling: 3 },
      5: { eg: eg([83, 0, 27, 50], [99, 90, 0, 0]), rateScaling: 2 },
      6: { eg: eg([95, 28, 27, 47], [99, 90, 0, 0]), rateScaling: 2, scaling: [5, 0, 0, 0, 1] },
    },
    controls: { velocity: 0.6 },
  },
  // the upright after the TX7 UPRIGHT: shorter and honkier, carriers further apart, a buzzing third harmonic on
  // feedback, a hammer at 4:1, one string that rings on
  upright: {
    label: 'Upright', name: 'Upright piano', group: 'keys', family: 'tine', hint: 'After the classic DX7 upright: honky detuned strings, a buzzing hammer, shorter up the keys',
    skeleton: {
      algorithms: [3], shape: 'struck', feedback: [6, 7],
      ops: {
        1: { ratio: [1], level: 99, detune: -2, velocity: 1 }, 2: { ratio: [1], level: [88, 90], detune: 2, velocity: 2 },
        3: { ratio: [4], level: [80, 82], detune: -2, velocity: [1, 2] }, 4: { ratio: [1], level: 99, detune: [-4, -3], velocity: 1 },
        5: { ratio: [2], level: [70, 72], detune: -3, velocity: 2 }, 6: { ratio: [3], level: [52, 55] },
      },
    },
    ops: {
      1: { eg: eg([70, 25, 20, 48], [99, 82, 0, 0]), rateScaling: 5 },
      2: { eg: eg([99, 0, 65, 0], [99, 75, 0, 0]), rateScaling: 5, scaling: [50, 0, 21, 0, 0] },
      3: { eg: eg([99, 72, 25, 39], [24, 85, 0, 0]), rateScaling: 5, scaling: [46, 32, 25, 3, 0] },
      4: { eg: eg([82, 42, 22, 45], [99, 99, 52, 0]), rateScaling: 4 },
      5: { eg: eg([99, 60, 31, 39], [99, 96, 71, 0]), rateScaling: 2, scaling: [48, 0, 15, 0, 0] },
      6: { eg: eg([77, 20, 0, 85], [99, 47, 89, 0]), rateScaling: 2, scaling: [65, 0, 38, 0, 1] },
    },
    controls: { velocity: 0.5 },
  },
  epiano: {
    label: 'E.Piano', name: 'Electric piano', group: 'keys', family: 'tine', hint: 'The DX7 e-piano: a bell-like tine over a soft body, both on velocity',
    skeleton: {
      algorithms: [5], shape: 'struck',
      ops: {
        1: { ratio: [1], level: 99, velocity: [2, 3] }, 2: { ratio: [1], level: [74, 82], velocity: [3, 5] },
        3: { ratio: [1], level: [86, 94], detune: [2, 4] }, 4: { ratio: [14], level: [70, 80], velocity: [5, 7], fast: true },
      },
    },
    eg: { carrier: eg([99, 50, 36, 55], [99, 92, 0, 0]), modulator: eg([99, 52, 40, 55], [99, 82, 0, 0]) },
    rateScaling: 2, controls: { velocity: 0.7 },
  },
  harpsichord: {
    label: 'Harpsichrd', name: 'Harpsichord', group: 'keys', family: 'reed', hint: 'Plucked by quills: bright and buzzy, no touch, a quick damper',
    skeleton: {
      algorithms: [5], shape: 'pluck', feedback: [4, 5],
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [3], level: [80, 86] },
        3: { ratio: [2], level: [80, 86] }, 4: { ratio: [1], level: [82, 88] },
        5: { ratio: [4], level: [62, 70] }, 6: { ratio: [7], level: [70, 76] },
      },
    },
    eg: { carrier: eg([99, 42, 34, 70], [99, 88, 0, 0]), modulator: eg([99, 44, 35, 70], [99, 94, 0, 0]) },
    rateScaling: 2, treble: 0.2,
  },
  clavinet: {
    label: 'Clavinet', group: 'keys', family: 'reed', hint: 'Funky and percussive, buzzing, very touch-sensitive',
    skeleton: {
      algorithms: [5], shape: 'pluck', feedback: 6,
      ops: {
        1: { ratio: [1], level: 99, velocity: 3 }, 2: { ratio: [1], level: [80, 86], velocity: 5 },
        3: { ratio: [2], level: [68, 74] }, 4: { ratio: [3], level: [70, 76], velocity: 4 },
        5: { ratio: [1], level: [58, 64] }, 6: { ratio: [1], level: [78, 84] },
      },
    },
    eg: { carrier: eg([99, 50, 40, 70], [99, 85, 0, 0]), modulator: eg([99, 55, 44, 70], [99, 80, 0, 0]) },
    controls: { velocity: 0.7 },
  },
  // ---------- plucked ----------
  nylonGuitar: {
    label: 'Nylon Gtr', name: 'Nylon guitar', group: 'plucked', family: 'string', hint: 'A classical guitar: soft pluck, warm body',
    skeleton: {
      algorithms: [5], shape: 'pluck',
      ops: {
        1: { ratio: [1], level: 99, velocity: 2 }, 2: { ratio: [1], level: [62, 70], velocity: 4 },
        3: { ratio: [2], level: [72, 80], detune: 2 }, 4: { ratio: [3], level: [50, 58] },
        5: { ratio: [1], level: [66, 74], detune: -2 }, 6: { ratio: [5], level: [40, 50], fast: true },
      },
    },
    eg: { carrier: eg([99, 46, 33, 55], [99, 90, 0, 0]), modulator: eg([99, 48, 36, 55], [96, 84, 0, 0]) },
    rateScaling: 3, treble: -0.3, controls: { velocity: 0.5 },
  },
  steelGuitar: {
    label: 'Steel Gtr', name: 'Steel-string guitar', group: 'plucked', family: 'string', hint: 'A steel-string guitar: brighter pick, a little shimmer',
    skeleton: {
      algorithms: [5], shape: 'pluck',
      ops: {
        1: { ratio: [1], level: 99, velocity: 2 }, 2: { ratio: [1], level: [74, 80], velocity: 4 },
        3: { ratio: [2], level: [74, 80], detune: 3 }, 4: { ratio: [3], level: [60, 68] },
        5: { ratio: [1], level: [70, 78], detune: -3 }, 6: { ratio: [7], level: [58, 66], fast: true },
      },
    },
    eg: { carrier: eg([99, 44, 32, 55], [99, 92, 0, 0]), modulator: eg([99, 46, 35, 55], [99, 88, 0, 0]) },
    rateScaling: 3, treble: -0.2, controls: { velocity: 0.5 },
  },
  harp: {
    label: 'Harp', group: 'plucked', family: 'glass', hint: 'A concert harp: a gentle pluck that rings long',
    skeleton: {
      algorithms: [5], shape: 'pluck', branches: [[5, 6]],
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [2], level: [55, 62] },
        3: { ratio: [2], level: [68, 74], detune: 2 }, 4: { ratio: [1], level: [46, 54] },
      },
    },
    eg: { carrier: eg([92, 42, 30, 45], [99, 92, 0, 0]), modulator: eg([92, 50, 38, 45], [92, 80, 0, 0]) },
    rateScaling: 2,
  },
  koto: {
    label: 'Koto', group: 'plucked', family: 'wooden', hint: 'A Japanese koto: a hard pluck with a little pitch fall',
    skeleton: {
      algorithms: [5], shape: 'pluck',
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [3], level: [74, 80], fast: true },
        3: { ratio: [2], level: [68, 74] }, 4: { ratio: [5], level: [56, 64], fast: true },
      },
    },
    eg: { carrier: eg([99, 46, 36, 55], [99, 88, 0, 0]), modulator: eg([99, 50, 40, 55], [99, 80, 0, 0]) },
    rateScaling: 3, accent: 'above',
  },
  sitar: {
    label: 'Sitar', group: 'plucked', family: 'metallic', hint: 'A sitar: a long, buzzing, slightly out-of-true ring',
    skeleton: {
      algorithms: [1], shape: 'pluck', feedback: 6,
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [1], level: [80, 86] },
        3: { ratio: [1], level: [78, 84] }, 4: { ratio: [2], level: [68, 74] },
        5: { ratio: [1.01], level: [72, 78] }, 6: { ratio: [1], level: [82, 88] },
      },
    },
    eg: { carrier: eg([99, 42, 32, 55], [99, 85, 0, 0]), modulator: eg([99, 45, 35, 55], [99, 90, 0, 0]) },
  },
  pizzicato: {
    label: 'Pizzicato', group: 'plucked', family: 'string', hint: 'Plucked orchestral strings: short and round',
    skeleton: {
      algorithms: [5], shape: 'pluck',
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [1], level: [62, 70] },
        3: { ratio: [1], level: [86, 92], detune: 3 }, 4: { ratio: [2], level: [52, 58] },
      },
    },
    eg: { carrier: eg([99, 52, 48, 60], [99, 70, 0, 0]), modulator: eg([99, 56, 50, 60], [96, 60, 0, 0]) },
  },
  // ---------- mallets ----------
  vibraphone: {
    label: 'Vibraphone', name: 'Vibraphone', group: 'mallets', family: 'tine', hint: 'Vibes: a soft mallet, a long ring, the motor’s tremolo',
    skeleton: {
      algorithms: [5], shape: 'struck',
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [4], level: [58, 66], fast: true },
        3: { ratio: [1], level: [82, 88], detune: 2 }, 4: { ratio: [10], level: [48, 54], fast: true },
      },
    },
    eg: { carrier: eg([99, 40, 32, 45], [99, 94, 0, 0]), modulator: eg([99, 65, 50, 45], [90, 0, 0, 0]) },
    tremolo: [34, 45],
  },
  xylophone: {
    label: 'Xylophone', group: 'mallets', family: 'wooden', hint: 'A xylophone: hard, bright, short',
    skeleton: {
      algorithms: [5], shape: 'pluck',
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [4], level: [66, 74], fast: true },
        3: { ratio: [3], level: [68, 74] }, 4: { ratio: [1], level: [48, 54], fast: true },
      },
    },
    eg: { carrier: eg([99, 54, 48, 60], [99, 70, 0, 0]), modulator: eg([99, 70, 60, 60], [99, 0, 0, 0]) },
    transpose: 12,
  },
  glockenspiel: {
    label: 'Glocken', name: 'Glockenspiel', group: 'mallets', family: 'glass', hint: 'A glockenspiel: small, high, ringing bars',
    skeleton: {
      algorithms: [5], shape: 'struck',
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [3.5], level: [56, 64] },
        3: { ratio: [2.78], level: [72, 78] }, 4: { ratio: [7], level: [48, 54], fast: true },
      },
    },
    eg: { carrier: eg([99, 40, 30, 40], [99, 92, 0, 0]), modulator: eg([99, 60, 45, 40], [80, 0, 0, 0]) },
    transpose: 24,
  },
  steelDrum: {
    label: 'Steel Drum', group: 'mallets', family: 'bell', hint: 'A steel pan: a round, slightly bending ring',
    skeleton: {
      algorithms: [5], shape: 'struck',
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [2], level: [66, 72] },
        3: { ratio: [2], level: [66, 72], detune: -2 }, 4: { ratio: [3.5], level: [52, 58] },
        5: { ratio: [3], level: [48, 54] }, 6: { ratio: [1], level: [38, 44] },
      },
    },
    eg: { carrier: eg([99, 50, 40, 50], [99, 80, 0, 0]), modulator: eg([99, 55, 45, 50], [90, 50, 0, 0]) },
    accent: 'below',
  },
  // ---------- bass ----------
  fmBass: {
    label: 'FM Bass', group: 'bass', family: 'brass', hint: 'The punchy DX bass: a bright attack settling into a round body',
    skeleton: {
      algorithms: [1], shape: 'pluck', feedback: [5, 6],
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [1], level: [84, 90], velocity: 4 },
        3: { ratio: [1], level: [80, 86] }, 4: { ratio: [1], level: [72, 78] },
        5: { ratio: [3], level: [60, 66] }, 6: { ratio: [1], level: [72, 78] },
      },
    },
    eg: { carrier: eg([99, 60, 45, 70], [99, 90, 80, 0]), modulator: eg([99, 60, 50, 70], [95, 70, 55, 0]) },
    transpose: -24, controls: { velocity: 0.6 },
  },
  slapBass: {
    label: 'Slap Bass', group: 'bass', family: 'tine', hint: 'Slapped and popped: a sharp click, played hard',
    skeleton: {
      algorithms: [5], shape: 'pluck',
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [1], level: [84, 90], velocity: 6 },
        3: { ratio: [1], level: [82, 88], detune: 2 }, 4: { ratio: [3], level: [78, 84], velocity: 7, fast: true },
      },
    },
    eg: { carrier: eg([99, 58, 42, 70], [99, 80, 50, 0]), modulator: eg([99, 70, 50, 70], [99, 55, 30, 0]) },
    transpose: -24, controls: { velocity: 0.8 },
  },
  uprightBass: {
    label: 'Upright', name: 'Upright bass', group: 'bass', family: 'warm', hint: 'A double bass, plucked: soft, woody, round',
    skeleton: {
      algorithms: [5], shape: 'pluck',
      ops: {
        1: { ratio: [1], level: 99, velocity: 2 }, 2: { ratio: [1], level: [55, 62] },
        3: { ratio: [2], level: [56, 62] }, 4: { ratio: [1], level: [42, 48] },
      },
    },
    eg: { carrier: eg([95, 48, 38, 60], [99, 88, 0, 0]), modulator: eg([95, 52, 42, 60], [92, 75, 0, 0]) },
    transpose: -24,
  },
  synthBass: {
    label: 'Synth Bass', group: 'bass', family: 'brass', hint: 'A saw-like synth bass with a closing filter',
    skeleton: {
      algorithms: [1], shape: 'gate', feedback: 6,
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [1], level: [80, 86] },
        3: { ratio: [0.5], level: [80, 86] }, 4: { ratio: [1], level: [66, 72] },
        5: { ratio: [1], level: [58, 64] }, 6: { ratio: [1], level: [80, 86] },
      },
    },
    eg: { carrier: eg([99, 99, 99, 75], [99, 99, 99, 0]), modulator: eg([99, 55, 50, 75], [99, 75, 70, 0]) },
    transpose: -24,
  },
  // ---------- winds ----------
  oboe: {
    label: 'Oboe', group: 'winds', family: 'reed', hint: 'A double reed: nasal, focused, with vibrato',
    skeleton: {
      algorithms: [1], shape: 'bowed', feedback: 4, vibrato: [72, 70, 6],
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [1], level: [74, 80] },
        3: { ratio: [3], level: [66, 72] }, 4: { ratio: [1], level: [60, 66] },
        5: { ratio: [2], level: [48, 54] }, 6: { ratio: [1], level: [52, 58] },
      },
    },
    eg: { carrier: eg([62, 50, 45, 60], [99, 95, 93, 0]), modulator: eg([56, 48, 45, 60], [96, 92, 90, 0]) },
    transpose: 12,
  },
  bassoon: {
    label: 'Bassoon', group: 'winds', family: 'reed', hint: 'The low double reed: reedy, a little dark',
    skeleton: {
      algorithms: [1], shape: 'bowed', feedback: 3, vibrato: [70, 75, 5],
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [1], level: [68, 74] },
        3: { ratio: [3], level: [60, 66] }, 4: { ratio: [1], level: [56, 62] },
        5: { ratio: [2], level: [44, 50] }, 6: { ratio: [1], level: [48, 54] },
      },
    },
    eg: { carrier: eg([60, 50, 45, 60], [99, 95, 93, 0]), modulator: eg([54, 48, 45, 60], [94, 90, 88, 0]) },
    transpose: -12,
  },
  sax: {
    label: 'Sax', name: 'Saxophone', group: 'winds', family: 'brass', hint: 'A saxophone: a breathy, growling reed',
    skeleton: {
      algorithms: [5], shape: 'bowed', feedback: 7, vibrato: [70, 75, 7],
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [1], level: [76, 82], velocity: 4 },
        3: { ratio: [1], level: [82, 88], detune: 2 }, 4: { ratio: [2], level: [62, 70] },
        5: { ratio: [1], level: [56, 62] }, 6: { ratio: [7.07], level: 99, noise: true },
      },
    },
    eg: { carrier: eg([70, 50, 45, 60], [99, 95, 93, 0]), modulator: eg([55, 45, 45, 60], [99, 92, 90, 0]) },
  },
  harmonica: {
    label: 'Harmonica', group: 'winds', family: 'reed', hint: 'A harmonica: a bright reed with air and a quick vibrato',
    skeleton: {
      algorithms: [5], shape: 'bowed', feedback: 7, vibrato: [85, 60, 5],
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [2], level: [74, 80] },
        3: { ratio: [1], level: [80, 86], detune: 3 }, 4: { ratio: [2], level: [66, 72] },
        5: { ratio: [1], level: [52, 58] }, 6: { ratio: [3.5], level: 99, noise: true },
      },
    },
    eg: { carrier: eg([70, 50, 45, 65], [99, 95, 93, 0]), modulator: eg([62, 48, 45, 65], [96, 92, 90, 0]) },
    transpose: 12,
  },
  accordion: {
    label: 'Accordion', group: 'winds', family: 'organ', hint: 'A musette accordion: reeds tuned apart, held like an organ',
    skeleton: {
      algorithms: [5], shape: 'gate', feedback: 3,
      ops: {
        1: { ratio: [1], level: 99, detune: -4 }, 2: { ratio: [2], level: [70, 76] },
        3: { ratio: [1], level: 95, detune: 4 }, 4: { ratio: [2], level: [70, 76] },
        5: { ratio: [2], level: [68, 74] }, 6: { ratio: [1], level: [58, 64] },
      },
    },
    eg: { carrier: eg([80, 99, 99, 70], [99, 99, 99, 0]), modulator: eg([80, 99, 99, 70], [99, 99, 99, 0]) },
  },
  // ---------- strings ----------
  violin: {
    label: 'Violin', group: 'strings', family: 'string', hint: 'A solo violin: a bowed saw-like tone with a singing vibrato',
    skeleton: {
      algorithms: [1], shape: 'bowed', feedback: 6, vibrato: [66, 70, 8],
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [1], level: [72, 78] },
        3: { ratio: [1], level: [86, 92], detune: 2 }, 4: { ratio: [1], level: [70, 76] },
        5: { ratio: [2], level: [52, 58] }, 6: { ratio: [1], level: [80, 85] },
      },
    },
    eg: { carrier: eg([55, 45, 40, 55], [99, 95, 93, 0]), modulator: eg([48, 42, 40, 55], [95, 92, 90, 0]) },
    transpose: 12,
  },
  cello: {
    label: 'Cello', group: 'strings', family: 'string', hint: 'A solo cello: warm, bowed, with vibrato',
    skeleton: {
      algorithms: [1], shape: 'bowed', feedback: 5, vibrato: [62, 75, 7],
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [1], level: [68, 74] },
        3: { ratio: [1], level: [84, 90], detune: 2 }, 4: { ratio: [1], level: [66, 72] },
        5: { ratio: [2], level: [48, 54] }, 6: { ratio: [1], level: [78, 83] },
      },
    },
    eg: { carrier: eg([52, 45, 40, 52], [99, 95, 93, 0]), modulator: eg([46, 42, 40, 52], [94, 91, 89, 0]) },
    transpose: -12,
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
  timpani: {
    label: 'Timpani', group: 'percussion', family: 'warm', hint: 'Timpani: a deep, round, ringing drum',
    skeleton: {
      algorithms: [5], shape: 'struck',
      ops: {
        1: { ratio: [1], level: 99 }, 2: { ratio: [1.5], level: [50, 58] },
        3: { ratio: [2], level: [58, 64], detune: 2 }, 4: { ratio: [1], level: [38, 44] },
      },
    },
    eg: { carrier: eg([95, 42, 35, 45], [99, 88, 0, 0]), modulator: eg([95, 52, 42, 45], [85, 50, 0, 0]) },
    transpose: -12, accent: 'above',
  },
  // ---------- voices ----------
  choir: {
    label: 'Choir', group: 'voices', family: 'breath', hint: 'An "aah" choir: voices side by side, the vowel in the partials',
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
