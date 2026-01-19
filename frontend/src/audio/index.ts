/**
 * Audio module public API
 */

export { audioEngine, AudioEngine } from './AudioEngine'
export type { PlayOptions, AudioEngineCallbacks } from './AudioEngine'

export { audioService, AudioService } from './AudioService'

export { AudioPolicy, PolicyConfig } from './AudioPolicy'
export type { PolicyMode, PlayDecision } from './AudioPolicy'

export { AudioManifest, getAllSoundNames, getAsset } from './AudioManifest'
export type { AudioAsset } from './AudioManifest'

export {
  SoundPriority,
  SoundCategories,
  isStinger,
  isLoop,
  isDecorative,
  winTierToSound
} from './AudioTypes'
export type { SoundName, SoundCategory } from './AudioTypes'
