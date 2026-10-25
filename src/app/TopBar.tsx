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
        {ready ? (
          <>
            <select value={out ?? ''} onChange={(e) => set({ port: e.target.value })} aria-label="MIDI out to the volca">
              <option value="" disabled>MIDI out…</option>
              {playback.outputs.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <label className="channel" title="The volca's MIDI channel">ch
              <input type="number" min={1} max={16} value={s.channel} onChange={(e) => set({ channel: Math.max(1, Math.min(16, Number(e.target.value) || 1)) })} />
            </label>
          </>
        ) : (
          <button onClick={async () => { setProblem((await playback.connect()) ?? ''); refresh((n) => n + 1) }} title="Needs Chrome or Edge and a MIDI interface into the volca's MIDI IN">Connect the volca</button>
        )}
        {problem ? <span className="topbar-problem">{problem}</span> : status && <span className={`topbar-status${out && s.target !== 'browser' ? ' live' : ''}`} title={statusTitle}>{status}</span>}
      </div>
      <div className="topbar-group">
        {!audioOn && s.target !== 'volca' && <span className="topbar-hint">Click or press a key for sound</span>}
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
          <span>Volume</span>
          <input type="range" min={0} max={6} step={0.1} value={s.volume}
            style={{ '--fill': `${(s.volume / 6) * 100}%` } as React.CSSProperties}
            onChange={(e) => set({ volume: Number(e.target.value) })} />
        </label>
        <button onClick={onStore} title="How to keep this voice in the volca's memory">Store on the volca…</button>
        <button className="topbar-help" onClick={onHelp} title="How it works (?)">Help</button>
      </div>
    </header>
  )
}
