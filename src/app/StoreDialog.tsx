// Keeping a voice on the volca (PLAN §1): the volca plays what it's sent but keeps it only when it is written
// there, from its own panel. The app can't see the volca (no MIDI out), so it guides and doesn't check.
import { useEffect, useRef } from 'react'
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

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="store-title">
      <h2 id="store-title">Store {voiceName(voice)} on the {model === 'fm' ? 'volca fm' : 'volca fm2'}</h2>
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
    </dialog>
  )
}
