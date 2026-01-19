/**
 * Animation primitives library
 * All animations respect MotionPrefs for turbo/reduce motion modes
 * Source of truth: UX_ANIMATION_SPEC.md, SCENARIO_V1.md
 */

import type { Container, Application } from 'pixi.js'
import type { WinTier, EventType } from '../../types/events'
import { MotionPrefs, TIMING } from '../MotionPrefs'
import { audioService } from '../../audio/AudioService'

/** Animation options */
export interface AnimationOptions {
  duration?: number
  onComplete?: () => void
  skipCheck?: () => boolean
}

/** Position on 5x3 grid */
export interface GridPosition {
  reel: number  // 0-4
  row: number   // 0-2
}

/** Event emitter interface for decoupling from render components */
export interface AnimationEvents {
  onReelSpinStart?: (reelIndex: number) => void
  onReelStop?: (reelIndex: number, symbols: number[]) => void
  onRevealComplete?: () => void
  onWinLineHighlight?: (lineId: number, positions: GridPosition[]) => void
  onWinTextPopup?: (amount: number, position: { x: number; y: number }) => void
  onSpotlightWilds?: (positions: number[]) => void
  onEventBanner?: (type: EventType, multiplier?: number) => void
  onEnterFreeSpins?: (count: number) => void
  onHeatMeterUpdate?: (level: number) => void
  onCelebration?: (tier: WinTier) => void
  onBoomOverlay?: () => void
}

/**
 * Animation library class
 * Coordinates animations with MotionPrefs awareness
 */
export class AnimationLibrary {
  private events: AnimationEvents = {}

  /** Set Pixi application reference (stored for future use) */
  setApp(_app: Application): void {
    // Will be used for advanced animation control
  }

  /** Set container for overlays (stored for future use) */
  setContainer(_container: Container): void {
    // Will be used for overlay management
  }

  /** Set event handlers */
  setEvents(events: AnimationEvents): void {
    this.events = events
  }

  // --- Reel Animations ---

  /**
   * Start reel spin animation (blur/motion)
   */
  async reelSpinStart(reelIndex: number): Promise<void> {
    this.events.onReelSpinStart?.(reelIndex)

    // In turbo mode, minimal visual feedback
    if (MotionPrefs.turboEnabled) {
      return Promise.resolve()
    }

    // Normal spin start animation
    return this.delay(TIMING.SPIN_BUTTON_FEEDBACK_MS)
  }

  /**
   * Start all reels spinning
   */
  async allReelsSpinStart(): Promise<void> {
    const promises = []
    for (let i = 0; i < 5; i++) {
      promises.push(this.reelSpinStart(i))
    }
    await Promise.all(promises)
  }

  /**
   * Stop reel with optional bounce
   */
  async reelStop(reelIndex: number, symbols: number[]): Promise<void> {
    this.events.onReelStop?.(reelIndex, symbols)

    // Audio: play stop tick
    audioService.onReelStop()

    // Bounce only if enabled
    const bounceDuration = MotionPrefs.shouldShowBounce() ? 150 : 0
    return this.delay(bounceDuration)
  }

  /**
   * Stop all reels L->R with stagger
   */
  async allReelsStop(grid: number[][]): Promise<void> {
    const stagger = MotionPrefs.turboEnabled
      ? TIMING.REEL_STOP_STAGGER_MS / 2
      : TIMING.REEL_STOP_STAGGER_MS

    for (let i = 0; i < 5; i++) {
      await this.reelStop(i, grid[i])
      if (i < 4) {
        await this.delay(stagger)
      }
    }
  }

  // --- Grid Reveal ---

  /**
   * Reveal final grid (after reel stops)
   */
  async revealGrid(grid: number[][]): Promise<void> {
    await this.allReelsStop(grid)
    this.events.onRevealComplete?.()
  }

  // --- Win Presentation ---

  /**
   * Highlight winning line
   */
  async highlightWinLine(
    lineId: number,
    _amount: number,
    winX: number
  ): Promise<void> {
    // For now, positions would come from a payline definition
    // Simplified: just emit event with lineId
    this.events.onWinLineHighlight?.(lineId, [])

    const duration = MotionPrefs.turboEnabled
      ? TIMING.TURBO_FEEDBACK_MAX_MS
      : MotionPrefs.getWinPopupDuration(winX)

    return this.delay(duration)
  }

