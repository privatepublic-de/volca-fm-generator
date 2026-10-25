# How the generator's numbers were found

What the engine does with DX7 parameters, measured (`npm run calibrate`), and what the generator makes, measured
(`npm run survey`). The browser engine and the volca fm2 sounded alike by ear (2026-10-25), so the measures stand
for the volca too; by-ear tuning on the volca has the last word. Tonalities are data in
`src/generator/tonalities.ts`: change the numbers there.

## The engine, calibrated (2026-10-25)

**A modulator's level** (OP2 → OP1 at 1:1, brightness = spectral centroid ÷ the fundamental):

| Level | 0 | 40 | 50 | 60 | 65 | 70 | 75 | 80 | 85 | 90 | 95 | 99 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Brightness | 1.00 | 1.04 | 1.09 | 1.23 | 1.37 | 1.62 | 2.18 | 2.36 | 2.75 | 4.34 | 6.27 | 7.87 |

Flat below about 60, steep above: ±10 around 75 is a big change, so the controls step by 9–22 on quiet modulators
and less on deep ones. A modulator at level 75 and ratio N lands at about N + 1 (2: 2.4, 7: 8.6, 14: 16.8).

**Feedback** on a lone operator at full level: 0–3 barely change it (1.0 → 1.3), 4 is 2.1, 5 is 6.4. At 6–7 the sound
stops being a tone. Saw-like tones come from feedback 6–7 with the operator at 80–88.

**Noise.** Feedback 7 is real noise (spectral flatness about 0.5, white noise is 0.55) only with the operator at
**96 or more**, output level and envelope together. At 92 it is still a periodic, buzzy tone (flatness 0, periodicity
0.96). Fixed frequencies and inharmonic ratios give dense lines, never noise. So a noise operator holds its envelope at
the top (`makeNoise`) and the carrier it feeds shapes the sound; and nothing may lower its level or the feedback
afterwards (`noiseSource`), or it turns back into a tone.

**Noise in small amounts** (2026-10-25, after the fm2 showed noise was on or off): the source can't be turned down, so
the amount is set where it goes (`addNoise`). Into a carrier, that carrier's level: from 40 dB under the tone (a hint
of air) to 6 dB under (`noiseDb`). Into a modulator, that modulator's level, 45 (barely rough) to 85 (all noise). Only
the feedback operator can be the source, so a noise pin takes a free pair only where that pair's modulator is the
feedback operator, and algorithms whose feedback can't host it switch to the twin with the same roles (32 → 31,
6 → 5, 4 → 3). Brass became two detuned pairs plus a free one (algorithm 5) so that it has a place for noise too.
`tools/noise-steps.ts` measures it, and a test keeps it gradual: noisiness grows at every step of the weight, as a
colour and as a branch, from a hint at 0.03.

