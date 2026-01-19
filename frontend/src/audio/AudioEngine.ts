/**
 * Audio Engine
 * pixi/sound-based audio system with mix rules
 * Source of truth: Audio Assets v1 spec
 */

import { sound, IMediaInstance } from '@pixi/sound'
import type { SoundName } from './AudioTypes'
import { isLoop } from './AudioTypes'
import { AudioManifest, getAllSoundNames, getAsset } from './AudioManifest'
import { AudioPolicy, PolicyConfig } from './AudioPolicy'

/** Play options */
export interface PlayOptions {
  /** Override volume (0-1) */
  volume?: number
  /** Force play even if policy would block */
  force?: boolean
}

/** Active sound instance tracking */
interface ActiveSound {
  name: SoundName
  instance: IMediaInstance
  startTime: number
}

/** Audio engine event callbacks */
export interface AudioEngineCallbacks {
  onLoadError?: (name: SoundName, error: Error) => void
  onSettingChanged?: (setting: 'enabled' | 'volume', value: boolean | number) => void
}

/**
 * Main audio engine
 */
export class AudioEngine {
  private loaded = false
  private enabled = true
  private masterVolume = 1.0
  private turboMode = false
  private reduceMotionMode = false

  /** Active loop instances */
  private activeLoops: Map<SoundName, IMediaInstance> = new Map()

  /** Active SFX instances (for concurrency tracking) */
  private activeSfx: ActiveSound[] = []

  /** Original loop volume (for ducking restoration) */
  private originalLoopVolume: Map<SoundName, number> = new Map()

  /** Ducking restore timeout */
  private duckRestoreTimeout: ReturnType<typeof setTimeout> | null = null

  /** Callbacks */
  private callbacks: AudioEngineCallbacks = {}

  /** Sound adapter for testing */
  private soundAdapter: typeof sound = sound

  /**
   * Initialize audio engine
   * Loads all assets from manifest
   */
  async init(): Promise<void> {
    if (this.loaded) return

    const loadPromises: Promise<void>[] = []

    for (const name of getAllSoundNames()) {
      const asset = AudioManifest[name]
      loadPromises.push(
        this.loadSound(name, asset.url, asset.loop)
      )
    }

    await Promise.allSettled(loadPromises)
    this.loaded = true
    console.debug('[AudioEngine] Initialized')
  }

  /**
   * Load a single sound
   */
  private async loadSound(name: SoundName, url: string, loop: boolean): Promise<void> {
    try {
      // Skip if already loaded
      if (this.soundAdapter.exists(name)) return

      await this.soundAdapter.add(name, {
        url,
        preload: true,
        loop
      })
    } catch (error) {
      console.warn(`[AudioEngine] Failed to load ${name}:`, error)
      this.callbacks.onLoadError?.(name, error as Error)
    }
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: AudioEngineCallbacks): void {
    this.callbacks = callbacks
  }

  /**
   * Set sound adapter (for testing)
   */
  setSoundAdapter(adapter: typeof sound): void {
    this.soundAdapter = adapter
  }

  // --- Settings ---

  /**
   * Enable/disable all audio
   */
  setEnabled(value: boolean): void {
    this.enabled = value
    AudioPolicy.setMode({ muted: !value })

    if (!value) {
      this.stopAllLoops()
      this.stopAllSfx()
    }

    this.callbacks.onSettingChanged?.('enabled', value)
  }

  /**
   * Get enabled state
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Set master volume (0-1)
   */
  setMasterVolume(value: number): void {
    this.masterVolume = Math.max(0, Math.min(1, value))
    this.soundAdapter.volumeAll = this.masterVolume
    this.callbacks.onSettingChanged?.('volume', this.masterVolume)
  }

  /**
   * Get master volume
   */
  getMasterVolume(): number {
    return this.masterVolume
  }

  /**
   * Set turbo mode
   */
  setTurbo(value: boolean): void {
    this.turboMode = value
    AudioPolicy.setMode({ turbo: value })

    // In turbo, loops can be quieter
    if (value) {
      this.activeLoops.forEach((instance, name) => {
        const asset = getAsset(name)
        instance.volume = asset.baseVolume * PolicyConfig.TURBO_VOLUME_MULTIPLIER
      })
    } else {
      // Restore original volumes
      this.activeLoops.forEach((instance, name) => {
        const originalVol = this.originalLoopVolume.get(name)
        if (originalVol !== undefined) {
          instance.volume = originalVol
        }
      })
    }
  }

  /**
   * Get turbo mode
   */
  isTurbo(): boolean {
    return this.turboMode
  }

  /**
   * Set reduce motion mode
   */
  setReduceMotion(value: boolean): void {
    this.reduceMotionMode = value
    AudioPolicy.setMode({ reduceMotion: value })
  }

  /**
   * Get reduce motion mode
   */
  isReduceMotion(): boolean {
    return this.reduceMotionMode
  }

  // --- Playback ---

