/**
 * Motion preferences and timing constants
 * Source of truth: CONFIG.md, SCENARIO_V1.md, UX_ANIMATION_SPEC.md
 */

import type { WinTier } from '../types/events'

/** Defaults from CONFIG.md */
const DEFAULTS = {
  POST_SPIN_BOUNCE: true,
  REDUCE_MOTION: false,
  TURBO_SPIN: false,
  ALLOW_SKIP: true
} as const

/** Timing constants from SCENARIO_V1.md */
export const TIMING = {
  /** Spin cycle duration range (ms) */
  SPIN_CYCLE_MS: { min: 900, max: 1200 },

  /** Win popup durations based on multiplier */
  WIN_POPUP_SMALL_MS: 400,    // win_x < 5
  WIN_POPUP_MID_MS: 1000,     // 5 <= win_x < 20 (actually 0.8-1.2s in spec)
  WIN_POPUP_BIG_MS: 3000,     // win_x >= 20 (actually 2.5-3.5s in spec)

  /** Event FX max duration */
  EVENT_FX_MAX_MS: 500,

  /** Turbo mode feedback max */
  TURBO_FEEDBACK_MAX_MS: 300,

  /** Reduce motion celebration max */
  REDUCE_MOTION_MAX_MS: 600,

  /** Spin button feedback */
  SPIN_BUTTON_FEEDBACK_MS: 50,

  /** Reel stop stagger (L->R) */
  REEL_STOP_STAGGER_MS: 80,

  /** Velvet rope teaser extra spin time */
  VELVET_ROPE_EXTRA_MS: { min: 1500, max: 2000 }
} as const

/** Win tier thresholds from UX_ANIMATION_SPEC.md */
export const WIN_TIER_THRESHOLDS = {
  BIG: 20,      // 20x - 200x
  MEGA: 200,    // 200x - 1000x
  EPIC: 1000    // 1000x+
} as const

const STORAGE_KEY = 'vip_afterparty_motion_prefs'

export interface MotionPrefsState {
  turboEnabled: boolean
  reduceMotion: boolean
  allowSkip: boolean
  postSpinBounce: boolean
}

type PrefsChangeListener = (prefs: MotionPrefsState) => void

/**
 * Singleton class managing motion preferences
 * Respects UX_ANIMATION_SPEC.md rules for Turbo and Reduce Motion
 */
class MotionPrefsManager {
  private _turboEnabled: boolean
  private _reduceMotion: boolean
  private _allowSkip: boolean
  private _postSpinBounce: boolean
  private listeners: Set<PrefsChangeListener> = new Set()

  constructor() {
    const saved = this.loadFromStorage()
    this._turboEnabled = saved?.turboEnabled ?? DEFAULTS.TURBO_SPIN
    this._reduceMotion = saved?.reduceMotion ?? DEFAULTS.REDUCE_MOTION
    this._allowSkip = saved?.allowSkip ?? DEFAULTS.ALLOW_SKIP
    this._postSpinBounce = saved?.postSpinBounce ?? DEFAULTS.POST_SPIN_BOUNCE
  }

  get turboEnabled(): boolean {
    return this._turboEnabled
  }

  set turboEnabled(value: boolean) {
    this._turboEnabled = value
    this.saveToStorage()
    this.notifyListeners()
  }

  get reduceMotion(): boolean {
    return this._reduceMotion
  }

  set reduceMotion(value: boolean) {
    this._reduceMotion = value
    this.saveToStorage()
    this.notifyListeners()
  }

  get allowSkip(): boolean {
    return this._allowSkip
  }

  set allowSkip(value: boolean) {
    this._allowSkip = value
    this.saveToStorage()
    this.notifyListeners()
  }

  get postSpinBounce(): boolean {
    return this._postSpinBounce
  }

  set postSpinBounce(value: boolean) {
    this._postSpinBounce = value
    this.saveToStorage()
    this.notifyListeners()
  }

  /** Get current state as plain object */
  getState(): MotionPrefsState {
    return {
      turboEnabled: this._turboEnabled,
      reduceMotion: this._reduceMotion,
      allowSkip: this._allowSkip,
      postSpinBounce: this._postSpinBounce
    }
  }

