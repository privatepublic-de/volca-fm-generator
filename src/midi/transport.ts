// Web MIDI out. The volcas have no MIDI out (PLAN §1), so there is nothing to listen to: pick an output, send.

/** Why this page can't use Web MIDI at all, or null when it can (permission is asked later, on Connect). */
export function webMidiUnavailable(): string | null {
  if ('requestMIDIAccess' in navigator) return null
  // Browsers only offer Web MIDI on secure pages: a file opened from disk or a plain-http host has none.
  if (!window.isSecureContext) return 'Web MIDI needs the served page: open it with npm run dev, not from disk.'
  return 'This browser doesn’t support Web MIDI with SysEx. Use Chrome or Edge.'
}

export async function requestWebMidi(): Promise<MIDIAccess> {
  if (!navigator.requestMIDIAccess) throw new Error('This browser has no Web MIDI')
  return navigator.requestMIDIAccess({ sysex: true })
}

export function outputNames(access: MIDIAccess): string[] {
  return [...access.outputs.values()].map((p) => p.name ?? '')
}

/** The output by name (a saved choice), else the first one whose name looks like a MIDI interface or volca. */
export function findOutput(access: MIDIAccess, name?: string): MIDIOutput | null {
  const list = [...access.outputs.values()]
  return list.find((p) => name && p.name === name) ?? list.find((p) => /volca|midi|usb/i.test(p.name ?? '')) ?? list[0] ?? null
}

/** Sends to the port while it's there; a port that has gone throws on send, so skip it. */
export function send(output: MIDIOutput | null, message: ArrayLike<number>) {
  if (output?.state === 'connected') output.send(Array.from(message))
}
