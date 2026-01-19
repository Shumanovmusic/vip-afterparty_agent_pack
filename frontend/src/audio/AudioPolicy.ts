/**
 * Audio policy rules
 * Handles Turbo/ReduceMotion, concurrency limits, ducking
 */

import type { SoundName } from './AudioTypes'
import { SoundPriority, isStinger, isDecorative, isLoop } from './AudioTypes'
import { getAsset } from './AudioManifest'

/** Policy configuration */
export const PolicyConfig = {
  /** Maximum concurrent SFX (excluding loops) */
  MAX_CONCURRENT_SFX: 6,

  /** Maximum concurrent loops */
  MAX_CONCURRENT_LOOPS: 1,

  /** Ducking volume for loop when stinger plays */
  DUCK_VOLUME: 0.35,

  /** Extra time after stinger duration before restoring volume */
  DUCK_RESTORE_DELAY_MS: 150,

  /** Volume reduction in turbo mode */
  TURBO_VOLUME_MULTIPLIER: 0.7,

  /** Volume reduction in reduce motion mode */
  REDUCE_MOTION_VOLUME_MULTIPLIER: 0.8
} as const

/** Mode flags for policy decisions */
export interface PolicyMode {
  turbo: boolean
  reduceMotion: boolean
  muted: boolean
}

/** Play decision result */
export interface PlayDecision {
  allowed: boolean
  reason?: string
  volumeMultiplier: number
  shouldDuck: boolean
  duckDurationMs?: number
}

/**
 * Audio policy evaluator
 */
export class AudioPolicyEvaluator {
  private mode: PolicyMode = {
    turbo: false,
    reduceMotion: false,
    muted: false
  }

  /** Current active SFX count (for concurrency) */
  private activeSfxCount = 0

  /** Current active loop count */
  private activeLoopCount = 0

  /** Set mode flags */
  setMode(mode: Partial<PolicyMode>): void {
    Object.assign(this.mode, mode)
  }

  /** Get current mode */
  getMode(): PolicyMode {
    return { ...this.mode }
  }

  /** Track SFX start */
  onSfxStart(): void {
    this.activeSfxCount++
  }

  /** Track SFX end */
  onSfxEnd(): void {
    this.activeSfxCount = Math.max(0, this.activeSfxCount - 1)
  }

  /** Track loop start */
  onLoopStart(): void {
    this.activeLoopCount++
  }

  /** Track loop end */
  onLoopEnd(): void {
    this.activeLoopCount = Math.max(0, this.activeLoopCount - 1)
  }

  /** Get active SFX count */
  getActiveSfxCount(): number {
    return this.activeSfxCount
  }

  /** Get active loop count */
  getActiveLoopCount(): number {
    return this.activeLoopCount
  }

  /** Reset counters (for testing) */
  reset(): void {
    this.activeSfxCount = 0
    this.activeLoopCount = 0
  }

  /**
   * Evaluate whether a sound should play
   */
  evaluate(name: SoundName): PlayDecision {
    // Muted = never play
    if (this.mode.muted) {
      return { allowed: false, reason: 'muted', volumeMultiplier: 0, shouldDuck: false }
    }

    const asset = getAsset(name)
    const isLoopSound = isLoop(name)
    const isStingerSound = isStinger(name)
    const isDecorativeSound = isDecorative(name)

    // Calculate volume multiplier
    let volumeMultiplier = 1.0
    if (this.mode.turbo) {
      volumeMultiplier *= PolicyConfig.TURBO_VOLUME_MULTIPLIER
    }
    if (this.mode.reduceMotion) {
      volumeMultiplier *= PolicyConfig.REDUCE_MOTION_VOLUME_MULTIPLIER
    }

    // Turbo mode: decorative sounds are dropped or quieter
    if (this.mode.turbo && isDecorativeSound) {
      // In turbo, decorative sounds play at very low volume
      volumeMultiplier *= 0.3
    }

    // Reduce motion: fewer stop ticks
    if (this.mode.reduceMotion && name === 'reel_stop_tick') {
      volumeMultiplier *= 0.5
    }

    // Check loop concurrency
    if (isLoopSound && this.activeLoopCount >= PolicyConfig.MAX_CONCURRENT_LOOPS) {
      return {
        allowed: false,
        reason: 'max_loops_reached',
        volumeMultiplier,
        shouldDuck: false
      }
    }

    // Check SFX concurrency (stingers are never dropped)
    if (!isLoopSound && this.activeSfxCount >= PolicyConfig.MAX_CONCURRENT_SFX) {
      // Drop policy: allow stingers, drop lower priority
      if (!isStingerSound) {
        return {
          allowed: false,
          reason: 'max_sfx_reached',
          volumeMultiplier,
          shouldDuck: false
        }
      }
    }

    // Determine ducking
    const shouldDuck = isStingerSound
    const duckDurationMs = shouldDuck
      ? (asset.durationHint || 1000) + PolicyConfig.DUCK_RESTORE_DELAY_MS
      : undefined

    return {
      allowed: true,
      volumeMultiplier,
      shouldDuck,
      duckDurationMs
    }
  }

  /**
   * Check if a pending sound should drop a currently playing sound
   * Returns the sound to drop, or null if nothing should be dropped
   */
  shouldDropForIncoming(incoming: SoundName, activeSounds: SoundName[]): SoundName | null {
    if (activeSounds.length === 0) return null

    const incomingPriority = SoundPriority[incoming]

    // Find lowest priority active sound
    let lowestPriority = Infinity
    let lowestSound: SoundName | null = null

    for (const sound of activeSounds) {
      const priority = SoundPriority[sound]
      if (priority < lowestPriority) {
        lowestPriority = priority
        lowestSound = sound
      }
    }

    // Drop if incoming has higher priority
    if (lowestSound && incomingPriority > lowestPriority) {
      return lowestSound
    }

    return null
  }
}

/** Singleton policy evaluator */
export const AudioPolicy = new AudioPolicyEvaluator()