  /**
   * Play a one-shot SFX
   */
  playSfx(name: SoundName, options: PlayOptions = {}): IMediaInstance | null {
    if (!this.loaded || !this.enabled) return null

    // Evaluate policy
    const decision = AudioPolicy.evaluate(name)

    if (!decision.allowed && !options.force) {
      console.debug(`[AudioEngine] Blocked ${name}: ${decision.reason}`)
      return null
    }

    // Check if sound exists
    if (!this.soundAdapter.exists(name)) {
      console.warn(`[AudioEngine] Sound not loaded: ${name}`)
      return null
    }

    // Calculate final volume
    const asset = getAsset(name)
    const finalVolume = (options.volume ?? asset.baseVolume) *
      decision.volumeMultiplier * this.masterVolume

    // Handle ducking for stingers
    if (decision.shouldDuck) {
      this.duckLoops(decision.duckDurationMs!)
    }

    try {
      const instance = this.soundAdapter.play(name, {
        volume: finalVolume
      }) as IMediaInstance

      // Track for concurrency
      if (instance && !isLoop(name)) {
        AudioPolicy.onSfxStart()
        this.activeSfx.push({ name, instance, startTime: Date.now() })

        // Clean up when done
        instance.on('end', () => {
          this.removeSfxInstance(instance)
        })
      }

      return instance
    } catch (error) {
      console.warn(`[AudioEngine] Error playing ${name}:`, error)
      return null
    }
  }

  /**
   * Start a looping sound
   */
  startLoop(name: SoundName): IMediaInstance | null {
    if (!this.loaded || !this.enabled) return null

    // Already playing?
    if (this.activeLoops.has(name)) {
      return this.activeLoops.get(name)!
    }

    // Evaluate policy
    const decision = AudioPolicy.evaluate(name)

    if (!decision.allowed) {
      console.debug(`[AudioEngine] Blocked loop ${name}: ${decision.reason}`)
      return null
    }

    if (!this.soundAdapter.exists(name)) {
      console.warn(`[AudioEngine] Loop not loaded: ${name}`)
      return null
    }

    const asset = getAsset(name)
    const finalVolume = asset.baseVolume * decision.volumeMultiplier * this.masterVolume

    try {
      const instance = this.soundAdapter.play(name, {
        volume: finalVolume,
        loop: true
      }) as IMediaInstance

      if (instance) {
        this.activeLoops.set(name, instance)
        this.originalLoopVolume.set(name, finalVolume)
        AudioPolicy.onLoopStart()
      }

      return instance
    } catch (error) {
      console.warn(`[AudioEngine] Error starting loop ${name}:`, error)
      return null
    }
  }

  /**
   * Stop a specific loop
   */
  stopLoop(name: SoundName): void {
    const instance = this.activeLoops.get(name)
    if (instance) {
      instance.stop()
      this.activeLoops.delete(name)
      this.originalLoopVolume.delete(name)
      AudioPolicy.onLoopEnd()
    }
  }

  /**
   * Stop all active loops
   */
  stopAllLoops(): void {
    this.activeLoops.forEach((instance, _name) => {
      instance.stop()
      AudioPolicy.onLoopEnd()
    })
    this.activeLoops.clear()
    this.originalLoopVolume.clear()

    // Clear any pending duck restore
    if (this.duckRestoreTimeout) {
      clearTimeout(this.duckRestoreTimeout)
      this.duckRestoreTimeout = null
    }
  }

  /**
   * Stop all active SFX
   */
  stopAllSfx(): void {
    for (const active of this.activeSfx) {
      active.instance.stop()
      AudioPolicy.onSfxEnd()
    }
    this.activeSfx = []
  }

  /**
   * Check if a loop is currently playing
   */
  isLoopPlaying(name: SoundName): boolean {
    return this.activeLoops.has(name)
  }

  /**
   * Get count of active loops
   */
  getActiveLoopCount(): number {
    return this.activeLoops.size
  }

  /**
   * Get count of active SFX
   */
  getActiveSfxCount(): number {
    return this.activeSfx.length
  }

  // --- Ducking ---

  /**
   * Duck loops for stinger playback
   */
  private duckLoops(durationMs: number): void {
    // Clear any existing restore timeout
    if (this.duckRestoreTimeout) {
      clearTimeout(this.duckRestoreTimeout)
    }

    // Reduce loop volumes
    this.activeLoops.forEach((instance, name) => {
      // Save original if not already saved
      if (!this.originalLoopVolume.has(name)) {
        this.originalLoopVolume.set(name, instance.volume)
      }
      instance.volume = PolicyConfig.DUCK_VOLUME * this.masterVolume
    })

    // Schedule restoration
    this.duckRestoreTimeout = setTimeout(() => {
      this.restoreLoopVolumes()
    }, durationMs)
  }

  /**
   * Restore loop volumes after ducking
   */
  private restoreLoopVolumes(): void {
    this.activeLoops.forEach((instance, name) => {
      const originalVol = this.originalLoopVolume.get(name)
      if (originalVol !== undefined) {
        instance.volume = originalVol
      }
    })
    this.duckRestoreTimeout = null
  }

  /**
   * Manual duck (for testing/external control)
   */
  duckForStinger(durationMs: number): void {
    this.duckLoops(durationMs)
  }

  // --- Cleanup ---

  /**
   * Remove an SFX instance from tracking
   */
  private removeSfxInstance(instance: IMediaInstance): void {
    const index = this.activeSfx.findIndex(a => a.instance === instance)
    if (index !== -1) {
      this.activeSfx.splice(index, 1)
      AudioPolicy.onSfxEnd()
    }
  }

  /**
   * Destroy the engine and release resources
   */
  destroy(): void {
    this.stopAllLoops()
    this.stopAllSfx()
    this.soundAdapter.removeAll()
    this.loaded = false
  }
}

/** Singleton audio engine instance */
export const audioEngine = new AudioEngine()
