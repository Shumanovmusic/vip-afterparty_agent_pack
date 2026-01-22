/**
 * HeatModel - Frontend-only heat state for juice progression
 * No Vue deps - pure TypeScript class
 * Heat is a scalar [0..10] that drives visual intensity
 *
 * Uses dual-value approach:
 * - rawValue: source of truth, decays over time
 * - displayValue: smoothed UI value that approaches rawValue
 */

import { DEBUG_FLAGS } from '../../render/pixi/DebugFlags'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Heat delta constants (tuneable) */
export const HEAT_DELTAS = {
  /** Small anticipation bump on spin start */
  SPIN_START: 0.05,
  /** Base win delta for any win (totalWin > 0) */
  ANY_WIN_BASE: 0.25,
  /** Win delta based on winX: +min(0.8, 0.15 + winX*0.08) */
  WIN_X_MIN: 0.15,
  WIN_X_FACTOR: 0.08,
  WIN_X_MAX: 0.8,
  /** Scatter presence bonus */
  SCATTER_PRESENT: 0.35,
  /** Free spins entry bonus */
  FREE_SPINS_ENTER: 1.0,
  /** Wild count bonus: +min(0.6, wildCount*0.08) */
  WILD_COUNT_FACTOR: 0.08,
  WILD_COUNT_MAX: 0.6,
  /** Big win tier bonuses */
  TIER_BIG: 1.2,
  TIER_MEGA: 2.0,
  TIER_EPIC: 3.0,
} as const

/** Heat decay constants */
export const HEAT_DECAY = {
  /** Passive decay per second */
  PASSIVE_PER_SEC: 0.30,
  /** Extra decay per completed spin */
  PER_SPIN: 0.10,
} as const

/** Motion preferences for gating animations */
export interface HeatMotionPrefs {
  turbo: boolean
  reduceMotion: boolean
}

/** Spin result payload for heat calculation */
export interface HeatSpinResult {
  totalWin: number
  winX?: number
  hasScatter?: boolean
  wildCount?: number
}

/** Listener for heat value changes - (value, level, crossedThreshold) */
export type HeatChangeListener = (value: number, level: number, crossedThreshold: number | null) => void

/** Threshold crossing listener */
export type HeatThresholdListener = (level: number) => void

/** Spotlight threshold levels */
export type HeatThreshold = 3 | 6 | 9

/**
 * HeatModel - manages heat state and update rules
 * Uses dual-value approach: rawValue (truth) + displayValue (smoothed UI)
 */
export class HeatModel {
  /** Source of truth heat value [0..10] */
  private rawValue = 0

  /** Smoothed display value for UI [0..10] */
  private displayValue = 0

  /** Previous integer level for threshold detection */
  private lastLevel = 0

  /** Motion preferences */
  private _motionPrefs: HeatMotionPrefs = { turbo: false, reduceMotion: false }

  /** Change listeners */
  private _listeners: Set<HeatChangeListener> = new Set()

  /** Threshold listeners (for spotlight triggers) */
  private _thresholdListeners: Set<HeatThresholdListener> = new Set()

  /** Verbose logging (DEV) */
  private _verbose = false

  // Constants
  private readonly MAX = 10
  private readonly PASSIVE_DECAY_PER_SEC = HEAT_DECAY.PASSIVE_PER_SEC
  private readonly PER_SPIN_DECAY = HEAT_DECAY.PER_SPIN
  private readonly DISPLAY_APPROACH_SPEED = 10 // per second - how fast display catches up

  constructor() {
    // No-op - no time tracking needed, tick receives dtSec directly
  }

  /**
   * Get current heat value for display (continuous [0..10])
   * PURE GETTER - no side effects
   */
  getValue(): number {
    return this.displayValue
  }

  /**
   * Get current heat level (integer 0..10)
   * PURE GETTER - no side effects
   */
  getLevel(): number {
    return Math.floor(this.displayValue + 1e-6)
  }

  /**
   * Get raw heat value (for debugging)
   */
  getRawValue(): number {
    return this.rawValue
  }

