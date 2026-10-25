// Two octaves to play the voice: soft at the top of a key, hard at the front. The computer keys play too:
// A W S E D F T G Y H U J K O L P ; from C4, Z and X an octave down and up.
import { useEffect, useState } from 'react'
import { playback } from './store'

const FIRST = 48
const KEYS = 29
const BLACK = [1, 3, 6, 8, 10]
const MAP = 'awsedftgyhujkolp;'

export function Keyboard() {
  const [held, setHeld] = useState<ReadonlySet<number>>(new Set())
  const [octave, setOctave] = useState(0)

  useEffect(() => {
    playback.onNotes = (h) => setHeld(new Set(h))
    let oct = 0
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      return ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && (el as HTMLInputElement).type !== 'range' && (el as HTMLInputElement).type !== 'checkbox'
    }
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e)) return
      if (e.key === 'z') { oct = Math.max(-3, oct - 1); setOctave(oct); return }
      if (e.key === 'x') { oct = Math.min(3, oct + 1); setOctave(oct); return }
      const i = MAP.indexOf(e.key)
      if (i >= 0) void playback.noteOn(60 + 12 * oct + i, 100)
    }
    const up = (e: KeyboardEvent) => {
      const i = MAP.indexOf(e.key)
      // the note may have started in another octave: release every note this key could have played
      if (i >= 0) for (let o = -3; o <= 3; o++) playback.noteOff(60 + 12 * o + i)
    }
    const blur = () => playback.allNotesOff()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
  }, [])

  const whites = Array.from({ length: KEYS }, (_, i) => FIRST + i).filter((n) => !BLACK.includes(n % 12))
  const w = 100 / whites.length
  let wi = 0
  const keys = Array.from({ length: KEYS }, (_, i) => {
    const n = FIRST + i
    const black = BLACK.includes(n % 12)
    const left = black ? wi * w - w * 0.3 : wi * w
    if (!black) wi++
    return { n, black, left, width: black ? w * 0.6 : w }
  })
  const computerFirst = 60 + 12 * octave

  return (
    <div className="keyboard" aria-label="Keyboard">
      {keys.map((k) => (
        <div
          key={k.n}
          className={`key ${k.black ? 'black' : 'white'}${held.has(k.n) ? ' down' : ''}${k.n >= computerFirst && k.n < computerFirst + MAP.length ? ' mapped' : ''}`}
          style={{ left: `${k.left}%`, width: `${k.width}%` }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            const r = e.currentTarget.getBoundingClientRect()
            void playback.noteOn(k.n, Math.max(1, Math.min(127, Math.round(((e.clientY - r.top) / r.height) * 127))))
          }}
          onPointerUp={() => playback.noteOff(k.n)}
          onPointerCancel={() => playback.noteOff(k.n)}
        >
          {k.n % 12 === 0 && <span className="key-label">C{k.n / 12 - 1}</span>}
        </div>
      ))}
    </div>
  )
}
