// How it works: a sheet over the app (Help in the top bar, the ? key, or #help in the address). The wheel is
// explained on a small drawing of itself; the rest is short plain text: where to start, the three ways on, the voice,
// the controls, what the browser's sound is and isn't, the two volcas, the files, and last the details (for those
// who dare).
import { useEffect, useRef, type CSSProperties } from 'react'
import { angleOf, TONALITY_HUES } from '../generator/choices'
import { FIELD } from './Wheel'

const SECTIONS = [
  ['wheel', 'The wheel'], ['start', 'Starting points'], ['ways', 'Three ways on'], ['voice', 'Your voice'],
  ['shaping', 'Shaping'], ['listening', 'Listening'], ['volca', 'Your volca'], ['files', 'Files'], ['details', 'Details'], ['keys', 'Keys'],
  ['privacy', 'Privacy'], ['credits', 'Credits'],
] as const

export function Help({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current!
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const go = (id: string) => ref.current?.querySelector(`#help-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <dialog ref={ref} className="help" onClose={onClose} aria-labelledby="help-title"
      // a click on the backdrop (the dialog itself, outside the sheet) closes it
      onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <div className="help-sheet">
        <header className="help-head">
          <h2 id="help-title">How it works</h2>
          <button className="help-close" onClick={onClose} aria-label="Close help">×</button>
        </header>
        <p className="help-lead">
          Single FM voices for the Korg volca fm2 and volca fm, made by sound, not by parameters. Pins on a wheel, a few
          controls, listen in the browser or on the volca, keep what you like. Every voice is a standard DX7 voice.
        </p>
        <nav className="help-nav" aria-label="Help sections">
          {SECTIONS.map(([id, label]) => <button key={id} onClick={() => go(id)}>{label}</button>)}
        </nav>

        <section id="help-wheel">
          <h3>The wheel</h3>
          <HelpWheel />
          <dl className="help-wheel-list">
            <dt>Around the wheel</dt><dd>Which tonality: Noise, Metal, Bell, Glass, Tine, Wood, Organ, Sine, Reed, Brass, String, Breath. Between two names: a bit of both.</dd>
            <dt>Out from the centre</dt><dd>How far: mild in the middle, extreme at the rim.</dd>
            <dt>The ring around a pin</dt><dd>Its weight. Turn it, scroll on the pin, or drag the edges in the bar below the wheel.</dd>
            <dt>The diamond</dt><dd>The instrument you started from. Click for another, drag off to remove.</dd>
            <dt>The centre</dt><dd>A new voice, and the name of the one you hear.</dd>
          </dl>
          <p>
            Click the wheel for a pin, up to three. The heaviest is the base, the others colour it. Drag to move, off the
            wheel (or ×) to remove. Arrow keys move a selected pin, + and − set its weight.
          </p>
          <p>
            Light pins, under a quarter of the base's weight, only touch the base. Heavier ones get operators of their own:
            Noise, Tine, Bell and Reed go inside the base's tone first (grit, a struck attack, a ring, hollowness). From
            about 0.6 of its weight, a pin plays as a layer of its own. The base may switch algorithm to make room.
          </p>
          <p>
            <strong>A pin that does nothing?</strong> Too light against the base. Weights count against each other: raise
            its weight or lower the base's. Then move it outwards. In line with a name, a pin is that tonality alone;
            between two names, it shares.
          </p>
          <p>Hover the wheel: a label says what a click would do. On a name: what it sounds like.</p>
        </section>

        <section id="help-start">
          <h3>Starting points</h3>
          <p>
            <strong>Start from…</strong>, over the wheel: 41 instruments in nine groups. Keys, plucked, mallets, bass,
            winds, brass, strings, percussion, voices. Mostly Yamaha's own DX7 voices (ROM and VRC cartridges, TX7, TX816),
            copied operator by operator. The instrument shows as a diamond on the wheel. Not a pin: pins you add colour it.
          </p>
          <p>
            Grand and upright piano come in several originals; dots beside their names count them. Pick again for the
            next. Under the wheel, the dots show which one plays; click them for the next.
          </p>
          <p><strong>Init voice</strong>, top of the same menu (or I): a plain sine, everything down. Build up from there.</p>
        </section>

        <section id="help-ways">
          <h3>Three ways on</h3>
          <p>Variation and Mutate: top of Your voice. New voice: over the wheel.</p>
          <dl className="help-defs">
            <dt>Variation <kbd>V</kbd></dt><dd>Small step. Same pins, controls and instrument; envelopes, levels and tuning move. A sibling.</dd>
            <dt>Mutate <kbd>M</kbd></dt><dd>Medium step. Pins wander, controls get a push, a pin may come or go. An instrument without pins gets its first.</dd>
            <dt>New voice <kbd>Enter</kbd></dt><dd>Fresh start. New pins, controls at their defaults, no instrument. Register, Wild and the effects stay. The wheel's centre does the same.</dd>
          </dl>
        </section>

        <section id="help-voice">
          <h3>Your voice</h3>
          <p>The panel under the controls: the voice you hear, and what to do with it.</p>
          <dl className="help-defs">
            <dt>Its name</dt><dd>From how it sounds ("Airy Pad", "Clang Keys") or from the instrument. Click to name it yourself: 10 characters, as on the DX7. Empty it for the automatic one. Your name stays until a new start and goes with the voice to the volca and into files.</dd>
            <dt>The line below</dt><dd>What it's made of: the base and the tonalities colouring it.</dd>
            <dt>The algorithm</dt><dd>How the six operators are wired, drawn as on the DX7. Bottom row: heard. Above: shaping the one below.</dd>
            <dt>The operators</dt><dd>Frequency ratio, level, envelope. Heard or shapes says which kind. Coloured by their tonality.</dd>
            <dt>Export .syx</dt><dd>The voice you hear, as a DX7 file.</dd>
            <dt>Details…</dt><dd>Every parameter, for those who dare. See Details, further down.</dd>
          </dl>
          <p>
            Top of the panel: <strong>Keep</strong> (<kbd>Q</kbd>) files the voice with its pins and controls; click Kept
            to take it out again. <strong>Undo</strong> and <strong>Redo</strong> (<kbd>⌘Z</kbd>, <kbd>⇧⌘Z</kbd>) step
            through the session.
          </p>
          <p>
            Below: <strong>Recent changes</strong>, the last steps by what they changed. Click one to go back.
            <strong> Kept</strong>, your kept voices. Click to bring one back with its pins and controls, double-click its
            name to rename, .syx to export, × to remove.
          </p>
        </section>

        <section id="help-shaping">
          <h3>Shaping the sound</h3>
          <dl className="help-defs">
            <dt>Envelope</dt><dd>The voice's own, or Pluck, Struck, Bowed, Pad, Swell, Gate, Reverse. Length: shorter or longer. Own also lights up for envelopes changed in Details.</dd>
            <dt>Brightness</dt><dd>Mellow to bright: how deep the modulation goes.</dd>
            <dt>Complexity</dt><dd>How many operators sound: two when pure, all six and denser past the middle.</dd>
            <dt>Motion</dt><dd>Vibrato, shimmer, drifting brightness. Past the middle: wobbles, random steps, pitch drift.</dd>
            <dt>Wild</dt><dd>How far a voice strays from its tonalities: odd ratios, other feedback, near the top another algorithm.</dd>
            <dt>Register</dt><dd>The voice's own octave, or sub, bass, mid, lead, high.</dd>
            <dt>Velocity</dt><dd>How much harder notes play brighter and louder. Starts at the voice's own (marked own); moves all operators together.</dd>
            <dt>Pitch accent</dt><dd>A short pitch fall into every note.</dd>
            <dt>Chorus, Reverb</dt><dd>fm2: the volca's own effect depths (switch the effects on at the volca). fm: its chorus is a button, so here it's a chorus for the browser only.</dd>
          </dl>
          <p>Double-click a slider to reset it.</p>
        </section>

        <section id="help-listening">
          <h3>Listening</h3>
          <p>
            <strong>Browser</strong>, <strong>Volca</strong> or <strong>Both</strong>, in the top bar: where notes sound.
            Play the keyboard at the bottom (top of a key softer, front harder) or the computer keys A to ;, Z and X for
            the octave. Play on change, beside the keyboard, replays your last note after every change.
          </p>
          <p>
            Changes count from the next note: a sounding note keeps the voice it started with. Moving a pin or a control?
            Play a new note, or leave Play on change on.
          </p>
          <p className="help-note">
            The browser's sound is an emulation. It runs MSFA's DX7 engine, the one inside Dexed, tuned against an fm2:
            close, not the same. The volca has its own converters, output stage and effects. The fm plays three notes, the
            fm2 six; the fm ignores velocity. Judge on the volca; Both plays the two together.
          </p>
        </section>

        <section id="help-volca">
          <h3>Your volca</h3>
          <table className="help-table">
            <thead><tr><th /><th>volca fm2</th><th>volca fm</th></tr></thead>
            <tbody>
              <tr><th>Voices sent and played</th><td>Yes, tested</td><td>Yes, in first tests</td></tr>
              <tr><th>Velocity</th><td>Yes</td><td>No: every note alike</td></tr>
              <tr><th>Chorus and reverb depth from here</th><td>Yes, with MIDI Short Message on</td><td>No: the chorus is a button</td></tr>
              <tr><th>Notes at once</th><td>6</td><td>3</td></tr>
            </tbody>
          </table>
          <p>
            Choose the model in the top bar. You need Chrome, Edge or Firefox (Safari has no Web MIDI) and a MIDI
            interface into the volca's MIDI IN. Press Connect the volca, allow MIDI access, pick the MIDI out and the
            volca's channel. The dot turns green while notes go out (Volca or Both).
          </p>
          <p>
            <strong>Firefox:</strong> on the first connect, with the interface plugged in, it offers a small site
            permission add-on for this page: its way of allowing MIDI with SysEx. Add it, then allow access. This page
            only; remove it under Add-ons and themes.
          </p>
          <p>
            A voice sent to the volca replaces the current program's sound until you switch programs. To keep it, store
            it on the volca: <strong>Store on the volca…</strong> walks you through. The volcas send nothing back: no
            reading voices, no confirming a write.
          </p>
        </section>

        <section id="help-files">
          <h3>Files</h3>
          <p>
            Kept voices live in this browser. Each exports as a single-voice <code>.syx</code> (its .syx button);
            <strong> Export as cartridge</strong> writes the first 32 as one DX7 bank. Standard DX7 SysEx: Dexed, a DX7, a
            TX802 and other DX7-compatibles load them. <strong>Export .syx</strong> beside the name saves the voice you hear.
          </p>
          <p>
            <strong>Open .syx…</strong> opens a DX7 cartridge, or a file of single voices, in its own window. Click a voice
            to hear it in the browser, on the volca or both; ↑ and ↓ step through, the keys play. <strong>Use</strong> puts
            it on stage (⌘Z undoes) on an empty wheel, controls at their defaults: the generator didn't make it, so a pin or
            a control starts a new voice from there. Tick the ones you like and <strong>Keep</strong> them. Close the
            window, and your voice plays again.
          </p>
        </section>

        <section id="help-details">
          <h3>Details</h3>
          <p>
            For those who dare. <strong>Details…</strong>, top of Your voice, swaps the controls for every parameter of
            the voice. The wheel stays. Made for last touches: a softer attack, less feedback, one operator detuned.
            <strong> Done</strong> brings the controls back.
          </p>
          <dl className="help-defs">
            <dt>The operators</dt><dd>Click one on the algorithm, or its tab. Its parameters come grouped as on the volca's Parameter List card: Envelope, Frequency, Level, Level scale. Below: the whole voice's pitch envelope, LFO and transpose. Under the algorithm: algorithm, feedback, osc key sync.</dd>
            <dt>The red names</dt><dd>The volca's display names in EDIT mode (EGr1, LSbP, FdbK…), to find them on the volca. Knob: the volca has a knob for it.</dd>
            <dt>A value</dt><dd>Drag up or down, scroll, or the arrow keys (⇧ for steps of ten). Envelope points drag too. Level scale shows the keyboard, the break point and each side's curve.</dd>
          </dl>
          <p>
            Heard at once. Let go, and it's a step in Recent changes ("OP2 rate 1 ↓"); ⌘Z takes it back. Edits stay
            through pins and controls until a new start: New voice, Variation, Mutate, an instrument, Init voice.
            <strong> Clear edits</strong> gives the voice as the wheel and the controls make it. An edited envelope shows
            Own; pick a shape to replace it. A voice from a file has no wheel under it: its parameters change as they are.
          </p>
        </section>

        <section id="help-keys">
          <h3>Keys</h3>
          <table className="help-keys">
            <tbody>
              <tr><td><kbd>Enter</kbd></td><td>New voice</td><td><kbd>A</kbd> … <kbd>;</kbd></td><td>Play</td></tr>
              <tr><td><kbd>V</kbd></td><td>Variation</td><td><kbd>Z</kbd> <kbd>X</kbd></td><td>Octave down, up</td></tr>
              <tr><td><kbd>M</kbd></td><td>Mutate</td><td><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd></td><td>Move the selected pin</td></tr>
              <tr><td><kbd>I</kbd></td><td>Init voice</td><td><kbd>+</kbd> <kbd>−</kbd></td><td>Its weight</td></tr>
              <tr><td><kbd>Q</kbd></td><td>Keep</td><td><kbd>Delete</kbd></td><td>Remove it</td></tr>
              <tr><td><kbd>⌘Z</kbd> <kbd>⇧⌘Z</kbd></td><td>Undo, redo</td><td><kbd>?</kbd></td><td>This help</td></tr>
            </tbody>
          </table>
        </section>

        <section id="help-privacy">
          <h3>Privacy</h3>
          <p>
            Everything runs in your browser: sound, voices, files. No accounts, no cookies, no analytics or tracking,
            nothing loaded from other sites. The generator only sends MIDI to the volca you choose and reads nothing back.
            What it remembers (pins, controls, kept voices, sound settings) stays in this browser's storage; clearing the
            site's data deletes it. GitHub Pages, the host, logs your IP address when you open the page. The full
            statement:{' '}<a href="privacy.html" target="_blank" rel="noreferrer">Privacy</a>.
          </p>
        </section>

        <section id="help-credits">
          <h3>Credits</h3>
          <dl className="help-defs">
            <dt>Sound engine</dt><dd>The DX7’s tables, envelopes and algorithm routing follow <a href="https://github.com/google/music-synthesizer-for-android" target="_blank" rel="noreferrer">MSFA</a> (music-synthesizer-for-android, © Google, Apache License 2.0), the engine <a href="https://asb2m10.github.io/dexed/" target="_blank" rel="noreferrer">Dexed</a> is built on.</dd>
            <dt>Instruments</dt><dd>The Start from instruments are classic DX7 voices, parameter for parameter: Yamaha’s own (the DX7 ROM and VRC cartridges, TX7, TX816 and DX7II sets) and two pianos from the cartridge collection that comes with Dexed, their authors unknown.</dd>
            <dt>The volcas</dt><dd>What the volcas take over MIDI comes from Korg’s MIDI implementation documents and from tests on a volca fm2 and a volca fm.</dd>
            <dt>Type</dt><dd><a href="https://github.com/jpt/barlow" target="_blank" rel="noreferrer">Barlow</a> by Jeremy Tribby (SIL Open Font License), served from this site.</dd>
            <dt>Code</dt><dd>React, Zustand, Vite and TypeScript. Made with <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">Claude</a> by Anthropic: Peter Witzel designed it and tested it on the volcas, Claude wrote the code.</dd>
          </dl>
          <p className="help-small">
            Korg and volca are trademarks of Korg Inc.; Yamaha and DX7 are trademarks of Yamaha Corporation. This
            generator is not affiliated with or endorsed by either. MIT License;{' '}
            <a href="https://github.com/privatepublic-de/volca-fm-generator" target="_blank" rel="noreferrer">source on GitHub</a>.
          </p>
        </section>
      </div>
    </dialog>
  )
}

/** The wheel, small, with what each part does beside it. */
function HelpWheel() {
  const c = { x: 320, y: 140 }
  const R = 112
  const at = (angle: number, r: number) => {
    const a = (angle * Math.PI) / 180
    return { x: c.x + r * Math.sin(a), y: c.y - r * Math.cos(a) }
  }
  const pinAngle = angleOf('string')
  const pin = at(pinAngle, R * 0.72)
  const ring = 20
  const weight = 0.6
  const knob = { x: pin.x + ring * Math.sin(weight * 2 * Math.PI), y: pin.y - ring * Math.cos(weight * 2 * Math.PI) }
  const diamond = at(angleOf('tine'), R * 0.55)
  const rimFrom = at(22, R + 12)
  const rimTo = at(68, R + 12)
  const radialFrom = at(pinAngle, 32)
  const radialTo = at(pinAngle, R - 4)
  return (
    <div className="help-wheel" style={{ '--field': FIELD } as CSSProperties} aria-hidden="true">
      <div className="help-wheel-field" style={{ left: `${((c.x - R) / 640) * 100}%`, top: `${((c.y - R) / 280) * 100}%`, width: `${((2 * R) / 640) * 100}%`, height: `${((2 * R) / 280) * 100}%` }} />
      <svg viewBox="0 0 640 280">
        <defs>
          <marker id="help-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L8 4 L0 8 z" fill="currentColor" />
          </marker>
        </defs>
        {/* around: along the rim */}
        <path className="help-guide" d={`M${rimFrom.x} ${rimFrom.y} A${R + 12} ${R + 12} 0 0 1 ${rimTo.x} ${rimTo.y}`} markerEnd="url(#help-arrow)" />
        {/* out: from the centre to the rim, through the pin */}
        <line className="help-guide dashed" x1={radialFrom.x} y1={radialFrom.y} x2={radialTo.x} y2={radialTo.y} markerEnd="url(#help-arrow)" />
        <circle className="help-centre" cx={c.x} cy={c.y} r={26} />
        <text className="help-centre-text" x={c.x} y={c.y + 4}>Pluck</text>
        {/* the pin and its ring */}
        <circle className="help-ring" cx={pin.x} cy={pin.y} r={ring} />
        <path className="help-ring-arc" d={`M${pin.x} ${pin.y - ring} A${ring} ${ring} 0 ${weight > 0.5 ? 1 : 0} 1 ${knob.x} ${knob.y}`} />
        <circle className="help-knob" cx={knob.x} cy={knob.y} r={3.5} />
        <circle className="help-pin" cx={pin.x} cy={pin.y} r={11} style={{ fill: `hsl(${TONALITY_HUES.string} 85% 64%)` }} />
        <g transform={`translate(${diamond.x} ${diamond.y}) rotate(45)`}>
          <rect className="help-diamond-ring" x={-10} y={-10} width={20} height={20} rx={3} />
          <rect className="help-diamond" x={-5.5} y={-5.5} width={11} height={11} rx={2} style={{ fill: `hsl(${TONALITY_HUES.tine} 85% 64%)` }} />
        </g>
        {/* the labels: the pin's on the left, the rest on the right */}
        <Callout from={at(pinAngle, R + 4)} to={{ x: 170, y: 46 }} side="left" title="Out from the centre" text="mild to extreme" />
        <Callout from={{ x: pin.x - ring - 2, y: pin.y + 4 }} to={{ x: 170, y: 118 }} side="left" title="The ring" text="its weight: turn it" />
        <Callout from={{ x: pin.x - 4, y: pin.y + 10 }} to={{ x: 170, y: 190 }} side="left" title="A pin" text="drag to move, off to remove" />
        <Callout from={at(45, R + 14)} to={{ x: 470, y: 40 }} side="right" title="Around the wheel" text="which tonality" />
        <Callout from={{ x: c.x + 27, y: c.y }} to={{ x: 470, y: 128 }} side="right" title="The centre" text="a new voice" />
        <Callout from={{ x: diamond.x + 12, y: diamond.y + 2 }} to={{ x: 470, y: 206 }} side="right" title="The diamond" text="the instrument you started from" />
      </svg>
    </div>
  )
}

function Callout({ from, to, side, title, text }: { from: { x: number; y: number }; to: { x: number; y: number }; side: 'left' | 'right'; title: string; text: string }) {
  const anchor = side === 'left' ? 'end' : 'start'
  const tx = side === 'left' ? to.x - 8 : to.x + 8
  return (
    <g className="help-callout">
      <polyline points={`${from.x},${from.y} ${to.x},${to.y}`} />
      <circle cx={from.x} cy={from.y} r={2} />
      <text x={tx} y={to.y - 2} textAnchor={anchor} className="help-callout-title">{title}</text>
      <text x={tx} y={to.y + 15} textAnchor={anchor} className="help-callout-text">{text}</text>
    </g>
  )
}