  /**
   * Subscribe to heat changes
   * @returns Unsubscribe function
   */
  onChange(listener: HeatChangeListener): () => void {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  /**
   * Subscribe to threshold crossings (for spotlight triggers)
   * Called when heat crosses integer boundaries (3, 6, 9)
   * @returns Unsubscribe function
   */
  onThreshold(listener: HeatThresholdListener): () => void {
    this._thresholdListeners.add(listener)
    // DEBUG: Log when listener is registered
    if (import.meta.env.DEV) {
      console.log('[HEAT] Threshold listener registered, count:', this._thresholdListeners.size)
    }
    return () => this._thresholdListeners.delete(listener)
  }

  /**
   * Set motion preferences
   */
  setMotionPrefs(prefs: HeatMotionPrefs): void {
    this._motionPrefs = { ...prefs }
  }

  /**
   * Get motion preferences
   */
  get motionPrefs(): HeatMotionPrefs {
    return this._motionPrefs
  }

  /**
   * Enable verbose logging (DEV)
   */
  setVerbose(verbose: boolean): void {
    this._verbose = verbose
  }

  /**
   * Tick for passive decay and display smoothing
   * Call this periodically (e.g., every 100ms from setInterval)
   * @param dtSec - Delta time in SECONDS (NOT milliseconds!)
   */
  tick(dtSec: number): void {
    if (!Number.isFinite(dtSec)) return

    // Clamp dt to avoid huge jumps (e.g., after tab backgrounding)
    const dt = clamp(dtSec, 0, 0.25)

    const beforeRaw = this.rawValue
    const beforeDisplay = this.displayValue

    // Apply passive decay to rawValue ONLY
    if (this.rawValue > 0) {
      this.rawValue = clamp(this.rawValue - this.PASSIVE_DECAY_PER_SEC * dt, 0, this.MAX)
    }

    // Smooth displayValue toward rawValue using exponential decay
    // k = 1 - e^(-speed * dt) gives stable smoothing regardless of frame rate
    const k = 1 - Math.exp(-this.DISPLAY_APPROACH_SPEED * dt)
    this.displayValue = clamp(
      this.displayValue + (this.rawValue - this.displayValue) * k,
      0,
      this.MAX
    )

    // Emit changes and check thresholds
    this.emitIfChanged(beforeRaw, beforeDisplay, dt)
    this.checkThresholdCrossing()
  }

  /**
   * Add heat (positive delta)
   * @param delta - Amount to add
   * @param reason - Debug reason string
   */
  addHeat(delta: number, reason: string): void {
    if (!Number.isFinite(delta) || delta === 0) return

    const beforeRaw = this.rawValue
    const beforeDisplay = this.displayValue

    this.rawValue = clamp(this.rawValue + delta, 0, this.MAX)

    // IMPORTANT: For positive impulses, ensure UI shows it IMMEDIATELY
    // This prevents the "flash then vanish" bug where decay eats the value
    // before the display can catch up
    if (delta > 0) {
      this.displayValue = clamp(Math.max(this.displayValue, this.rawValue), 0, this.MAX)
    }

    if (import.meta.env.DEV && (this._verbose || DEBUG_FLAGS.heatVerbose)) {
      console.log('[HEAT addHeat]', {
        delta: delta.toFixed(2),
        reason,
        beforeRaw: beforeRaw.toFixed(2),
        afterRaw: this.rawValue.toFixed(2),
        beforeDisplay: beforeDisplay.toFixed(2),
        afterDisplay: this.displayValue.toFixed(2)
      })
    }

    this.emitIfChanged(beforeRaw, beforeDisplay, 0)
    this.checkThresholdCrossing()
  }

  /**
   * Remove heat (negative delta)
   * @param delta - Amount to subtract (should be positive)
   * @param reason - Debug reason string
   */
  removeHeat(delta: number, reason: string): void {
    if (!Number.isFinite(delta) || delta <= 0) return
    this.addHeat(-delta, reason)
  }

  /**
   * Called on spin start - small anticipation bump
   */
  onSpinStart(): void {
    this.addHeat(HEAT_DELTAS.SPIN_START, 'spinStart')
  }

  /**
   * Apply per-spin decay (called once per spin, NOT in tick)
   */
  onSpinDecay(): void {
    const beforeRaw = this.rawValue
    const beforeDisplay = this.displayValue

    this.rawValue = clamp(this.rawValue - this.PER_SPIN_DECAY, 0, this.MAX)

    if (import.meta.env.DEV && (this._verbose || DEBUG_FLAGS.heatVerbose)) {
      console.log('[HEAT onSpinDecay]', {
        decay: this.PER_SPIN_DECAY,
        beforeRaw: beforeRaw.toFixed(2),
        afterRaw: this.rawValue.toFixed(2)
      })
    }

    this.emitIfChanged(beforeRaw, beforeDisplay, 0)
    this.checkThresholdCrossing()
  }

  /**
   * Called when spin result is received
   * Calculates heat delta from result features
   */
  onSpinResult(payload: HeatSpinResult): void {
    let delta = 0
    const reasons: string[] = []

    // Win-based heat
    if (payload.totalWin > 0) {
      if (payload.winX !== undefined && payload.winX > 0) {
        // Use winX-based calculation
        const winXDelta = Math.min(
          HEAT_DELTAS.WIN_X_MAX,
          HEAT_DELTAS.WIN_X_MIN + payload.winX * HEAT_DELTAS.WIN_X_FACTOR
        )
        delta += winXDelta
        reasons.push(`winX:${payload.winX.toFixed(1)}->+${winXDelta.toFixed(2)}`)
      } else {
        // Fallback to flat win delta
        delta += HEAT_DELTAS.ANY_WIN_BASE
        reasons.push(`anyWin:+${HEAT_DELTAS.ANY_WIN_BASE}`)
      }
    }

    // Scatter presence
    if (payload.hasScatter) {
      delta += HEAT_DELTAS.SCATTER_PRESENT
      reasons.push(`scatter:+${HEAT_DELTAS.SCATTER_PRESENT}`)
    }

    // Wild count
    if (payload.wildCount && payload.wildCount > 0) {
      const wildDelta = Math.min(
        HEAT_DELTAS.WILD_COUNT_MAX,
        payload.wildCount * HEAT_DELTAS.WILD_COUNT_FACTOR
      )
      delta += wildDelta
      reasons.push(`wilds:${payload.wildCount}->+${wildDelta.toFixed(2)}`)
    }

    // Apply gains first
    if (delta > 0) {
      this.addHeat(delta, reasons.join(', '))
    }

    // Apply per-spin decay separately
    this.onSpinDecay()
  }

  /**
   * Called when entering free spins
   */
  onFreeSpinsEnter(): void {
    this.addHeat(HEAT_DELTAS.FREE_SPINS_ENTER, 'freeSpinsEnter')
  }

  /**
   * Called on big win tier
   */
  onWinTier(tier: 'big' | 'mega' | 'epic'): void {
    switch (tier) {
      case 'big':
        this.addHeat(HEAT_DELTAS.TIER_BIG, 'tier:big')
        break
      case 'mega':
        this.addHeat(HEAT_DELTAS.TIER_MEGA, 'tier:mega')
        break
      case 'epic':
        this.addHeat(HEAT_DELTAS.TIER_EPIC, 'tier:epic')
        break
    }
  }

  /**
   * Reset heat to zero
   */
  reset(): void {
    this.rawValue = 0
    this.displayValue = 0
    this.lastLevel = 0
    this._listeners.forEach(l => l(0, 0, null))
  }

  /**
   * Force set heat value (for DEV/testing)
   */
  forceSet(value: number): void {
    const clamped = clamp(value, 0, this.MAX)
    this.rawValue = clamped
    this.displayValue = clamped
    this.emitIfChanged(0, 0, 0)
    this.checkThresholdCrossing()
  }

  /**
   * Emit change event if values changed
   */
  private emitIfChanged(beforeRaw: number, beforeDisplay: number, dt: number): void {
    const rawChanged = Math.abs(this.rawValue - beforeRaw) > 1e-6
    const displayChanged = Math.abs(this.displayValue - beforeDisplay) > 1e-6

    if (!rawChanged && !displayChanged) return

    const level = this.getLevel()

    if (import.meta.env.DEV && (this._verbose || DEBUG_FLAGS.heatVerbose) && dt > 0) {
      console.log('[HEAT tick]', {
        dtSec: dt.toFixed(3),
        raw: this.rawValue.toFixed(2),
        display: this.displayValue.toFixed(2),
        level
      })
    }

    // Notify change listeners with display value (what UI should show)
    // crossedThreshold is handled separately via checkThresholdCrossing
    this._listeners.forEach(l => l(this.displayValue, level, null))
  }

  /**
   * Check for threshold crossings and notify listeners
   */
  private checkThresholdCrossing(): void {
    const level = this.getLevel()

    // DEBUG: Log only on level changes to reduce noise
    if (import.meta.env.DEV && level !== this.lastLevel) {
      console.log('[HEAT LEVEL CHANGE!]', {
        from: this.lastLevel,
        to: level,
        displayValue: this.displayValue.toFixed(2),
        rawValue: this.rawValue.toFixed(2),
        listenerCount: this._thresholdListeners.size
      })
    }

    if (level === this.lastLevel) return

    // Detect upward crossings only (3, 6, 9)
    const crossed: HeatThreshold[] = []
    if (this.lastLevel < 3 && level >= 3) crossed.push(3)
    if (this.lastLevel < 6 && level >= 6) crossed.push(6)
    if (this.lastLevel < 9 && level >= 9) crossed.push(9)

    const prevLevel = this.lastLevel
    this.lastLevel = level

    // Notify threshold listeners for spotlight triggers
    if (crossed.length > 0) {
      // DEBUG: Unconditional trace logging
      if (import.meta.env.DEV) {
        console.log('[HEAT THRESHOLD CROSSED!]', { crossed, prevLevel, newLevel: level, listenerCount: this._thresholdListeners.size })
      }
      crossed.forEach(t => {
        if (import.meta.env.DEV) {
          console.log('[HEAT] Notifying', this._thresholdListeners.size, 'listeners for threshold', t)
        }
        this._thresholdListeners.forEach(cb => {
          if (import.meta.env.DEV) {
            console.log('[HEAT] Calling threshold callback for level', t)
          }
          cb(t)
        })
      })
      // Also notify change listeners with threshold info for UI pulse
      this._listeners.forEach(l => l(this.displayValue, level, crossed[0]))
    }
  }
}

/** Singleton instance */
let _instance: HeatModel | null = null

/**
 * Get or create the HeatModel singleton
 */
export function getHeatModel(): HeatModel {
  if (!_instance) {
    _instance = new HeatModel()
  }
  return _instance
}

/**
 * Reset the singleton (for testing)
 */
export function resetHeatModel(): void {
  _instance = null
}
