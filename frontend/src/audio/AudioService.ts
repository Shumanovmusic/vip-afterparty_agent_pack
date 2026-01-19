/**
 * Audio Service
 * Integrates AudioEngine with game flow
 * Hooks into ScenarioRunner, EventRouter, and HUD
 */

import { audioEngine } from './AudioEngine'
import { winTierToSound } from './AudioTypes'
import { MotionPrefs } from '../ux/MotionPrefs'
import type { TelemetryClient } from '../telemetry/TelemetryClient'
import type { WinTier } from '../types/events'

/** Audio service for coordinating game audio */
export class AudioService {
  private initialized = false
  private telemetry: TelemetryClient | null = null
  private reelStopCount = 0

  /**
   * Initialize the audio service
   */
  async init(telemetry?: TelemetryClient): Promise<void> {
    if (this.initialized) return

    this.telemetry = telemetry || null

    // Set up telemetry callbacks
    audioEngine.setCallbacks({
      onLoadError: (name, error) => {
        console.warn(`[AudioService] Asset load error: ${name}`, error)
        // Log to telemetry if available - non-fatal
        this.telemetry?.logAssetLoadError({
          asset_type: 'audio',
          asset_name: name,
          error_message: error.message || 'Unknown error'
        })
      },
      onSettingChanged: (setting, value) => {
        console.debug(`[AudioService] Setting changed: ${setting} = ${value}`)
        // Log to telemetry
        if (setting === 'enabled') {
          this.telemetry?.logAudioSettingChanged({
            setting: 'sound_enabled',
            value: value as boolean
          })
        } else if (setting === 'volume') {
          this.telemetry?.logAudioSettingChanged({
            setting: 'master_volume',
            value: value as number
          })
        }
      }
    })

    // Sync with MotionPrefs
    this.syncWithMotionPrefs()

    // Subscribe to MotionPrefs changes
    MotionPrefs.onChange((prefs) => {
      audioEngine.setTurbo(prefs.turboEnabled)
      audioEngine.setReduceMotion(prefs.reduceMotion)
    })

    // Load audio assets
    await audioEngine.init()

    this.initialized = true
    console.debug('[AudioService] Initialized')
  }

  /**
   * Sync audio engine with current MotionPrefs
   */
  private syncWithMotionPrefs(): void {
    audioEngine.setTurbo(MotionPrefs.turboEnabled)
    audioEngine.setReduceMotion(MotionPrefs.reduceMotion)
  }

  // --- HUD Sound Hooks ---

  /**
   * Play UI click sound (for buttons)
   */
  playUIClick(): void {
    audioEngine.playSfx('ui_click')
  }

  /**
   * Set sound enabled state
   */
  setSoundEnabled(enabled: boolean): void {
    audioEngine.setEnabled(enabled)
  }

  /**
   * Get sound enabled state
   */
  isSoundEnabled(): boolean {
    return audioEngine.isEnabled()
  }

  /**
   * Set master volume
   */
  setVolume(volume: number): void {
    audioEngine.setMasterVolume(volume)
  }

  /**
   * Get master volume
   */
  getVolume(): number {
    return audioEngine.getMasterVolume()
  }

  // --- Spin Lifecycle Hooks ---

  /**
   * Called when spin starts (reels begin spinning)
   */
  onSpinStart(): void {
    this.reelStopCount = 0
    audioEngine.startLoop('reel_spin_loop')
  }

  /**
   * Called when a single reel stops
   */
  onReelStop(): void {
    this.reelStopCount++

    // In reduce motion, play fewer ticks (every other)
    if (MotionPrefs.reduceMotion && this.reelStopCount % 2 === 0) {
      return
    }

    audioEngine.playSfx('reel_stop_tick')
  }

  /**
   * Called when all reels have stopped
   */
  onReelsComplete(): void {
    audioEngine.stopLoop('reel_spin_loop')
    this.reelStopCount = 0
  }

  /**
   * Called on first skip (accelerate)
   */
  onSkipAccelerate(): void {
    // Loop continues but may be quieter
    // No action needed - AudioEngine handles turbo mode
  }

  /**
   * Called on second skip (jump to result)
   */
  onSkipComplete(): void {
    // Stop the loop immediately
    audioEngine.stopAllLoops()
    this.reelStopCount = 0
  }

  /**
   * Called when scenario is aborted/error
   */
  onScenarioAbort(): void {
    audioEngine.stopAllLoops()
    audioEngine.stopAllSfx()
    this.reelStopCount = 0
  }

  // --- Event Hooks ---

  /**
   * Called when entering free spins
   */
  onEnterFreeSpins(): void {
    // Stop loops first per spec
    audioEngine.stopAllLoops()
    audioEngine.playSfx('bonus_enter')
  }

  /**
   * Called when bonus ends
   */
  onBonusEnd(): void {
    audioEngine.playSfx('bonus_end')
  }

  /**
   * Called on win tier celebration
   */
  onWinTier(tier: WinTier): void {
    if (tier === 'none') return

    // Stop loop before celebration
    audioEngine.stopAllLoops()

    // Play appropriate stinger
    const soundName = winTierToSound(tier)
    audioEngine.playSfx(soundName)
  }

  /**
   * Called for small win (no tier)
   */
  onWinSmall(): void {
    audioEngine.playSfx('win_small')
  }

  // --- Utility ---

  /**
   * Force stop all audio (emergency/cleanup)
   */
  stopAll(): void {
    audioEngine.stopAllLoops()
    audioEngine.stopAllSfx()
    this.reelStopCount = 0
  }

  /**
   * Check if spin loop is playing
   */
  isSpinLoopPlaying(): boolean {
    return audioEngine.isLoopPlaying('reel_spin_loop')
  }

  /**
   * Destroy service
   */
  destroy(): void {
    audioEngine.destroy()
    this.initialized = false
  }
}

/** Singleton audio service instance */
export const audioService = new AudioService()