  /** Subscribe to preference changes */
  onChange(listener: PrefsChangeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners(): void {
    const state = this.getState()
    this.listeners.forEach(l => l(state))
  }

  private loadFromStorage(): Partial<MotionPrefsState> | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.getState()))
    } catch {
      // Ignore storage errors
    }
  }

  // --- Computed timing methods ---

  /**
   * Should bounce animation play?
   * OFF if turbo OR reduce motion (per UX_ANIMATION_SPEC.md)
   */
  shouldShowBounce(): boolean {
    if (this._turboEnabled || this._reduceMotion) return false
    return this._postSpinBounce
  }

  /**
   * Should decorative FX (particles, sparkles) play?
   * OFF in turbo mode (per UX_ANIMATION_SPEC.md)
   */
  shouldShowDecorativeFX(): boolean {
    return !this._turboEnabled
  }

  /**
   * Should screen shake play?
   * OFF in reduce motion mode
   */
  shouldShowScreenShake(): boolean {
    return !this._reduceMotion
  }

  /**
   * Get spin cycle duration (ms)
   * Turbo: use minimum
   */
  getSpinDuration(): number {
    if (this._turboEnabled) {
      return TIMING.SPIN_CYCLE_MS.min
    }
    return TIMING.SPIN_CYCLE_MS.max
  }

  /**
   * Get win popup duration based on multiplier
   */
  getWinPopupDuration(winX: number): number {
    // In turbo, all feedback limited to 300ms
    if (this._turboEnabled) {
      return Math.min(TIMING.WIN_POPUP_SMALL_MS, TIMING.TURBO_FEEDBACK_MAX_MS)
    }

    if (winX < 5) return TIMING.WIN_POPUP_SMALL_MS
    if (winX < 20) return TIMING.WIN_POPUP_MID_MS
    return TIMING.WIN_POPUP_BIG_MS
  }

  /**
   * Get celebration duration by tier
   */
  getCelebrationDuration(tier: WinTier): number {
    if (tier === 'none') return 0

    // Reduce motion: max 600ms
    if (this._reduceMotion) {
      return TIMING.REDUCE_MOTION_MAX_MS
    }

    // Turbo: simplified to text only
    if (this._turboEnabled) {
      return TIMING.TURBO_FEEDBACK_MAX_MS
    }

    // Normal mode
    switch (tier) {
      case 'big': return 2500
      case 'mega': return 3000
      case 'epic': return 3500
      default: return 0
    }
  }

  /**
   * Get event FX duration (BOOM, fireworks)
   */
  getEventFxDuration(): number {
    if (this._turboEnabled) return 0  // OFF in turbo
    return TIMING.EVENT_FX_MAX_MS
  }

  /**
   * Get feedback max duration (highlights, line displays)
   */
  getFeedbackMaxDuration(): number {
    if (this._turboEnabled) {
      return TIMING.TURBO_FEEDBACK_MAX_MS
    }
    return TIMING.EVENT_FX_MAX_MS
  }

  /**
   * Get win line highlight duration based on mode
   * - Turbo: 250ms (fast feedback)
   * - ReduceMotion: 500ms (no pulse animation)
   * - Normal: 550ms (with pulse animation)
   */
  getWinLineHighlightDuration(): number {
    if (this._turboEnabled) return 250
    if (this._reduceMotion) return 500
    return 550
  }

  /**
   * Determine win tier from winX multiplier
   */
  getWinTier(winX: number): WinTier {
    if (winX >= WIN_TIER_THRESHOLDS.EPIC) return 'epic'
    if (winX >= WIN_TIER_THRESHOLDS.MEGA) return 'mega'
    if (winX >= WIN_TIER_THRESHOLDS.BIG) return 'big'
    return 'none'
  }

  /**
   * Should velvet rope teaser play?
   * OFF in turbo mode
   */
  shouldShowVelvetRopeTeaser(): boolean {
    return !this._turboEnabled
  }
}

/** Singleton instance */
export const MotionPrefs = new MotionPrefsManager()
