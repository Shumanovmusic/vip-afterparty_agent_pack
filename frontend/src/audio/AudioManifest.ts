/**
 * Audio asset manifest
 * Maps logical names to URLs, loop flags, volumes, priorities
 */

import type { SoundName } from './AudioTypes'
import { SoundPriority, SoundCategories } from './AudioTypes'

/** Audio asset entry */
export interface AudioAsset {
  url: string
  loop: boolean
  baseVolume: number
  priority: number
  category: string
  /** Duration hint in ms (for ducking timing) */
  durationHint?: number
}

/** Base path for audio assets */
const AUDIO_BASE_PATH = '/src/assets/audio/'

/** Audio manifest - all sounds with metadata */
export const AudioManifest: Record<SoundName, AudioAsset> = {
  ui_click: {
    url: `${AUDIO_BASE_PATH}ui_click.mp3`,
    loop: false,
    baseVolume: 0.5,
    priority: SoundPriority.ui_click,
    category: SoundCategories.ui_click,
    durationHint: 100
  },
  reel_spin_loop: {
    url: `${AUDIO_BASE_PATH}reel_spin_loop.mp3`,
    loop: true,
    baseVolume: 0.4,
    priority: SoundPriority.reel_spin_loop,
    category: SoundCategories.reel_spin_loop,
    durationHint: 2000  // Loop, but hint for policy
  },
  reel_stop_tick: {
    url: `${AUDIO_BASE_PATH}reel_stop_tick.mp3`,
    loop: false,
    baseVolume: 0.6,
    priority: SoundPriority.reel_stop_tick,
    category: SoundCategories.reel_stop_tick,
    durationHint: 80
  },
  win_small: {
    url: `${AUDIO_BASE_PATH}win_small.mp3`,
    loop: false,
    baseVolume: 0.7,
    priority: SoundPriority.win_small,
    category: SoundCategories.win_small,
    durationHint: 400
  },
  win_big: {
    url: `${AUDIO_BASE_PATH}win_big.mp3`,
    loop: false,
    baseVolume: 0.85,
    priority: SoundPriority.win_big,
    category: SoundCategories.win_big,
    durationHint: 1200
  },
  win_mega: {
    url: `${AUDIO_BASE_PATH}win_mega.mp3`,
    loop: false,
    baseVolume: 0.9,
    priority: SoundPriority.win_mega,
    category: SoundCategories.win_mega,
    durationHint: 1800
  },
  win_epic: {
    url: `${AUDIO_BASE_PATH}win_epic.mp3`,
    loop: false,
    baseVolume: 1.0,
    priority: SoundPriority.win_epic,
    category: SoundCategories.win_epic,
    durationHint: 2500
  },
  bonus_enter: {
    url: `${AUDIO_BASE_PATH}bonus_enter.mp3`,
    loop: false,
    baseVolume: 0.9,
    priority: SoundPriority.bonus_enter,
    category: SoundCategories.bonus_enter,
    durationHint: 1500
  },
  bonus_end: {
    url: `${AUDIO_BASE_PATH}bonus_end.mp3`,
    loop: false,
    baseVolume: 0.85,
    priority: SoundPriority.bonus_end,
    category: SoundCategories.bonus_end,
    durationHint: 1200
  },
  coin_roll_loop: {
    url: `${AUDIO_BASE_PATH}coin_roll_loop.mp3`,
    loop: true,
    baseVolume: 0.35,
    priority: SoundPriority.coin_roll_loop,
    category: SoundCategories.coin_roll_loop,
    durationHint: 3000  // Loop, hint for policy
  }
}

/** Get all sound names */
export function getAllSoundNames(): SoundName[] {
  return Object.keys(AudioManifest) as SoundName[]
}

/** Get asset by name */
export function getAsset(name: SoundName): AudioAsset {
  return AudioManifest[name]
}
