// What the engine copies from each volca (PLAN §5), so the browser doesn't promise more than the volca plays.

export type Model = 'fm' | 'fm2'

export interface ModelProfile {
  label: string
  voices: number
  /** null: note velocity is ignored, every note plays at this velocity instead */
  fixedVelocity: number | null
}

export const MODELS: Record<Model, ModelProfile> = {
  // Korg's MIDI implementation: "Velocity is not used". Which velocity it plays at is Q5 (fm); 100 for now.
  fm: { label: 'volca fm', voices: 3, fixedVelocity: 100 },
  fm2: { label: 'volca fm2', voices: 6, fixedVelocity: null },
}
