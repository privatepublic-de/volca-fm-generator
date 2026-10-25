// The session's history and the kept favourites (PLAN §6.1). A click plays a voice again; favourites are kept in
// this browser, can be renamed, and go out as .syx (one voice, or up to 32 as a cartridge Dexed loads).
import { useRef, useState } from 'react'
import { vcedMessage, vmemMessage } from '../dx7/sysex'
import type { Voice } from '../dx7/voice'
import { audition, useApp, type Entry } from './store'

export function download(name: string, bytes: Uint8Array) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const fileName = (name: string) => `${name.trim().replace(/[^\w-]+/g, '-') || 'voice'}.syx`
/** A single voice with the DX7 checksum: the volcas and Dexed take it. */
export const exportVoice = (v: Voice, name: string) => download(fileName(name), vcedMessage(v, { tail: 'checksum' }))

function Tile({ e, current }: { e: Entry; current: boolean }) {
  const recall = useApp((s) => s.recall)
  return (
    <button className={`tile${current ? ' current' : ''}`} style={{ '--h': e.hue } as React.CSSProperties}
      onClick={() => { recall(e); audition() }} title={e.name}>
      {e.name}
    </button>
  )
}

export function History() {
  const history = useApp((s) => s.history)
  const currentId = useApp((s) => s.currentId)
  if (!history.length) return null
  return (
    <section className="history" aria-label="This session's voices">
      <h3>This session</h3>
      <div className="tiles">
        {[...history].reverse().map((e) => <Tile key={e.id} e={e} current={e.id === currentId} />)}
      </div>
    </section>
  )
}

export function Favourites() {
  const favourites = useApp((s) => s.favourites)
  const voice = useApp((s) => s.voice)
  const { recall, unkeep, rename, importFile } = useApp.getState()
  const [editing, setEditing] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const isCurrent = (e: Entry) => e.voice.every((b, i) => b === voice[i])

  return (
    <section className="favourites" aria-label="Kept voices">
      <div className="fav-head">
        <h3>Kept</h3>
        <div className="fav-actions">
          <button onClick={() => file.current?.click()}>Import .syx</button>
          <button disabled={!favourites.length} onClick={() => download('volca-fm-kept.syx', vmemMessage(favourites.slice(0, 32).map((f) => f.voice)))}
            title="The first 32 as one cartridge, as Dexed loads it">Export as cartridge</button>
          <input ref={file} type="file" accept=".syx,application/octet-stream" hidden onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) setMessage(importFile(new Uint8Array(await f.arrayBuffer()), f.name))
            e.target.value = ''
          }} />
        </div>
      </div>
      {message && <p className="fav-message">{message}</p>}
      {!favourites.length && <p className="fav-empty">Keep a voice you like (Keep, or Q) and it waits here, in this browser.</p>}
      <ul className="fav-list">
        {favourites.map((f) => (
          <li key={f.id} className={isCurrent(f) ? 'current' : ''} style={{ '--h': f.hue } as React.CSSProperties}>
            <span className="fav-swatch" />
            {editing === f.id
              ? <input className="fav-rename" autoFocus defaultValue={f.name} maxLength={10} aria-label="Name (10 characters)"
                  onBlur={(e) => { rename(f.id, e.target.value); setEditing(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null) }} />
              : <button className="fav-name" onClick={() => { recall(f); audition() }} onDoubleClick={() => setEditing(f.id)} title="Click to play, double-click to rename">{f.name}</button>}
            <button className="fav-small" onClick={() => exportVoice(f.voice, f.name)} title="Export this voice (.syx)">.syx</button>
            <button className="fav-small" onClick={() => unkeep(f.id)} aria-label={`Remove ${f.name}`} title="Remove">×</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