  /**
   * Show win amount popup
   */
  async winTextPopup(
    amount: number,
    position: { x: number; y: number },
    winX: number
  ): Promise<void> {
    this.events.onWinTextPopup?.(amount, position)

    const duration = MotionPrefs.getWinPopupDuration(winX)
    return this.delay(duration)
  }

  // --- Special Features ---

  /**
   * Highlight spotlight wild positions
   */
  async spotlightWilds(positions: number[]): Promise<void> {
    this.events.onSpotlightWilds?.(positions)

    const duration = MotionPrefs.turboEnabled
      ? TIMING.TURBO_FEEDBACK_MAX_MS
      : TIMING.EVENT_FX_MAX_MS

    return this.delay(duration)
  }

  // --- Event Banners ---

  /**
   * Show event banner (BOOST/RAGE/EXPLOSIVE)
   */
  async eventBanner(type: EventType, multiplier?: number): Promise<void> {
    this.events.onEventBanner?.(type, multiplier)

    // No decorative FX in turbo
    if (MotionPrefs.turboEnabled) {
      return this.delay(TIMING.TURBO_FEEDBACK_MAX_MS)
    }

    // Reduce motion: shorter duration
    if (MotionPrefs.reduceMotion) {
      return this.delay(TIMING.REDUCE_MOTION_MAX_MS)
    }

    return this.delay(TIMING.EVENT_FX_MAX_MS)
  }

  /**
   * Hide event banner
   */
  async eventBannerHide(): Promise<void> {
    // Quick fade out
    return this.delay(100)
  }

  // --- Bonus Transitions ---

  /**
   * Enter free spins transition
   */
  async enterFreeSpins(count: number): Promise<void> {
    this.events.onEnterFreeSpins?.(count)

    if (MotionPrefs.turboEnabled) {
      return this.delay(TIMING.TURBO_FEEDBACK_MAX_MS)
    }

    if (MotionPrefs.reduceMotion) {
      return this.delay(TIMING.REDUCE_MOTION_MAX_MS)
    }

    // Normal entry animation
    return this.delay(1500)
  }

  /**
   * Update heat meter
   */
  async heatMeterUpdate(level: number): Promise<void> {
    this.events.onHeatMeterUpdate?.(level)

    const duration = MotionPrefs.turboEnabled
      ? TIMING.TURBO_FEEDBACK_MAX_MS
      : 400

    return this.delay(duration)
  }

  // --- Celebrations ---

  /**
   * Play celebration for win tier
   */
  async celebration(tier: WinTier): Promise<void> {
    if (tier === 'none') return

    this.events.onCelebration?.(tier)

    const duration = MotionPrefs.getCelebrationDuration(tier)
    return this.delay(duration)
  }

  /**
   * BOOM overlay effect
   */
  async boomOverlay(): Promise<void> {
    // OFF in turbo mode
    if (MotionPrefs.turboEnabled) {
      return
    }

    this.events.onBoomOverlay?.()

    const duration = MotionPrefs.reduceMotion
      ? 0  // Static stamp only
      : TIMING.EVENT_FX_MAX_MS

    return this.delay(duration)
  }

  // --- Utilities ---

  /**
   * Dim non-winning symbols
   */
  async dimNonWinning(_winningPositions: number[]): Promise<void> {
    // This would be handled by ReelsView
    return Promise.resolve()
  }

  /**
   * Restore all symbol brightness
   */
  async restoreBrightness(): Promise<void> {
    return Promise.resolve()
  }

  /**
   * Screen shake effect
   */
  async screenShake(intensity: number = 1): Promise<void> {
    if (!MotionPrefs.shouldShowScreenShake()) {
      return
    }

    // Would shake the container
    return this.delay(100 * intensity)
  }

  // --- Internal helpers ---

  private delay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve()
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/** Singleton animation library instance */
export const Animations = new AnimationLibrary()

/** Convert flat position to grid position */
export function flatToGrid(flatIndex: number): GridPosition {
  return {
    reel: Math.floor(flatIndex / 3),
    row: flatIndex % 3
  }
}

/** Convert grid position to flat index */
export function gridToFlat(pos: GridPosition): number {
  return pos.reel * 3 + pos.row
}

/** Get all positions for a payline (placeholder - would be defined per game) */
export function getPaylinePositions(_lineId: number): GridPosition[] {
  // Placeholder - real implementation would have payline definitions
  // For now return empty array
  return []
}
