// The generator (PLAN §6): the wheel and its pins on the left, where to start and the controls on the right, the
// voice it made below with what to do with it, then the session's voices, the kept ones and the keyboard.
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
          <Wheel />
          <PinList />
        </div>
        <div className="stage-controls">
          <StartActions />
          <Controls />
        </div>
      </main>
      <VoiceView />
      <div className="library">
        <History />
        <Favourites />
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
