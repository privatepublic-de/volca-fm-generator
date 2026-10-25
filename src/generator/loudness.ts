// Every generated voice about as loud as every other (PLAN §4.4 steps 5–6): render a held note with the engine,
// measure, and move all carriers' output levels together (0.75 dB a step). Also what "audible" means.
import { getOp, OP, opBase, setOp, VC, type Voice } from '../dx7/voice'
import { envelope, toDb } from '../engine/measure'
import { renderNote } from '../engine/render'
import { rolesOf } from './shapes'

/** Low enough to be quick (a few ms a voice), high enough for the level of most sounds. */
const SAMPLE_RATE = 16000
/** The loudness voices aim at: INIT VOICE, a sine at full level, minus 3 dB (dB of the loudest 20 ms). */
export const TARGET_DB = toDb(0.125 / Math.SQRT2) - 3
/** Quieter than this is "not audible". */
export const SILENT_DB = TARGET_DB - 30

/** The loudest 20 ms of a note held at C4, in dB. Measured on a copy whose slow rates (R1–R3) are made quick: the
 *  same levels, reached within a second, so a slow pad measures what it grows to. */
export function loudness(v: Voice, note = 60): number {
  const quick = Uint8Array.from(v)
  for (let op = 1; op <= 6; op++) for (let i = 0; i < 3; i++) {
    const at = opBase(op) + OP.rate1 + i
    quick[at] = Math.max(quick[at], 55)
  }
  const samples = renderNote(quick, { note, sampleRate: SAMPLE_RATE, holdSeconds: 1 })
  let max = 0
  for (const x of envelope({ samples, sampleRate: SAMPLE_RATE }, 0.02)) max = Math.max(max, x)
  return toDb(max)
}

/** Moves every sounding carrier by the same number of steps towards the target. A step is 0.75 dB, so one render
 *  is enough unless a carrier hit 99 or 20, or carries the feedback (its timbre changes with its level): then
 *  measure again and correct once more. In place; returns the loudness reached. */
export function normalizeLoudness(v: Voice): number {
  let db = loudness(v)
  for (let pass = 0; pass < 2; pass++) {
    const steps = Math.round((TARGET_DB - db) / 0.75)
    if (Math.abs(steps) < 2) break
    const { carriers, algorithm } = rolesOf(v)
    const sounding = carriers.filter((op) => getOp(v, op, 'outputLevel') > 0)
    let exact = !(v[VC.feedback] && sounding.includes(algorithm.feedback.to))
    for (const op of sounding) {
      const wanted = getOp(v, op, 'outputLevel') + steps
      // levels below 20 aren't 0.75 dB a step any more: keep carriers above that
      const level = Math.max(20, Math.min(99, wanted))
      if (level !== wanted) exact = false
      setOp(v, op, 'outputLevel', level)
    }
    if (exact) return db + steps * 0.75
    db = loudness(v)
  }
  return db
}
