// How it works: a sheet over the app (Help in the top bar, the ? key, or #help in the address). The wheel is
// explained on a small drawing of itself; the rest is plain text: where to start, the three ways on, the controls,
// what the browser's sound is and isn't, the two volcas, the files.
import { useEffect, useRef, type CSSProperties } from 'react'
import { angleOf, TONALITY_HUES } from '../generator/choices'
import { FIELD } from './Wheel'

const SECTIONS = [
  ['wheel', 'The wheel'], ['start', 'Starting points'], ['ways', 'Three ways on'], ['voice', 'Your voice'],
  ['shaping', 'Shaping'], ['listening', 'Listening'], ['volca', 'Your volca'], ['files', 'Files'], ['keys', 'Keys'],
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
          This makes single FM voices for the Korg volca fm2 and volca fm by where they live, not by their parameters:
          put pins on a wheel of tonalities, shape the result with a few controls, listen in the browser or on the volca,
          and keep what you like. Every voice is a standard DX7 voice.
        </p>
        <nav className="help-nav" aria-label="Help sections">
          {SECTIONS.map(([id, label]) => <button key={id} onClick={() => go(id)}>{label}</button>)}
        </nav>

        <section id="help-wheel">
          <h3>The wheel</h3>
          <HelpWheel />
          <dl className="help-wheel-list">
            <dt>Around the wheel</dt><dd>which tonality: Noise, Metal, Bell, Glass, Tine, Wood, Organ, Sine, Reed, Brass, String, Breath. Between two names a pin is a bit of both.</dd>
            <dt>Out from the centre</dt><dd>how far it goes: mild near the middle, extreme at the rim.</dd>
            <dt>The ring around a pin</dt><dd>its weight. Turn it, scroll on the pin, or use its slider under the wheel.</dd>
            <dt>The diamond</dt><dd>the instrument you started from. Click it to choose another, drag it off to remove it.</dd>
            <dt>The centre</dt><dd>a new voice, and the name of the one you hear.</dd>
          </dl>
          <p>
            Click the wheel to place a pin, up to three. The heaviest is the voice's base, the others colour it. Drag a pin to
            move it, off the wheel (or × in its row) to remove it. A selected pin moves with the arrow keys; + and − set its
            weight.
          </p>
          <p>
            Rest the pointer anywhere on the wheel and a label says what a click there would do; on a tonality's name, what
            it sounds like.
          </p>
        </section>

        <section id="help-start">
          <h3>Starting points</h3>
          <p>
            <strong>Start from…</strong>, over the wheel, offers 41 instruments in nine groups: keys, plucked, mallets, bass, winds, brass,
            strings, percussion and voices. Most are Yamaha's own DX7 voices (the ROM and VRC cartridges, the TX7 and TX816
            sets), copied operator by operator; the pianos change between a few of them with each new roll. The instrument
            shows as a diamond on the wheel. It isn't a pin: it doesn't change the sound, and pins you add colour it.
          </p>
          <p><strong>Init voice</strong>, at the top of the same menu (or I), is a plain sine with everything turned down, to build up from.</p>
        </section>

        <section id="help-ways">
          <h3>Three ways on</h3>
          <p>Variation and Mutate are at the top of Your voice, New voice over the wheel.</p>
          <dl className="help-defs">
            <dt>Variation <kbd>V</kbd></dt><dd>A small step. The same pins, controls and instrument; the details move: envelopes, levels, tuning. A sibling of the voice.</dd>
            <dt>Mutate <kbd>M</kbd></dt><dd>A medium step. The pins wander around the wheel and in or out, the controls get a push, a pin may come or go. An instrument without pins gets its first one.</dd>
            <dt>New voice <kbd>Enter</kbd></dt><dd>A fresh start: new pins anywhere, the controls back to their defaults, no instrument. Register, Wild and the effects stay as you set them. The wheel's centre does the same.</dd>
          </dl>
        </section>

        <section id="help-voice">
          <h3>Your voice</h3>
          <p>The panel under the controls shows the voice you hear and what you can do with it.</p>
          <dl className="help-defs">
            <dt>Its name</dt><dd>Given by how it sounds ("Airy Pad", "Clang Keys") or by the instrument you started from. Click it to give the voice a name of your own, up to 10 characters as on the DX7; empty it for the automatic one again. Your name stays through your changes until a new start, and goes with the voice to the volca and into files.</dd>
            <dt>The line below</dt><dd>What it's made of: its base and the tonalities colouring it.</dd>
            <dt>The algorithm</dt><dd>How its six operators are wired, as the DX7 draws it: the bottom row is heard, the ones above shape the sound of the one below.</dd>
            <dt>The operators</dt><dd>Each one's frequency ratio, level and envelope; heard or shapes says which kind it is. Coloured by the tonality each belongs to.</dd>
            <dt>Export .syx</dt><dd>Saves the voice you hear as a DX7 file.</dd>
          </dl>
          <p>
            At the top of the panel, beside Variation and Mutate: <strong>Keep</strong> (<kbd>Q</kbd>) puts the voice, with
            its pins and controls, in your kept voices (Kept, click to take it out again), and <strong>Undo</strong> and
            <strong> Redo</strong> (<kbd>⌘Z</kbd>, <kbd>⇧⌘Z</kbd>) go back and forth through this session.
          </p>
          <p>
            Below it, <strong>Recent changes</strong> lists the last steps by what they changed; click one to go back to
            it. <strong>Kept</strong> lists the voices you kept: click one to bring it back with its pins and controls,
            double-click its name to rename it, .syx to export it, × to remove it.
          </p>
        </section>

        <section id="help-shaping">
          <h3>Shaping the sound</h3>
          <dl className="help-defs">
            <dt>Envelope</dt><dd>The voice's own, or Pluck, Struck, Bowed, Pad, Swell, Gate, Reverse. Length makes it shorter or longer.</dd>
            <dt>Brightness</dt><dd>Mellow to bright: how deep the modulation goes.</dd>
            <dt>Complexity</dt><dd>How many of the six operators sound: two when pure, all six and denser past the middle.</dd>
            <dt>Motion</dt><dd>Vibrato, shimmer and drifting brightness; past the middle, wobbles, random steps and pitch drift.</dd>
            <dt>Wild</dt><dd>How far a voice may stray from its tonalities' usual sound: odd ratios, other feedback, near the top another algorithm.</dd>
            <dt>Register</dt><dd>The voice's own octave, or sub, bass, mid, lead or high.</dd>
            <dt>Velocity</dt><dd>How much harder notes play brighter and louder. It starts at the voice's own (marked own) and moves all operators together.</dd>
            <dt>Pitch accent</dt><dd>A short fall in pitch into every note.</dd>
            <dt>Chorus, Reverb</dt><dd>On the fm2 they set the volca's own effect depths (switch the effects on at the volca). The fm's chorus is a button on the volca; here it is a chorus for the browser's sound only.</dd>
          </dl>
          <p>A double-click puts a slider back where it started.</p>
        </section>

        <section id="help-listening">
          <h3>Listening</h3>
          <p>
            <strong>Browser</strong>, <strong>Volca</strong> or <strong>Both</strong> in the top bar choose where a note
            sounds. Play the keyboard at the bottom (softer at the top of a key, harder at the front), or the computer keys
            A to ; with Z and X for the octave. With Play on change (beside the keyboard), every change plays the last note you played.
          </p>
          <p className="help-note">
            The browser's sound is an emulation, not the volca. It runs the DX7 engine of the open-source MSFA project, the
            one Dexed is built on, and was tuned against an fm2, so it comes close. But the volca has its own converters,
            output stage and effects, the fm plays three notes at once and the fm2 six, and the fm ignores velocity. Judge a
            voice on the volca; Both plays the two together.
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
            Choose the model in the top bar. To connect, use Chrome or Edge (Safari has no Web MIDI) and a MIDI interface
            into the volca's MIDI IN; press Connect the volca, allow MIDI access when the browser asks, then pick the MIDI
            out and the volca's channel. The dot beside them turns green while notes go to the volca (Volca or Both).
          </p>
          <p>
            A voice sent to the volca replaces the sound of the program it's on until you pick another program. To keep it
            there, write it on the volca: <strong>Store on the volca…</strong> walks you through it. The volcas send
            nothing back, so this app can't read voices from them or confirm a write.
          </p>
        </section>

        <section id="help-files">
          <h3>Files</h3>
          <p>
            Kept voices stay in this browser. Each one exports as a single-voice <code>.syx</code> (its .syx button), and
            <strong> Export as cartridge</strong> writes the first 32 as one DX7 bank. Both are standard DX7 SysEx: Dexed,
            a DX7, a TX802 and other DX7-compatible synths load them. <strong>Export .syx</strong> beside the voice's name saves the voice you hear, under its name.
            <strong> Import .syx</strong> reads single voices and 32-voice banks into your kept voices.
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
            Everything happens in your browser: the sound, the voices, the files. There are no accounts, no cookies, no
            analytics or tracking, and nothing is loaded from other sites. The generator only sends MIDI to the volca you
            choose; it reads nothing back. What it remembers (your pins and controls, your kept voices, the sound
            settings) stays in this browser’s storage, and clearing the site’s data deletes it. The page is hosted on
            GitHub Pages, which logs your IP address when you open it. The full statement:{' '}
            <a href="privacy.html" target="_blank" rel="noreferrer">Privacy</a>.
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
