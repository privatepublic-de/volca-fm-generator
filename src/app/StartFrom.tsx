// "Start from…": the instruments as starting points, in their groups. Picking one makes it the base of the voice;
// the wheel then colours it.
import { useEffect, useRef } from 'react'
import { TONALITY_HUES } from '../generator/choices'
import { INSTRUMENT_GROUP_LABELS, INSTRUMENT_GROUPS, INSTRUMENT_IDS, instrumentName, INSTRUMENTS } from '../generator/instruments'
import { audition, useApp } from './store'

export function StartFromMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const current = useApp((s) => s.controls.instrument)
  const startFrom = useApp((s) => s.startFrom)
  const initVoice = useApp((s) => s.initVoice)
  useEffect(() => {
    // a click elsewhere closes it (its own button toggles it)
    const away = (e: PointerEvent) => {
      const t = e.target as Element
      if (!ref.current?.contains(t) && !t.closest('[data-start-toggle]')) onClose()
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // the click that opened it is over before this listens
    const t = setTimeout(() => window.addEventListener('pointerdown', away))
    window.addEventListener('keydown', esc)
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc) }
  }, [onClose])

  return (
    <div className="start-from" ref={ref} role="dialog" aria-label="Start from an instrument">
      <button className="start-init" title="One mild Sine pin, everything dialled down: a plain sine, held like an organ (I)"
        onClick={() => { initVoice(); onClose(); audition() }}>
        Init voice <span>a plain sine, everything dialled down: explore from there</span>
      </button>
      {INSTRUMENT_GROUPS.map((g) => (
        <section key={g}>
          <h4>{INSTRUMENT_GROUP_LABELS[g]}</h4>
          {INSTRUMENT_IDS.filter((id) => INSTRUMENTS[id].group === g).map((id) => {
            const inst = INSTRUMENTS[id]
            return (
              <button key={id} className={current === id ? 'on' : ''} title={inst.hint}
                style={{ '--h': TONALITY_HUES[inst.family] } as React.CSSProperties}
                onClick={() => { startFrom(id); onClose(); audition() }}>
                {instrumentName(inst)}
              </button>
            )
          })}
        </section>
      ))}
    </div>
  )
}
