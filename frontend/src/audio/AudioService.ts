/**
 * Audio Service
 * Integrates AudioEngine with game flow
 * Hooks into ScenarioRunner, EventRouter, and HUD
 */

import { audioEngine } from './AudioEngine'
import { winTierToSound } from './AudioTypes'
import { coinRollSynth } from './CoinRollSynth'
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
    if (this.initialized) {
      console.log('[AudioService] Already initialized')
      return
    }

    console.log('[AudioService] init() starting...')

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
    console.log('[AudioService] Initialized successfully')
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

  // --- Coin Roll (Big Win Count-up) ---

  /**
   * Start coin roll loop for big win count-up
   * Uses WebAudio synth for reliability (no external file dependency)
   * Only plays in normal mode (not turbo/reduceMotion)
   */
  startCoinRoll(): void {
    // Skip in turbo or reduce motion
    if (MotionPrefs.turboEnabled || MotionPrefs.reduceMotion) {
      return
    }

    // Try pixi/sound first, fall back to synth
    const instance = audioEngine.startLoop('coin_roll_loop')
    if (!instance) {
      // Fallback to WebAudio synth
      coinRollSynth.start({ volume: 0.35 })
    }
  }

  /**
   * Stop coin roll loop
   */
  stopCoinRoll(): void {
    audioEngine.stopLoop('coin_roll_loop')
    coinRollSynth.stop()
  }

  /**
   * Set coin roll pitch based on count-up progress (Task 9.2)
   * Creates rising pitch effect during win count-up
   * @param progress - Animation progress (0 to 1)
   * @param turbo - If true, uses reduced pitch range (0.10 vs 0.20)
   */
  setCoinRollPitch(progress: number, turbo: boolean = false): void {
    // Skip pitch adjustment in turbo or reduce motion mode
    if (MotionPrefs.turboEnabled || MotionPrefs.reduceMotion) return

    // Range: turbo uses smaller pitch increase for shorter animation
    const range = turbo ? 0.10 : 0.20

    // Clamp progress to 0-1 and calculate speed multiplier
    // Speed ramps from 1.0 to 1.0 + range (1.0 to 1.2 in normal mode)
    const clampedProgress = Math.min(1, Math.max(0, progress))
    const speed = 1.0 + range * clampedProgress

    // Apply to both pixi/sound loop and synth fallback
    audioEngine.setLoopSpeed('coin_roll_loop', speed)
    coinRollSynth.setTempo(180 + 60 * clampedProgress)  // 180 BPM -> 240 BPM
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
    coinRollSynth.destroy()
    audioEngine.destroy()
    this.initialized = false
  }
}

/** Singleton audio service instance */
export const audioService = new AudioService()