**Rates** (the envelope's time roughly triples for every 10 less):

| Rate | 20 | 30 | 40 | 50 | 60 | 70 | 80 |
|---|---|---|---|---|---|---|---|
| Attack, R1, to 90 % | 5.3 s | 1.5 s | 0.55 s | 0.17 s | 0.06 s | 0.02 s | 0.01 s |
| Fall to −40 dB, R2 with L2 = 0 | 19 s | 5.5 s | 2.0 s | 0.6 s | 0.2 s | 0.08 s | 0.03 s |

**Levels**: 0.75 dB a step above 20 (both output level and EG levels).

## Loudness

Every voice is brought to the same loudness, INIT VOICE −3 dB (the loudest 20 ms of a held C4). All sounding carriers
move by the same number of steps. The measure runs on a copy with quick rates, so a slow pad measures what it grows to.
One render a voice, two when a carrier hit 99 or carries the feedback. About 12 ms per voice in Node.

## What the generator makes (2026-10-25)

Each tonality alone, five seeds, at the default controls; brightness and noisiness over 0.1–0.6 s, periodicity over
0.3–0.6 s (1 = a steady harmonic tone), decay = from the loudest point to −20 dB (∞: held).

| Tonality | Name | Algorithm | Brightness | Flatness | Periodicity | Attack | Decay |
|---|---|---|---|---|---|---|---|
| noise | Noise | 5–6 | 30.0 | 0.51 | 0.12 | 0 | 1.1–1.3 s |
| metallic | Metal | 16 | 2.87 | 0 | 0.93 | 0 | 1.1–1.4 s |
| bell | Bell | 5 | 1.56 | 0 | 1.00 | 0 | 1.1–1.3 s |
| glass | Glass | 5 | 1.59 | 0 | 1.00 | 0 | 1.3 s |
| tine | E.Piano | 5 | 1.31 | 0 | 1.00 | 0 | 0.9–1.1 s |
| wooden | Marimba | 5 | 1.18 | 0 | 1.00 | 0 | 0.7–0.8 s |
| organ | Organ | 32 | 1.45 | 0 | 1.00 | 0.01 s | ∞ |
| warm | Warm | 5–6 | 1.08 | 0 | 1.00 | 0.10 s | ∞ |
| reed | Reed | 5 | 1.83 | 0 | 1.00 | 0.11 s | ∞ |
| brass | Brass | 5 | 2.84 | 0 | 1.00 | 0.03 s | ∞ |
| string | Strings | 5 | 2.29 | 0 | 1.00 | 0.10 s | ∞ |
| breath | Flute | 5 | 18.2 | 0.001 | 1.00 | 0.13 s | ∞ |

Bell's ratio 3.5 makes its partials whole multiples of half the fundamental, so it measures as periodic; its
inharmonicity comes from 1.41 and 2.78. Breath's air is noise about 30 dB under the tone: it moves the centroid a
lot and the flatness a little, which is what a flute should do.

The tests (`test/generator.test.ts`) pin these relations: noise is noise, metallic is less periodic than warm and
organ, brass and strings are brighter than warm, bell and wood fade and wood is the shorter, the controls move what
they say, and 120 random choices give valid voices that are neither silent nor clipping.

## To tune by ear on the volca

- **Breath:** how much air (the noise branch's carrier level, `breath` in tonalities.ts).
- **Metallic and bell:** depth of the inharmonic modulators.
- **Amplitude modulation** depth (`AMP_MOD_DEPTH` in the engine; used by Motion).
- **Reed and string:** whether the odd harmonics and the saws read as such.
- **Wooden:** the knock (the pitch blip and the fast modulators).

## Names (2026-10-25)

Names come from the sound, not the pins: a wild or mutated voice often doesn't sound like its pins any more.
`src/generator/naming.ts` renders a held C4 once (16 kHz, 2.5 s) and reads a noun for the shape and an adjective
for the most striking trait, in the DX7's 10 characters. `tools/names.ts` prints them with the traits behind them.

| Noun | When |
|---|---|
| Hit / Noise | spectral flatness over 0.2, short (≤ 0.6 s) or not |
| Pluck | gone to −20 dB within 1 s |
| Bell / Gong | fades over seconds and is inharmonic (Gong when low) |
| Keys | fades over seconds, harmonic |
| Swell | held, slow start (over 0.4 s) and still 3 dB louder at the end |
| Bass | held, the note below 140 Hz (C4 with the voice's transpose), attack under 0.3 s |
| Pad | held, attack 0.08 s or more |
| Sine | held, brightness under 1.1, steady, no noise |
| Organ / Lead | held, quick: Organ when three carriers or more sound with hardly any modulation |

Adjectives, the first that applies: Noisy (flatness over 0.02), Wobbly or Wavy (the LFO swings the pitch more than
0.4 semitone), Metal or Clang (inharmonic: periodicity under 0.9, or a sounding operator at a non-whole ratio or a
fixed frequency, noise sources aside), Airy (any noise: flatness over 10⁻⁵; clean tones measure 10⁻⁹ or less),
Hollow or Reedy (odd harmonics, the even ones under 12 %), Bright or Shiny (centroid over 4× the note), Soft (under
1.15×), Drift (a slow pitch envelope), Wide (carriers detuned 10 steps or more apart). A bell isn't called metal,
noise isn't called noisy. A name already in the session gets a number ("Airy Pad 2", or "Keys 2" when the whole
name and a number don't fit). Naming costs about 30 ms, so it is skipped while a control is dragged.
