// The generator (PLAN §6): on the left where to start, the wheel and its pins; on the right the controls and the
// voice they made with what to do with it; below, the kept voices, the session's and the keyboard.
import { useEffect, useState, type CSSProperties } from 'react'
import { TONALITY_HUES } from '../generator/choices'
import { Controls, PinList, StartActions } from './Controls'
import { Keyboard } from './Keyboard'
import { Help } from './Help'
import { Favourites, History } from './Library'
import { StoreDialog } from './StoreDialog'
import { audition, playback, useApp } from './store'
import { TopBar } from './TopBar'
import { VoiceView } from './VoiceView'
import { Wheel } from './Wheel'

export function App() {
  const [storing, setStoring] = useState(false)
  // between 961 and 1100 px the controls stack into one tall column: the voice goes below, across both
  const voiceBelow = useMedia('(min-width: 961px) and (max-width: 1100px)')
  // #help in the address opens the help, so it can be linked to
  const [helping, setHelping] = useState(() => location.hash === '#help')
  const [audioOn, setAudioOn] = useState(playback.started)
  const hue = useApp((s) => (s.generated ? TONALITY_HUES[s.generated.roles[0].tonality] : s.history.find((h) => h.id === s.currentId)?.hue ?? 260))

  useEffect(() => {
    // the first voice goes into the history like every other (once: React runs this twice in development)
    if (!useApp.getState().history.length) useApp.getState().regenerate(true)
    // browsers start audio only after a click or key press
    const start = () => { void playback.start().then(() => setAudioOn(true)) }
    window.addEventListener('pointerdown', start, { once: true })
    window.addEventListener('keydown', start, { once: true })
    const shortcuts = (e: KeyboardEvent) => {
      // undo and redo step through this session's voices, wherever the focus is (but in a text field)
      const target = e.target as HTMLElement
      const typing = target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && ['text', 'number'].includes((target as HTMLInputElement).type))
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault()
        const s = useApp.getState()
        if (e.shiftKey) s.forward()
        else s.back()
        audition()
        return
      }
      const el = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(el.tagName) && e.key === 'Enter') return
      if (['INPUT', 'TEXTAREA'].includes(el.tagName) && (el as HTMLInputElement).type !== 'range' && (el as HTMLInputElement).type !== 'checkbox') return
      const s = useApp.getState()
      const act: Record<string, () => void> = {
        Enter: () => { s.generateNew(); audition() },
        i: () => { s.initVoice(); audition() },
        v: () => { s.variation(); audition() },
        m: () => { s.mutateCurrent(); audition() },
        q: () => s.keep(),
      }
      if (e.key === '?') { e.preventDefault(); setHelping(true); return }
      const a = act[e.key]
      if (a) { e.preventDefault(); a() }
    }
    window.addEventListener('keydown', shortcuts)
    const onHash = () => { if (location.hash === '#help') setHelping(true) }
    window.addEventListener('hashchange', onHash)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
      window.removeEventListener('keydown', shortcuts)
    }
  }, [])

  return (
    <div className="app" style={{ '--h': hue } as CSSProperties}>
      <TopBar onStore={() => setStoring(true)} onHelp={() => setHelping(true)} audioOn={audioOn} />
      <main className="stage">
        <div className="stage-wheel">
          {/* the wheel's header: where a voice begins, beside its title (as Your voice has its actions) */}
          <div className="stage-head">
            <h3 className="stage-title">Tonality</h3>
            <StartActions />
          </div>
          <Wheel />
          <PinList />
        </div>
        <div className="stage-controls">
          <Controls />
          {!voiceBelow && <VoiceView />}
        </div>
      </main>
      {voiceBelow && <VoiceView />}
      <div className="library">
        <Favourites />
        <History />
      </div>
      <Keyboard />
      <footer className="footer">
        <span><kbd>V</kbd> variation</span>
        <span><kbd>M</kbd> mutate</span>
        <span><kbd>Enter</kbd> new voice</span>
        <span><kbd>Q</kbd> keep</span>
        <span><kbd>⌘Z</kbd> <kbd>⇧⌘Z</kbd> undo, redo</span>
        <button className="footer-help" onClick={() => setHelping(true)}><kbd>?</kbd> how it works</button>
      </footer>
      <StoreDialog open={storing} onClose={() => setStoring(false)} />
      <Help open={helping} onClose={() => { setHelping(false); if (location.hash === '#help') history.replaceState(null, '', location.pathname + location.search) }} />
    </div>
  )
}

/** Whether a media query matches, following it as the window changes. */
function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const m = matchMedia(query)
    const on = () => setMatches(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return matches
}
