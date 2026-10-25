# What the volcas do over MIDI, as tested

Answers to the open questions of [PLAN.md §3](../PLAN.md), from the probe (`npm run probe`, /probe.html) on a real
volca fm and volca fm2. Each answer carries its date and the firmware it was tested on.

| # | Question | volca fm | volca fm2 |
|---|---|---|---|
| Q1 | Voice form: operator bits or checksum in byte 155, byte count, device number | | **2026-10-25, firmware not noted:** the 163-byte form lands with operator bits `3f` *and* with the DX7 checksum in byte 155. Without byte 155 (162 B), with count `01 1C`, or with device n = MIDI ch − 1 (8, the volca on ch 9) nothing lands. So: count `01 1B`, device 0, any MIDI channel. Byte 155 seems ignored: as operator bits, PROBE PURE's checksum `5d` would turn OP1 off, yet it sounded (Q7 checks). |
| Q2 | Where a voice lands, how it is stored | | |
| Q3 | DX7 parameter changes | later | **From experience, not probed:** Dexed edits the fm2 completely, so it takes parameter changes. |
| Q4 | Send timing, cut notes, back-to-back sends | | |
| Q5 | Voice parameters ignored or played differently | later (velocity: Korg's document says it isn't used) | **From experience, not probed:** all of them, as in Dexed. |
| Q6 | Connections and MIDI settings | | |
| Q7 | Operator bit order, loudness against Dexed | | |
| Q8 | CCs, and whether a voice send resets them | **From Korg's MIDI implementation (rev. 1.01, 2016):** CCs 40–50 only (transpose, velocity, modulator/carrier attack and decay, LFO rate and pitch depth, algorithm, arpeggiator); no chorus CC: the chorus is a button | **From Korg's MIDI implementation (rev. 1.00, 2022-11-17), not probed:** the same CCs 40–50 plus **91 reverb depth** and **93 chorus depth** (0–127), with *MIDI Short Message* on. Chorus and reverb on/off are switches in the sequence data, not CCs: they're switched on at the volca |
