// Where the sound goes: the model, the MIDI out and channel, browser / volca / both, the volume.
import { useEffect, useState } from 'react'
import type { Model } from '../engine/models'
import { playback, useApp } from './store'
import type { Target } from '../ui/playback'

export function TopBar({ onStore, onHelp, audioOn }: { onStore: () => void; onHelp: () => void; audioOn: boolean }) {
  const model = useApp((s) => s.model)
  const setModel = useApp((s) => s.setModel)
  const [, refresh] = useState(0)
  const [problem, setProblem] = useState('')
  const s = playback.settings
  useEffect(() => { playback.onPorts = () => refresh((n) => n + 1) }, [])
  const set = (patch: Parameters<typeof playback.set>[0]) => { playback.set(patch); refresh((n) => n + 1) }
  const ready = playback.midiReady
  const out = playback.outputName
  const modelName = model === 'fm' ? 'volca fm' : 'volca fm2'
  // where the sound goes: the model and the port are in the selects next to it, so only what they don't say
  const status = !ready ? null
    : !playback.outputs.length ? 'No MIDI outputs: plug in the interface'
    : !out ? 'Choose the volca\'s MIDI out'
    : s.target === 'browser' ? 'Volca or Both sends to it'
    : `Sending, channel ${s.channel}`
  const statusTitle = out ? `${s.target === 'browser' ? 'Not sending yet' : 'Sending'} to the ${modelName} via ${out}, MIDI channel ${s.channel}` : undefined

  return (
    <header className="topbar">
      <h1 className="brand">volca fm generator</h1>
      <div className="topbar-group">
        <label>
          <span className="sr-only">Model</span>
          <select value={model} onChange={(e) => setModel(e.target.value as Model)} aria-label="Model">
            <option value="fm2">volca fm2</option>
            <option value="fm">volca fm</option>
          </select>
        </label>
        {/* one slot, as wide connected as not, so connecting doesn't move the bar */}
        <div className="topbar-connection">
          {ready ? (
            <>
              <select value={out ?? ''} onChange={(e) => set({ port: e.target.value })} aria-label="MIDI out to the volca" title={out ?? undefined}>
                <option value="" disabled>{playback.outputs.length ? 'MIDI out…' : 'No MIDI outputs'}</option>
                {playback.outputs.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <label className="channel" title="The volca's MIDI channel">ch
                <input type="number" min={1} max={16} value={s.channel} onChange={(e) => set({ channel: Math.max(1, Math.min(16, Number(e.target.value) || 1)) })} />
              </label>
              <span className={`topbar-dot${out && s.target !== 'browser' ? ' live' : ''}`} role="status"
                title={status ? `${status}${statusTitle ? ` (${statusTitle})` : ''}` : undefined} aria-label={status ?? undefined} />
            </>
          ) : (
            <button onClick={async () => { setProblem((await playback.connect()) ?? ''); refresh((n) => n + 1) }} title="Needs Chrome, Edge or Firefox and a MIDI interface into the volca's MIDI IN">Connect the volca</button>
          )}
        </div>
      </div>
      <div className="topbar-group">
        <div className="segmented small" role="radiogroup" aria-label="Play on">
          {(['browser', 'volca', 'both'] as Target[]).map((t) => (
            <button key={t} role="radio" aria-checked={s.target === t} className={s.target === t ? 'on' : ''}
              disabled={t !== 'browser' && !out} onClick={() => set({ target: t })}
              title={t !== 'browser' && !out ? 'Connect the volca first' : undefined}>
              {t === 'browser' ? 'Browser' : t === 'volca' ? 'Volca' : 'Both'}
            </button>
          ))}
        </div>
        <label className="volume" title="Volume of the browser's sound">
          <span className="sr-only">Volume</span>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
            <path d="M11.5 5.5a3.5 3.5 0 0 1 0 5M13 3.5a6 6 0 0 1 0 9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input type="range" min={0} max={6} step={0.1} value={s.volume}
            style={{ '--fill': `${(s.volume / 6) * 100}%` } as React.CSSProperties}
            onChange={(e) => set({ volume: Number(e.target.value) })} />
        </label>
        <button onClick={onStore} title="How to keep this voice in the volca's memory">Store on the volca…</button>
        <button className="topbar-help" onClick={onHelp} title="How it works (?)">Help</button>
      </div>
      {/* notes under the bar, so they take no room in it */}
      {problem
        ? <p className="topbar-note problem">{problem}</p>
        : !audioOn && s.target !== 'volca' && <p className="topbar-note">Click or press a key for sound</p>}
    </header>
  )
}
