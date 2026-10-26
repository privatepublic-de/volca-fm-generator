# volca fm generator

**Make FM voices for the Korg volca fm2 and volca fm by how they should sound, not by their parameters.**
Put pins on a wheel of twelve tonalities, shape the result with a handful of controls, hear it in the browser or
on the volca, and keep what you like. Every voice is a standard DX7 voice.

**[Open the generator →](https://privatepublic-de.github.io/volca-fm-generator/)** Chrome, Edge or Firefox,
nothing to install.

![The generator: the tonality wheel with two pins on the left and the bar of their weights under it, the
envelope, tone, playing and effect controls on the right, the voice it made below them with its algorithm and six
operators, and the keyboard along the bottom](docs/screenshot.png)

## The idea

A DX7 voice has 155 parameters, and most of them only make sense together. The generator turns that around:
you say where a sound lives (*a bell, a bit of glass, quite extreme*) and it builds the operators, ratios,
envelopes and feedback that get there. Then you nudge, vary, mutate or start over until something catches your
ear, and send it to the volca.

| | |
|---|---|
| **The wheel** | Twelve tonalities around a circle: Noise, Metal, Bell, Glass, Tine, Wood, Organ, Sine, Reed, Brass, String, Breath. Up to three pins: the angle picks the tonality (between two names, a bit of both), the distance from the centre goes from mild to extreme, the ring around a pin is its weight. The bar under the wheel shows each pin's part of the whole; drag the edge between two parts to move weight from one to the other. The heaviest pin is the base; weights count against each other, so a pin that seems to do nothing needs more weight against the base (or the base less), then more distance from the centre. |
| **Start from…** | 41 classic DX7 instruments as a base, parameter for parameter: grand and upright pianos, e-piano, harpsichord, clavinet, guitars, harp, koto, sitar, mallets, basses, winds, a brass section, strings, drums, choirs. Mostly Yamaha's own factory voices. Pins colour them. |
| **Three ways on** | **Variation** moves the details of the voice you hear. **Mutate** moves the pins and the controls. **New voice** rolls the wheel afresh. Undo and redo through every step. |
| **Shaping** | Envelope (the voice's own, or pluck, struck, bowed, pad, swell, gate, reverse) and length; brightness, complexity, motion; wild; register; velocity; pitch accent; chorus and reverb. |
| **Your voice** | The algorithm as the DX7 draws it, the six operators with their ratios, levels and envelopes, and a name from how it sounds ("Airy Pad", "Clang Keys"), or one of your own. |
| **Hearing it** | A DX7 engine in the browser, tuned against a volca fm2, with a keyboard and the computer keys to play. Or straight on the volca over Web MIDI, or both at once. A change is heard from the next note on: a held note keeps the voice it started with. |
| **Keeping it** | Keep voices in the browser, export one as a `.syx` file or 32 as a DX7 cartridge for Dexed, a DX7 or anything DX7-compatible. |
| **Cartridges** | Open a DX7 cartridge (`.syx`) and see its 32 voices by name; click one to hear it in the browser or on the volca, use it, keep the ones you like. |

The help inside the app (**Help**, or `?`) explains every part.

## Your volca

| | volca fm2 | volca fm |
|---|---|---|
| Voices sent and played | Yes, tested | Yes, in first tests |
| Velocity | Yes | No: every note alike |
| Chorus and reverb depth from the generator | Yes, with *MIDI Short Message* on | No: the chorus is a button |
| Notes at once | 6 | 3 |

1. Connect a MIDI interface to the volca's MIDI IN.
2. Open the generator in Chrome, Edge or Firefox (Safari has no Web MIDI), choose the model, press **Connect the
   volca** and allow MIDI access. Firefox first offers a small *site permission add-on* for the page: that's how it
   grants MIDI with SysEx. Add it; it covers this page only and can be removed under Add-ons and themes.
3. Pick the MIDI out and the volca's channel, then **Volca** or **Both**.

A voice sent to the volca replaces the sound of the program it's on until you choose another program. To keep it,
write it on the volca itself: **Store on the volca…** walks you through it. The volcas send nothing back, so the
generator can't read their voices.

**The browser's sound is an emulation.** It comes close, but the volca has its own converters, output stage and
effects. Judge a voice on the volca.

## Privacy

Everything runs in your browser. No accounts, no cookies, no analytics or tracking, nothing loaded from other
sites; the generator only sends MIDI, it never reads it. What it remembers stays in your browser's storage. GitHub
Pages, the host, logs your IP address when you open the page. The full statement:
[privacy.html](https://privatepublic-de.github.io/volca-fm-generator/privacy.html)
([source](public/privacy.html)).

## How it was made

This generator is vibe-coded with [Claude](https://claude.com/claude-code) by Anthropic: Peter Witzel designed it
and tested it on a volca fm2 and a volca fm, Claude wrote the code. Every commit says so in a
`Co-Authored-By: Claude` line.

- [PLAN.md](PLAN.md): the plan and its phases.
- [docs/SOUND.md](docs/SOUND.md): how the engine was calibrated, what the generator makes and why, the
  instruments, names and controls, as measured.
- [docs/FINDINGS.md](docs/FINDINGS.md): what the volcas take over MIDI, as tested.

## Development

```sh
npm install
npm run dev          # the generator at http://localhost:5186
npm test             # engine, generator, store and SysEx tests
npm run build        # the static site in dist/
```

`npm run dev` also serves the development pages: `/probe.html` (the MIDI protocol probe), `/engine.html` (the
engine against test voices) and `/generator.html` (the generator lab).

Tools, run with `npx vite-node tools/<name>.ts`:

- `instruments.ts`: every instrument measured (attack, decay, brightness, noise, pitch, loudness).
- `compare-library.ts`: every instrument beside the classic patches of its name in a DX7 library (Dexed's
  cartridge folder by default).
- `recipe-from-voice.ts`: turns library voices into instrument recipes, operator by operator.
- `find-voices.ts`, `dump-voices.ts`: search a library by name; print a voice's parameters and traits.
- `calibrate.ts`, `survey.ts`, `names.ts`, `noise-steps.ts`: the measurements behind docs/SOUND.md.

`.github/workflows/pages.yml` tests, builds and publishes the generator with GitHub Pages on every push to `main`.

## Credits

- **Sound engine:** the DX7's tables, envelopes and algorithm routing follow
  [MSFA](https://github.com/google/music-synthesizer-for-android) (music-synthesizer-for-android, © Google,
  Apache License 2.0), the engine [Dexed](https://github.com/asb2m10/dexed) is built on.
- **Instruments:** classic DX7 voices by Yamaha (DX7 ROM and VRC cartridges, TX7, TX816, DX7II) and two pianos
  of unknown authorship from the cartridge collection that comes with Dexed.
- **The volcas:** Korg's MIDI implementation documents for the volca fm and volca fm2.
- **Type:** [Barlow](https://github.com/jpt/barlow) by Jeremy Tribby, SIL Open Font License.
- **Code:** [React](https://react.dev), [Zustand](https://github.com/pmndrs/zustand), [Vite](https://vite.dev),
  [Vitest](https://vitest.dev), [TypeScript](https://www.typescriptlang.org).

Details and licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Korg and volca are trademarks of Korg Inc.; Yamaha and DX7 are trademarks of Yamaha Corporation. This generator
is not affiliated with or endorsed by Korg or Yamaha.

[MIT License](LICENSE).
