// The cartridge window: a .syx file's voices by name (a DX7 cartridge's 32, or any number of single voices). A click
// plays one, in the browser or on the volca, without putting it on stage; the ticked ones go to the kept voices.
// Closing it, the voice on stage plays again.
import { useEffect, useRef, useState } from 'react'
import { VC, voiceName } from '../dx7/voice'
import type { Target } from '../ui/playback'
import { playback, useApp } from './store'

export function CartBrowser({ onKept }: { onKept: (message: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const cart = useApp((s) => s.cart)
  const { closeCart, keepFromCart } = useApp.getState()
  const [picked, setPicked] = useState<number[]>([])
  const [hearing, setHearing] = useState<number | null>(null)
  const [, refresh] = useState(0)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    const d = ref.current!
    if (cart && !d.open) { d.showModal(); setPicked([]); setHearing(null) }
    if (!cart && d.open) d.close()
  }, [cart])

  const hear = (i: number) => {
    if (!cart) return
    playback.setVoice(cart.voices[i].voice)
    setHearing(i)
    // a click here asks to hear it, whether or not play-on-change is on (after the volca's debounced send)
    setTimeout(() => playback.audition(), 140)
  }
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))
  // ↑ ↓ (and ← → across the columns) go on to the next voice and play it, from anywhere in the window
  const step = (e: React.KeyboardEvent) => {
    const by = { ArrowDown: 1, ArrowUp: -1, ArrowRight: rows, ArrowLeft: -rows }[e.key]
    if (!by || !cart) return
    e.preventDefault()
    const i = Math.max(0, Math.min(cart.voices.length - 1, (hearing ?? -by) + by))
    ref.current?.querySelectorAll<HTMLButtonElement>('.cart-voice button')[i]?.focus()
    hear(i)
  }

  const s = playback.settings
  const out = playback.outputName
  const setTarget = (target: Target) => {
    playback.set({ target })
    // the top bar draws the same choice: tell it
    playback.onPorts()
    refresh((n) => n + 1)
  }
  // two columns, filled downwards as the DX7 numbers its cartridge (1–16, 17–32)
  const rows = Math.ceil((cart?.voices.length ?? 0) / 2)
  const all = cart ? cart.voices.map((_, i) => i) : []
  const allPicked = cart !== null && picked.length === cart.voices.length

  return (
    <dialog ref={ref} className="dialog cart" onKeyDown={step} onClose={() => { if (useApp.getState().cart) closeCart() }} aria-labelledby="cart-title">
      <div className="cart-head">
        <h2 id="cart-title">{cart?.file ?? 'Cartridge'}</h2>
        <span className="cart-count">{cart?.voices.length} voice{cart?.voices.length === 1 ? '' : 's'}</span>
      </div>
      <div className="cart-hear">
        <span>Hear them on</span>
        <div className="segmented small" role="radiogroup" aria-label="Hear them on">
          {(['browser', 'volca', 'both'] as Target[]).map((t) => (
            <button key={t} role="radio" aria-checked={s.target === t} className={s.target === t ? 'on' : ''}
              disabled={t !== 'browser' && !out} onClick={() => setTarget(t)}
              title={t !== 'browser' && !out ? 'Connect the volca first' : undefined}>
              {t === 'browser' ? 'Browser' : t === 'volca' ? 'Volca' : 'Both'}
            </button>
          ))}
        </div>
        {!playback.midiReady && (
          <button onClick={async () => { setProblem((await playback.connect()) ?? ''); refresh((n) => n + 1) }}>Connect the volca</button>
        )}
        {playback.midiReady && !out && <span className="dialog-note">Choose the volca's MIDI out in the top bar.</span>}
      </div>
      {problem && <p className="dialog-note">{problem}</p>}
      <p className="dialog-note">
        Click a voice to hear it, or play it on the keys; ↑ and ↓ go through them. It plays in the program the volca is
        on until you close this. Tick the ones to keep.
      </p>
      {cart && (
        <ul className="cart-list" style={{ '--rows': rows } as React.CSSProperties}>
          {cart.voices.map((v, i) => (
            <li key={i} className={`cart-voice${hearing === i ? ' on' : ''}`}>
              <input type="checkbox" checked={picked.includes(i)} onChange={() => toggle(i)} aria-label={`Keep ${voiceName(v.voice)}`} />
              <button onClick={() => hear(i)} title={`Hear it (${v.source})`} aria-current={hearing === i ? 'true' : undefined}>
                <span className="cart-num">{i + 1}</span>
                <span className="cart-name">{voiceName(v.voice)}</span>
                <span className="cart-alg" title={`Algorithm ${v.voice[VC.algorithm] + 1}`}>A{v.voice[VC.algorithm] + 1}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {cart?.notes.length ? <p className="dialog-note cart-notes" title={cart.notes.join('\n')}>The file: {cart.notes.join('; ')}.</p> : null}
      <div className="dialog-actions">
        <button className="cart-all" onClick={() => setPicked(allPicked ? [] : all)}>{allPicked ? 'Tick none' : 'Tick all'}</button>
        <button onClick={closeCart} title="Back to your voice (Escape)">Close</button>
        <button className="primary" disabled={!picked.length} onClick={() => { onKept(keepFromCart(picked)); closeCart() }}
          title="Keeps the ticked voices in this browser; your voice comes back">
          {picked.length ? `Keep ${picked.length}` : 'Keep'}
        </button>
      </div>
    </dialog>
  )
}
