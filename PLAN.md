# volca FM Generator: Plan

A browser app that **generates** FM voices by style for the Korg volca fm and volca fm2 and sends them over Web MIDI. It is not an editor: you mix tonalities on a colour wheel (for example 60 % bell, 40 % warm), shape the result with a few broad controls, and hear it at once in the browser and on the volca. Every voice is a 6-operator DX7 voice, so the same file also works in Dexed or a DX7.

Decisions so far (2026-10-25):

| Question | Decision |
|---|---|
| Hardware | **volca fm and volca fm2**, with a model switch; where they differ, data-driven from day one |
| Preview | **A 6-operator FM engine in the browser** (Web Audio), next to the volca |
| Wheel | **Pins with weights**: drop 1–3 pins on the wheel and mix them |
| Controls next to the wheel | **Envelope shape**, **brightness and complexity**, **motion**, **register and play** |
| Output | **Single voices** (no bank building in the UI) |
| Keeping | **Session history + favourites** in the browser, export a single voice as `.syx` |
| Look | **Dark, with the wheel as a glowing colour field**; a sibling to the editors |

---

## 0. Prior art (read 2026-10-25)

Facts only; **no code is copied** (Dexed is GPL, volcako has its own license).

| Project | What we learn |
|---|---|
| **reface-dx-editor** `src/style/` (ours, MIT) | The generator's structure: a family **skeleton** (algorithm, ratios, levels), then an **envelope shape**, then **characters** as weighted transforms in a fixed order, then brightness, length, motion, effects, then **ensure audible** and **name**. All pure: (choices, seed) → voice. Modulator level sets depth steeply (~50 a touch, ~65 clearly, ~75 strong, 85+ very bright, docs/SOUND.md there; that's the reface's 0–127 scale, to be measured again on the DX7's 0–99). Templates as data, tuned by ear. Code to copy and adapt: `style/random.ts`, transport, controls, the history and library stores, launchers, Pages workflow. |
| [Korg volca fm MIDI Implementation](http://www.korg.com/us/support/download/manual/0/558/2963/) (rev 1.01, 2016) | **No MIDI out** ("not equipped with a MIDI Out jack"). SysEx: `F0 43 0n 00 01 1B` + 1 voice (format 0, the DX7 VCED) or `F0 43 0n 09 20 00` + 32 voices (format 9, VMEM). In the 1-voice table, byte **155 = operator on/off bits** (B5…B0) in the place where the DX7 has the checksum. **Note velocity is not used.** No parameter-change SysEx is listed. CCs (only with *MIDI RX Short Message* on): 41 velocity, 42/43 modulator attack/decay, 44/45 carrier attack/decay, 46 LFO rate, 47 LFO pitch depth, 48 algorithm, 49/50 arpeggiator. |
| [Luomu/volcako](https://github.com/Luomu/volcako) (desktop editor, volca fm) | Sends the whole 1-voice message on every edit (no delays in `sysex.cpp`; its call sites not read); the voice lands in the selected slot's edit state and **must be stored on the volca (Edit → Write)**. Listens on any channel. Its "DX7 compatibility mode" puts the DX7 checksum in byte 155 and "will sound wrong on volca fm, may work on fm2". Not tested on the fm2. |
| volca fm firmware ([Max for Live editor page](https://cycling74.com/projects/korg-volca-fm-editor-max4live-midi-device), unverified) | The official firmware is 1.07; an unofficial 1.09 adds DX7 parameter changes (used by Dexed and Max for Live editors). We target the official firmware and don't rely on parameter changes. |
| MSFA / music-synthesizer-for-android (Apache 2.0) | The permissive reference for the DX7 engine: operator output level table (0–99 → amplitude), EG rate/level model, the 32 algorithm routings with feedback, LFO, pitch EG, keyboard rate and level scaling. Read for facts and tables; the engine is written here, with tests. |
| Dexed (GPL) | Cross-check by ear only: a voice from the generator should sound the same in Dexed, the browser engine and the volca. |

---

## 1. Setup facts that shape the design

| Fact | Consequence |
|---|---|
| **No MIDI out** (fm: documented; fm2: expected, Q6). | No connect check, no read-back, no following the panel. Connect = pick an output port (and a channel for notes). The browser engine is the only confirmation of what was sent. Needs a USB-MIDI interface into the volca's 5-pin MIDI IN (fm2: confirm in Q6). |
| A voice is one **163-byte 1-voice SysEx** (6 header + 155 data + byte 155 + `F7`), any channel. | One message per audition (~52 ms over DIN). |
| **The fm2 is fully editable from Dexed** (experience, 2026-10-25), so it takes the whole voice and DX7 parameter changes; the volca fm (stock firmware) only whole voices. | On the fm2 the controls can change a sounding voice live with parameter changes; a new voice is a whole-voice send, which probably **cuts sounding notes** (Q4), so the loop for new voices is generate → send (debounced) → play a note. The fm gets whole voices only. |
| The voice goes into the edit state of the selected slot; **storing is Edit → Write on the volca** (fm; fm2: Q2). | A "Store on the volca" helper explains the steps, as the reface's guided STORE does, but there is no read-back to confirm it. |
| Byte 155 means operator on/off (fm), checksum (DX7). | The codec writes it per model; the `.syx` export offers "volca" or "DX7/Dexed". |
| **fm ignores velocity** (stock). fm has 3 voices, fm2 6 (Q5 for fm2's velocity). | The generator's velocity response is only offered on models that use it; the browser engine copies the model (voices, velocity on/off) so the preview doesn't promise more than the volca plays. |
| The fm takes CCs for modulator/carrier attack and decay (42–45), LFO rate and pitch depth (46/47) and algorithm (48). | A possible live path: Envelope and Motion could move a sounding voice on the fm without a resend (Q8). |
| Notes and CCs need *MIDI RX Short Message* on (fm). | The connection help says so; the audition notes go to the chosen channel. |
| Web MIDI SysEx needs a secure context and permission; Chrome or Edge. | As the siblings: localhost dev server, `start/` launchers, GitHub Pages. Port **5186** (5179–5185 are taken by the siblings). |

---

## 2. Protocol reference

1-voice (DX7 VCED), as the volca fm's MIDI Implementation lists it:

```
F0 43 0n 00 01 1B   <155 bytes voice data>   <byte 155>   F7
```

| Bytes | Content (per operator, OP6 first, 21 bytes each: 0–125) |
|---|---|
| 0–3 / 4–7 | EG rates 1–4 / EG levels 1–4 |
| 8–12 | Break point, left/right depth, left/right curve |
| 13 | Rate scaling |
| 14 / 15 | Amp mod sensitivity / key velocity sensitivity |
| 16 | Output level |
| 17–20 | Osc mode, freq coarse, freq fine, detune |
| 126–133 | Pitch EG rates 1–4, levels 1–4 |
| 134 / 135 / 136 | Algorithm (0–31) / feedback (0–7) / osc key sync |
| 137–142 | LFO speed, delay, PMD, AMD, sync, wave |
| 143 / 144 | Pitch mod sensitivity / transpose (24 = C3) |
| 145–154 | Name, 10 ASCII |
| 155 | volca: operator on/off bits B5…B0 (order assumed as the DX7's parameter 155, Q1/Q7). DX7: checksum |

The count field says 155 but the volca message carries 156 bytes (Q1). The 32-voice VMEM (format 9, 4096 bytes packed) is in the codec for `.syx` import only: a bank file can be opened and its voices used as seeds.

---

## 3. Open questions

A probe page (`/probe.html`, as in the siblings) sends test voices and notes; results go to `docs/FINDINGS.md` with date and firmware. **Probing is kept light (2026-10-25):** Q1 is answered for the fm2; the fm2 is taken as fully DX7-compatible because Dexed edits it completely, which settles Q3 and Q5 for it until something sounds wrong. The rest is answered as it comes up while building (Q4 in Phase 1), and the volca fm's questions are probed later, when its model profile is built.

| # | Question | Why it matters |
|---|---|---|
| Q1 | Does each model take the 163-byte message with operator bits in byte 155? Does the fm2 also take a DX7 checksum there (the DX7 compatibility mode)? Byte count `01 1B` as written? | The codec's last byte per model |
| Q2 | Where does a voice land on the fm2 (edit state of the current program?), and how is it stored (fm2 has 64 programs)? | The store helper |
| Q3 | Does the fm2 take DX7 parameter-change SysEx (`F0 43 1n …`) on stock firmware? | If yes, the controls could change a sounding voice live on the fm2 |
| Q4 | Does a voice send cut sounding notes? How soon after the send does a note sound right? Two sends back to back: any lost? | Debounce and send pacing |
| Q5 | Does the fm2 use velocity? Which voice parameters does each model ignore or treat differently (velocity sensitivity, rate/level scaling, LFO, pitch EG, osc key sync, transpose)? volcako's comments say LFO speed and PMD aren't sent, while Korg's table has them. | The generator must not lean on what the target ignores; the engine copies the model |
| Q6 | fm2 connections: MIDI IN only, or USB-MIDI too? Channel and Short Message settings? | Connection help |
| Q7 | Do the fm's operator on/off bits work, and does the volca keep voice levels as a DX7 does (loudness comparable to Dexed)? | Loudness matching between the generator, the engine and the volca |
| Q8 | Do the fm's CCs 42–48 act on the voice just sent, and does the next voice send reset them? Does either model take a voice-mode (mono/poly) or portamento CC (the fm's list has none)? | Live tweaking on the fm; whether Play can offer mono and portamento |

---

## 4. The generator

### 4.1 The wheel: tonalities

Twelve tonalities on the rim, ordered so that **neighbours sound close**: harmonic and soft at the bottom, buzzing and bright on the right, inharmonic and noisy at the top, clean and high on the left. The hue of each sector is its colour in the whole UI.

```
                 Noise
         Breath           Metallic
    String                     Bell
  Brass                          Glass
    Reed                       Tine
         Warm              Wooden
                 Organ
```

| Tonality | Sound | Skeleton (algorithms, roles) |
|---|---|---|
| Warm | Round, few harmonics: soft pad, sine bass, flute body | 1:1 stacks, low modulator levels, little feedback (algorithms 5, 16) |
| Reed | Hollow, odd harmonics: clarinet, square-ish | 2:1 / 3:1 modulators, feedback on a 1:1 operator (algorithms 2, 7) |
| Brass | Bright saw-like with a swell in brightness | 1:1 carrier with a modulator whose EG rises with the note (algorithms 18, 22) |
| String | Saw-like, detuned pairs, slow bow | Parallel stacks detuned against each other, feedback for the saw (algorithms 1, 15, 3) |
| Breath | Tone with air: wind, sax, pan flute | A tone stack plus a high-ratio, high-feedback "noise" modulator with a fast EG (algorithms 3, 22) |
| Noise | Noise as the sound: hiss, wind, cymbal, sweeps | High feedback, fixed or very high non-integer ratios, stacked modulation (algorithms 6, 32) |
| Metallic | Dense inharmonic: gong, plate, ring mod | Non-integer ratios (1.41, 3.5, 7.07…), several modulators deep (algorithms 9, 16, 25) |
| Bell | Sparse inharmonic, long decay: tubular bell, church bell | 1:3.5, 1:1.4 pairs, slow carrier decay, faster modulators (algorithms 5, 6, 23) |
| Glass | Clean high partials: glass harp, celesta, digital chime | High integer ratios (5, 7, 14) at low level, fixed partials (algorithms 5, 21) |
| Tine | E-piano, vibraphone: a tine attack over a soft body | The DX7 e-piano layout: a fast high-ratio transient pair + a 1:1 body pair (algorithm 5) |
| Wooden | Short, knocky: marimba, wood block, kalimba | Low-ratio body, fast-decaying high modulators, short EGs (algorithms 7, 14) |
| Organ | Additive, drawbars, steady | Up to six carriers at harmonic ratios (0.5, 1, 2, 3, 4, 8) (algorithm 32, or 19/25 with a little key click) |

The table is the starting point: tonalities, algorithms and numbers are data in `templates.ts`, tuned by ear and recorded in `docs/SOUND.md` (as in the reface).

### 4.2 What mixing pins means

FM parameters don't blend: averaging the ratios or algorithms of a bell and a warm pad gives mud, not 60/40. So the mix is **skeleton + transforms**, the reface's model extended:

1. **The heaviest pin chooses the skeleton**: algorithm, operator roles, ratios, basic levels, its typical envelope. Two pins at the same weight: the seed decides.
2. **Every other pin acts as a transform with its weight as the amount**, on the operator roles of that skeleton. Each tonality defines both: its skeleton, and its transform when it's a secondary pin. Examples: *Metallic* detunes modulator ratios to non-integers and deepens them; *Breath* repurposes a free operator (or the weakest modulator) as a noise source with a fast EG; *Warm* lowers modulator levels and feedback and softens attacks; *Bell* makes carrier decays longer and adds an inharmonic pair; *String* detunes stacks against each other and slows the attack.
3. **Six operators leave room**: a secondary pin may take over a free branch of the algorithm (for example a 2-operator stack in algorithm 5 or 22), so 60 % bell + 40 % warm can literally be a bell stack plus a warm stack, balanced by their carrier levels. Each skeleton marks which branches are free for this.
4. **Proposal: distance from the centre is intensity**: near the centre a pin is a mild version of its tonality, at the rim an extreme one (deeper modulation, more inharmonic, more noise).

A pin dropped between two sectors belongs to both in proportion; that's how neighbours on the rim blend smoothly.

### 4.3 The controls next to the wheel

| Control | Choices | What it changes |
|---|---|---|
| **Envelope shape** | Pluck, struck, bowed, pad, swell, gate, reverse; plus **length** (short … long) | Carrier EGs; modulator EGs follow with the shape's own offset (brightness decays faster than loudness on a pluck, rises with the note on a swell) |
| **Brightness** | Mellow … bright | Modulator output levels, feedback, keyboard level scaling (tamer up the keyboard when bright) |
| **Complexity** | Pure … dense | How many operators sound (2 … 6: unused ones get output level 0, byte 155 stays all on, so the volca, the engine and a DX7 export play the same), how deep the stacks are, how many secondary branches are used |
| **Motion** | Still … alive | LFO (rate, delay, PMD/AMD), detune shimmer between carriers, modulator EGs that keep moving (L3 ≠ L4, slow R3) |
| **Register** | Sub, bass, mid, lead, high | Transpose, ratio choice (sub: 0.5 carriers), keyboard rate scaling |
| **Play** | Velocity response (models that use it), pitch EG accents | Key velocity sensitivity on modulators, pitch EG blips for plucks and percussion |

Mono/poly and portamento are not part of a DX7 voice; Play offers them only if a model takes them by CC (Q8).

### 4.4 The pipeline

All pure and deterministic: (pins, controls, model, seed) → voice. The same seed and choices give the same voice, so history and favourites store choices + seed + the voice bytes.

1. Skeleton of the dominant pin (with its spread: Generate picks near the template's middle, **Wild** further out).
2. Secondary pins as transforms or branches (§4.2), in a fixed order.
3. Envelope shape and length; then brightness, complexity, motion, register, play.
4. Model fit: drop what the target ignores (Q5), keep levels in the range the volca plays cleanly.
5. **Ensure audible**: at least one carrier sounds within the first 50 ms of a held note at a normal level (rendered with the engine, not guessed).
6. Name: 10 characters from the tonalities and a short word (e.g. `BELL WARM2`).

Actions: **Generate** (new seed, same choices), **Variations** (the same seed family, a little apart), **Mutate** (this voice, nudged), **Lock** an aspect (keep the algorithm and ratios, change only envelopes, for example).

### 4.5 Measured, not guessed

The browser engine renders every template offline in tests, and the measures go into `docs/SOUND.md`: loudness (RMS), brightness (spectral centroid), inharmonicity, noisiness (spectral flatness), attack and decay times. Tests check that each tonality lands where it should (Metallic more inharmonic than Warm, a brighter setting gives a higher centroid, Pluck decays faster than Pad), and that 1000 random choices give no silent and no clipping voices. By-ear tuning on both volcas has the last word.

---

## 5. The browser engine

A 6-operator DX7-style engine in an **AudioWorklet**, written here with tables and models from MSFA as the reference:

- Operators with the DX7 output level curve, ratio/fixed frequency, fine and detune as the DX7 computes them.
- The 4-rate/4-level EG with rate scaling; keyboard level scaling (four curves, break point).
- All 32 algorithms with feedback, as data (`algorithms.ts`), pinned in a test against the DX7 algorithm chart.
- LFO (6 waves, delay, sync, PMD/AMD with sensitivities) and the pitch EG.
- **Model profiles**: voices (fm 3, fm2 6), velocity on or off, whatever Q5 finds.
- Same code path for live play and offline rendering (tests, measures).

Built 2026-10-25 (`src/engine/`, test page `/engine.html`), with three departures from MSFA, all to check by ear: the feedback loops of algorithms 4 and 6 are played (MSFA leaves them out), amplitude modulation is an own estimate (MSFA has none; `AMP_MOD_DEPTH`), and osc key sync is honoured (MSFA always restarts the phase). As in MSFA, feedback 6–7 on an operator at full level turns to noise. Open: a new voice reaches only new notes; when the controls change a sounding voice on the fm2 by parameter changes, the engine's sounding notes must take the change too (rates and levels in place, as MSFA's `Env::setparam`).

It doesn't need to match the volca to the bit; it needs to sound close enough that what you choose in the browser is what the volca plays. Checked by ear against the volcas and Dexed, voice by voice, with a fixed list in `docs/SOUND.md`.

---

## 6. The app

### 6.1 Screen

```
┌ top bar: model (fm / fm2) · MIDI out port · channel · Listen: browser / volca / both · ⓘ ───────────────┐
│                                                                                                         │
│        ╭───────── wheel ─────────╮      Envelope  [pluck][struck][bowed][pad][swell][gate][rev]        │
│       │   glowing colour field    │      Length     ───●────                                            │
│       │   pins with weight rings  │      Brightness ─────●──   Complexity ──●─────                      │
│       │        ● bell 60          │      Motion     ──●─────   Register  [sub][bass][mid][lead][high]   │
│       │   ● warm 40               │      Play       velocity ──●──  pitch accent ○                      │
│        ╰─────────────────────────╯                                                                      │
│      [ Generate ]  [ Variations ]  [ Mutate ]  [ Wild ○ ]  locks: algorithm · ratios · envelopes        │
│                                                                                                         │
│  current voice: name · algorithm drawing · operator mini-view (levels, ratios, EGs) · ☆ · Export .syx   │
│  history strip ◀ ▢ ▢ ▢ ▢ ▢ ▣ ▶        favourites ☆                                                   │
│  keyboard (two octaves, computer keys too) · hold · Store on the volca…                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Wheel**: a canvas colour field; drag a pin in, drag it out to remove it, drag its ring (or scroll) to set its weight; up to three pins. The field glows towards the pins' colours as you mix. A pin snaps to sector centres with Shift held.
- **The voice**, not as an editor: the algorithm drawn as the DX7 draws it, operators coloured by role, small EG curves. Read-only: it shows what was made.
- **History**: every generated voice in the session (with its choices and seed), click to hear it again; **favourites** kept in the browser (localStorage), rename, export as `.syx` (volca or DX7/Dexed byte 155), import a `.syx` (1 voice or a 32-voice bank) to use as a starting point for Mutate.
- **Listen**: browser, volca, or both. A new voice is sent to the volca debounced (Q4) and the last played note is repeated after the send, so a click on the wheel is heard right away.
- **Store on the volca…**: a dialog with the steps for the chosen model (Q2).

### 6.2 Look

Dark background, the wheel as the light source: each tonality's hue carries through the pins, the history tiles and the operator view. Barlow and Barlow Condensed as in the siblings; the same top bar, dialogs and knob gestures.

---

## 7. Architecture

Same stack as the siblings: Vite 6, TypeScript, React 18, zustand, vitest, `@fontsource/barlow`, no backend. Code from the reface is **copied and adapted**, not shared.

```
src/
  midi/        transport.ts (output ports only, hot-plug, persist), send.ts (debounced voice send, notes)
  dx7/
    voice.ts      the 155-byte voice as a typed object, ranges, init voice
    vced.ts       1-voice SysEx per model (byte 155), .syx read/write, VMEM bank unpacking for import
    algorithms.ts the 32 routings: carriers, modulators, branches, feedback
    tables.ts     level curve, EG rate tables, frequency (ratio/fixed/detune)
  engine/
    worklet.ts    the AudioWorklet processor
    synth.ts      voices, operators, EG, LFO, pitch EG (shared by the worklet and offline rendering)
    models.ts     fm / fm2 profiles
    measure.ts    RMS, centroid, inharmonicity, flatness, attack/decay (tests and SOUND.md)
  generator/
    tonalities.ts the twelve: hue, skeletons, transforms, free branches
    controls.ts   the choices (envelope, brightness, complexity, motion, register, play)
    pins.ts       pins → dominant skeleton + weighted secondary transforms
    shapes.ts     envelope shapes
    transforms.ts brightness, complexity, motion, register, play, model fit, ensure audible
    generate.ts   the pipeline, generate / variations / mutate / locks
    random.ts     seeded rng (from the reface)
    name.ts
  library/     history.ts, favourites.ts (localStorage)
  app/         App, TopBar, Wheel, Controls, VoiceView (algorithm + operators), History, Keyboard, StoreDialog, dialogs, controls/
test/          vced round trip + fixtures, algorithms, tables, engine renders, generator determinism, ranges and measures
docs/          FINDINGS.md (probe results), SOUND.md (tuning and measures)
```

---

## 8. Phases

| Phase | Content | Done when |
|---|---|---|
| **0 Probe** | `probe.html`: pick a port, send test voices (operator bits vs checksum, count variants), notes, back-to-back sends; FINDINGS.md | Q1 answered on the fm2 (done); the rest as it comes up, the volca fm later |
| **1 Voice and MIDI** | `dx7/` codec with tests, transport, debounced send, keyboard, a hand-made set of test voices sent to the volca, `.syx` import/export | A voice from Dexed round-trips and plays the same on the volca |
| **2 Engine** | AudioWorklet engine, the 32 algorithms, model profiles, offline rendering and `measure.ts` | The test voices sound close to the volca and Dexed, by ear; the measures run in tests |
| **3 Generator** | Twelve tonalities (single pin first), the controls, the pipeline, ensure audible, names; then secondary pins and branches; SOUND.md | Each tonality recognisable on its own by ear, on both volcas; measure tests pass; random choices (120 in the tests, about 12 ms a voice): none silent, none clipping. Built 2026-10-25 (`src/generator/`, lab page `/generator.html`, docs/SOUND.md); the by-ear check is open |
| **4 App** | The wheel with pins, the controls, voice view, history and favourites, Store dialog, the look | Generating is pleasant on a laptop with a volca attached. Built 2026-10-25 (`src/app/`, React + zustand): the accent follows the sound's dominant tonality; shortcuts Enter, V, M, Q; works down to phone width |
| **5 Ship** | Launchers, GitHub Pages, privacy page, About, README | It runs from a double-click and from the Pages URL |

---

## 9. Not in scope (for now)

- Editing operators by hand (the reface editor's job; here only the generator's controls).
- Building and sending 32-voice banks (the codec can read them for import).
- Sequencer, arpeggiator and other volca performance settings.
- Reading anything from the volcas (they have no MIDI out).
