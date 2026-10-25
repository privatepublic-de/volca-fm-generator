# Third-party notices

volca fm generator is MIT-licensed (see [LICENSE](LICENSE)). It builds on the work below.

## MSFA (music-synthesizer-for-android)

The sound engine's DX7 tables, envelope, pitch envelope, LFO and scaling formulas (`src/engine/tables.ts`,
`src/engine/synth.ts`) and the algorithm routing table (`src/dx7/algorithms.ts`) follow MSFA's `env.cc`,
`dx7note.cc`, `pitchenv.cc`, `lfo.cc` and `fm_core.cc`, translated to TypeScript.

> Copyright 2012–2013 Google Inc.
>
> Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in
> compliance with the License. You may obtain a copy of the License at
> https://www.apache.org/licenses/LICENSE-2.0
>
> Unless required by applicable law or agreed to in writing, software distributed under the License is
> distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See
> the License for the specific language governing permissions and limitations under the License.

Source: https://github.com/google/music-synthesizer-for-android. The translation's changes are described in the
files' own comments (per-sample floats instead of 64-sample integer blocks, an amplitude-modulation model of its
own, the feedback loops of algorithms 4 and 6).

## Classic DX7 voices

The instruments in **Start from…** (`src/generator/instruments.ts`) reproduce the parameters of classic DX7 voices,
each named with its source in a comment: Yamaha's factory voices (DX7 ROM cartridges 1–4, the VRC-101, VRC-102,
VRC-103 and VRC-1001 cartridges, the TX7, TX816, DX7II/DX7IIFD sets) and two pianos, GOOD PIANO and PianoBo 7\,
from cartridges of unknown authorship in the collection distributed with [Dexed](https://github.com/asb2m10/dexed).
The voices are the work of their makers; Yamaha and DX7 are trademarks of Yamaha Corporation.

## Barlow

The typefaces Barlow and Barlow Condensed by Jeremy Tribby, served with the app through
[Fontsource](https://fontsource.org) (`@fontsource/barlow`, `@fontsource/barlow-condensed`).
Licensed under the SIL Open Font License, Version 1.1: https://openfontlicense.org. Source:
https://github.com/jpt/barlow.

## Libraries

- [React](https://react.dev) and React DOM, MIT License, © Meta Platforms, Inc. and affiliates.
- [Zustand](https://github.com/pmndrs/zustand), MIT License, © Paul Henschel.

Built with [Vite](https://vite.dev) (MIT), [Vitest](https://vitest.dev) (MIT) and
[TypeScript](https://www.typescriptlang.org) (Apache License 2.0); these are not part of the published app.

## Korg

What the volca fm and volca fm2 take over MIDI comes from Korg's MIDI implementation documents for the two
instruments and from tests on the devices ([docs/FINDINGS.md](docs/FINDINGS.md)). Korg and volca are trademarks of
Korg Inc. This project is not affiliated with or endorsed by Korg or Yamaha.
