// Keeping a voice on the volca (PLAN §1): the volca plays what it's sent but keeps it only when it is written
// there, from its own panel. The app can't see the volca (no MIDI out), so it guides and doesn't check.
import { useEffect, useRef, useState } from 'react'
import { voiceName } from '../dx7/voice'
import { playback, useApp } from './store'

export function StoreDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const voice = useApp((s) => s.voice)
  const model = useApp((s) => s.model)
  useEffect(() => {
    const d = ref.current!
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const [, refresh] = useState(0)
  const [problem, setProblem] = useState('')
  const connected = open && playback.outputName !== null
  const modelName = model === 'fm' ? 'volca fm' : 'volca fm2'

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="store-title">
      <h2 id="store-title">Store {voiceName(voice)} on the {modelName}</h2>
      {!connected ? (
        <>
          <p>
            To keep a voice on the volca, the volca has to get it first: connect it, then come back here. The voice goes
            over MIDI, from a MIDI interface into the volca's MIDI IN, in Chrome, Edge or Firefox.
          </p>
          {problem && <p className="dialog-note">{problem}</p>}
          <div className="dialog-actions">
            <button onClick={onClose}>Not now</button>
            <button className="primary" onClick={async () => {
              const why = await playback.connect()
              setProblem(why ?? (playback.outputName ? '' : 'No MIDI out chosen yet: pick the one the volca is on in the top bar.'))
              refresh((n) => n + 1)
            }}>Connect the volca</button>
          </div>
        </>
      ) : (
        <>
          <p>
            The volca now plays this voice in the program it's on, but only until you pick another program: the stored one
            comes back then. To keep it, write it into a program on the volca itself.
          </p>
          <ol>
            <li>On the volca, choose the program to keep it in (its old voice will be replaced). Choosing a program loads
              its stored voice, so send this one after: <button onClick={() => playback.sendToVolca()}>Send to the volca</button></li>
            <li>Write the program with the volca's own write function, as its manual describes.</li>
            <li>Pick another program and come back to check.</li>
          </ol>
          <p className="dialog-note">The volca sends nothing back, so this app can't confirm it. Keeping it here as well (Keep) is the safe way.</p>
          <div className="dialog-actions"><button className="primary" onClick={onClose}>Done</button></div>
        </>
      )}
    </dialog>
  )
}
