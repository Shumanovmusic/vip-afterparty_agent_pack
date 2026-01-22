/**
 * HeatModel - Frontend-only heat state for juice progression
 * No Vue deps - pure TypeScript class
 * Heat is a scalar [0..10] that drives visual intensity
 */

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

/** Listener for heat value changes */
export type HeatChangeListener = (value: number, level: number, crossedThreshold: number | null) => void

/** Threshold crossing listener */
export type HeatThresholdListener = (level: number) => void

/**
 * HeatModel - manages heat state and update rules
 */
export class HeatModel {
  /** Current heat value [0..10] */
  private _value = 0

  /** Previous integer level for threshold detection */
  private _prevLevel = 0

  /** Motion preferences */
  private _motionPrefs: HeatMotionPrefs = { turbo: false, reduceMotion: false }

  /** Change listeners */
  private _listeners: Set<HeatChangeListener> = new Set()

  /** Threshold listeners (for spotlight triggers) */
  private _thresholdListeners: Set<HeatThresholdListener> = new Set()

  /** Verbose logging (DEV) */
  private _verbose = false

  /** Last update timestamp for decay calculation */
  private _lastTickTime = 0

  constructor() {
    this._lastTickTime = performance.now()
  }

  /**
   * Get current heat value (continuous [0..10])
   */
  getValue(): number {
    return this._value
  }

  /**
   * Get current heat level (integer 0..10)
   */
  getLevel(): number {
    return Math.floor(this._value)
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
   * Called when heat crosses integer boundaries
   * @returns Unsubscribe function
   */
  onThreshold(listener: HeatThresholdListener): () => void {
    this._thresholdListeners.add(listener)
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
   * Add heat (positive delta)
   * @param delta - Amount to add
   * @param reason - Debug reason string
   */
  addHeat(delta: number, reason: string): void {
    if (delta <= 0) return
    this.updateValue(this._value + delta, reason)
  }

  /**
   * Remove heat (negative delta)
   * @param delta - Amount to subtract (should be positive)
   * @param reason - Debug reason string
   */
  removeHeat(delta: number, reason: string): void {
    if (delta <= 0) return
    this.updateValue(this._value - delta, reason)
  }

  /**
   * Called on spin start - small anticipation bump
   */
  onSpinStart(): void {
    this.addHeat(HEAT_DELTAS.SPIN_START, 'spinStart')
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

    // Apply spin decay
    delta -= HEAT_DECAY.PER_SPIN
    reasons.push(`spinDecay:-${HEAT_DECAY.PER_SPIN}`)

    if (delta !== 0) {
      this.updateValue(this._value + delta, reasons.join(', '))
    }
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
   * Tick for passive decay
   * Call this in a rAF loop or periodically
   * @param dtMs - Delta time in milliseconds
   */
  tick(dtMs: number): void {
    if (this._value <= 0) return

    const decayAmount = (HEAT_DECAY.PASSIVE_PER_SEC * dtMs) / 1000
    if (decayAmount > 0) {
      this.updateValue(this._value - decayAmount, 'passiveDecay')
    }
  }

  /**
   * Auto-tick using performance.now() delta
   * Convenience method for frame-based updates
   */
  autoTick(): void {
    const now = performance.now()
    const dt = now - this._lastTickTime
    this._lastTickTime = now

    if (dt > 0 && dt < 1000) { // Skip if paused/backgrounded
      this.tick(dt)
    }
  }

  /**
   * Reset heat to zero
   */
  reset(): void {
    this.updateValue(0, 'reset')
  }

  /**
   * Force set heat value (for DEV/testing)
   */
  forceSet(value: number): void {
    this.updateValue(value, 'forceSet')
  }

  /**
   * Update value with clamping, threshold detection, and notifications
   */
  private updateValue(newValue: number, reason: string): void {
    const clamped = Math.max(0, Math.min(10, newValue))
    const prevValue = this._value
    const prevLevel = this._prevLevel
    const newLevel = Math.floor(clamped)

    // Check for threshold crossing
    let crossedThreshold: number | null = null
    if (newLevel > prevLevel) {
      // Crossed upward - check if we hit a spotlight threshold (3, 6, 9)
      for (let t = prevLevel + 1; t <= newLevel; t++) {
        if (t === 3 || t === 6 || t === 9) {
          crossedThreshold = t
          break // Take first crossing
        }
      }
    }

    // Update state
    this._value = clamped
    this._prevLevel = newLevel

    // Skip notifications if no change
    if (Math.abs(clamped - prevValue) < 0.001) return

    // Log if verbose
    if (this._verbose && import.meta.env.DEV) {
      console.log(`[HeatModel] ${reason}: ${prevValue.toFixed(2)} -> ${clamped.toFixed(2)} (level ${newLevel})${crossedThreshold ? ` [THRESHOLD ${crossedThreshold}]` : ''}`)
    }

    // Notify change listeners
    this._listeners.forEach(l => l(clamped, newLevel, crossedThreshold))

    // Notify threshold listeners
    if (crossedThreshold !== null) {
      this._thresholdListeners.forEach(l => l(crossedThreshold))
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
