/**
 * WinSequenceV2 - Presentation pipeline for win results
 * Source of truth: UX_ANIMATION_SPEC.md
 *
 * Implements the "See → Understand → Celebrate" emotional curve:
 * 1. SPOTLIGHT (optional, ≤300ms) - if backend sends spotlightWilds event
 * 2. HIGHLIGHT (mandatory, min 800ms normal / 300ms turbo) - dim losers, highlight winners
 * 3. CELEBRATION (tier-based) - BigWin overlay for BIG/MEGA/EPIC
 * 4. RESET - cleanup all overlays
 *
 * Runs entirely within RESULT state - does NOT add states to GameStateMachine.
 */

import type { SpinResponse } from '../types/protocol'
import type { GameEvent, WinTier, SpotlightWildsEvent } from '../types/events'
import { MotionPrefs, WIN_TIER_THRESHOLDS } from './MotionPrefs'
import { audioService } from '../audio/AudioService'
import { DimOverlay } from '../render/pixi/fx/DimOverlay'
import { WinLineHighlighter } from '../render/vfx/WinLineHighlighter'
import { SpotlightEvent, type SpotlightGridPosition, type SpotlightEventResult } from '../render/pixi/fx/SpotlightEvent'
import { BigWinPresenter, WinTier as BWPTier } from '../render/pixi/win/BigWinPresenter'

/** Phase durations (ms) per UX_ANIMATION_SPEC.md */
const PHASE_DURATION = {
  SPOTLIGHT_MAX: 300,
  HIGHLIGHT: {
    NORMAL: 800,
    TURBO: 300,
    REDUCE_MOTION: 300
  },
  CELEBRATION: {
    BIG: { normal: 900, turbo: 350 },
    MEGA: { normal: 1400, turbo: 500 },
    EPIC: { normal: 2200, turbo: 700 }
  }
} as const

/** Internal phase state */
type SequencePhase = 'IDLE' | 'SPOTLIGHT' | 'HIGHLIGHT' | 'CELEBRATION' | 'RESET'

/** Callback interface for external coordination */
export interface WinSequenceCallbacks {
  /** Called when highlight phase starts (for count-up) */
  onHighlightStart?: (totalWin: number, tier: WinTier) => void
  /** Called when celebration phase starts */
  onCelebrationStart?: (tier: WinTier) => void
  /** Called when sequence completes or is cancelled */
  onComplete?: () => void
  /** Called to get current bet amount */
  getBetAmount?: () => number
  /** Called to get currency symbol */
  getCurrencySymbol?: () => string
}

/**
 * WinSequenceV2 - Orchestrates win presentation pipeline
 */
export class WinSequenceV2 {
  private seqId = 0
  private phase: SequencePhase = 'IDLE'
  private callbacks: WinSequenceCallbacks = {}

  // Component references (injected)
  private dimOverlay: DimOverlay | null = null
  private winLineHighlighter: WinLineHighlighter | null = null
  private spotlightEvent: SpotlightEvent | null = null
  private bigWinPresenter: BigWinPresenter | null = null

  // Current sequence state
  private currentWinningPositions: number[] = []
  private currentTier: WinTier = 'none'
  private currentTotalWin = 0
  private highlightCycleComplete = false

  // Verbose logging
  private _verbose = false

  constructor() {
    // Components will be injected via setComponents()
  }

  /**
   * Enable verbose logging (DEV)
   */
  setVerbose(verbose: boolean): void {
    this._verbose = verbose
  }

  /**
   * Inject component references
   * Call this after components are created in PixiReelsRenderer
   */
  setComponents(components: {
    dimOverlay?: DimOverlay
    winLineHighlighter?: WinLineHighlighter
    spotlightEvent?: SpotlightEvent
    bigWinPresenter?: BigWinPresenter
  }): void {
    if (components.dimOverlay) this.dimOverlay = components.dimOverlay
    if (components.winLineHighlighter) this.winLineHighlighter = components.winLineHighlighter
    if (components.spotlightEvent) this.spotlightEvent = components.spotlightEvent
    if (components.bigWinPresenter) this.bigWinPresenter = components.bigWinPresenter
  }

  /**
   * Set callbacks for external coordination
   */
  setCallbacks(callbacks: WinSequenceCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  /**
   * Check if sequence is currently running
   */
  isBusy(): boolean {
    return this.phase !== 'IDLE'
  }

  /**
   * Get current phase (for debugging)
   */
  getPhase(): SequencePhase {
    return this.phase
  }

  /**
   * Run the win presentation sequence
   * @param response - Spin response from backend
   * @param bet - Bet amount for this spin
   */
  async run(response: SpinResponse, bet: number): Promise<void> {
    // Increment sequence ID for cancellation
    this.seqId++
    const expectedSeqId = this.seqId

    // Skip if no win
    if (response.outcome.totalWin <= 0) {
      this.log('run() skipped - no win')
      return
    }

    // Extract winning positions from winLine events
    this.currentWinningPositions = this.extractWinningPositions(response.events)
    this.currentTotalWin = response.outcome.totalWin
    this.currentTier = this.computeTier(response.outcome.totalWinX)
    this.highlightCycleComplete = false

    this.log('run()', {
      totalWin: this.currentTotalWin,
      tier: this.currentTier,
      winningPositions: this.currentWinningPositions,
      seqId: expectedSeqId
    })

    try {
      // Phase 1: SPOTLIGHT (optional)
      const hasSpotlight = response.events.some(e => e.type === 'spotlightWilds')
      if (hasSpotlight && !MotionPrefs.turboEnabled && !MotionPrefs.reduceMotion) {
        if (!this.isValid(expectedSeqId)) return
        await this.playSpotlight(response.events, expectedSeqId)
      }

      // Phase 2: HIGHLIGHT (mandatory)
      if (!this.isValid(expectedSeqId)) return
      await this.playHighlight(expectedSeqId)

      // Phase 3: CELEBRATION (tier-based)
      if (!this.isValid(expectedSeqId)) return
      if (this.currentTier !== 'none') {
        await this.playCelebration(bet, response.context?.currency ?? '$', expectedSeqId)
      }

      // Phase 4: RESET
      if (!this.isValid(expectedSeqId)) return
      this.reset(expectedSeqId)

    } catch (err) {
      this.log('run() error', err)
      // Ensure cleanup on error
      this.reset(expectedSeqId)
    }
  }

  /**
   * Cancel the current sequence immediately
   * Called on new spin, unmount, etc.
   */
  cancel(): void {
    if (this.phase === 'IDLE') return

    this.log('cancel()')

    // Increment seqId to invalidate any pending async operations
    this.seqId++

    // Synchronous cleanup
    this.cleanupAll()

    // Reset state
    this.phase = 'IDLE'
    this.currentWinningPositions = []
    this.currentTier = 'none'
    this.currentTotalWin = 0
    this.highlightCycleComplete = false

    // Notify completion
    this.callbacks.onComplete?.()
  }

  /**
   * Skip the current phase
   * - During HIGHLIGHT: accelerate to 4x speed (stage 1) or complete (stage 2)
   * - During CELEBRATION: complete immediately
   */
  skip(stage: 1 | 2 = 1): void {
    this.log('skip()', { stage, phase: this.phase })

    if (stage === 2 || this.phase === 'CELEBRATION') {
      // Stage 2 skip or celebration skip: complete immediately
      this.cancel()
    }
    // Stage 1 skip during HIGHLIGHT: handled by timeline acceleration in ScenarioRunner
  }

  // ==================== PHASE IMPLEMENTATIONS ====================

  /**
   * Phase 1: SPOTLIGHT
   * Play spotlight beam animation for wild positions
   */
  private async playSpotlight(events: GameEvent[], _expectedSeqId: number): Promise<void> {
    if (!this.spotlightEvent) return

    this.phase = 'SPOTLIGHT'
    this.log('playSpotlight() start')

    // Find spotlightWilds event
    const spotlightEvent = events.find(e => e.type === 'spotlightWilds') as SpotlightWildsEvent | undefined
    if (!spotlightEvent) return

    // Convert positions to grid coordinates
    const positions: SpotlightGridPosition[] = spotlightEvent.positions.map(idx => ({
      reel: Math.floor(idx / 3),
      row: idx % 3
    }))

    // Create results (all wilds for spotlight)
    const results: SpotlightEventResult[] = positions.map(() => ({ type: 'wild' as const }))

    // Play spotlight (respects internal timing, max ~300ms effective)
    await this.spotlightEvent.play(positions, results, 100, 100)  // Cell size will be set by PixiReelsRenderer

    this.log('playSpotlight() complete')
  }

  /**
   * Phase 2: HIGHLIGHT
   * Dim losing cells, highlight winning cells, start count-up audio
   */
  private async playHighlight(expectedSeqId: number): Promise<void> {
    this.phase = 'HIGHLIGHT'
    this.log('playHighlight() start')

    // Get min duration based on mode
    const minDuration = this.getHighlightDuration()

    // Show dim overlay on losing cells
    if (this.dimOverlay) {
      this.dimOverlay.show(this.currentWinningPositions, 'highlight')
    }

    // Start win line highlighter
    if (this.winLineHighlighter && this.currentWinningPositions.length > 0) {
      // Don't await - let it run in parallel with minimum duration
      this.winLineHighlighter.highlight(this.currentWinningPositions, minDuration).then(() => {
        this.highlightCycleComplete = true
      })
    } else {
      this.highlightCycleComplete = true
    }

    // Start count-up audio for non-small wins
    if (this.currentTier !== 'none') {
      audioService.startCoinRoll()
    }

    // Notify callback for HUD count-up
    this.callbacks.onHighlightStart?.(this.currentTotalWin, this.currentTier)

    // Wait for minimum duration
    const startTime = performance.now()
    await this.delay(minDuration)

    // Ensure at least one highlight cycle completed (unless cancelled)
    while (!this.highlightCycleComplete && this.isValid(expectedSeqId)) {
      await this.delay(50)
      if (performance.now() - startTime > minDuration * 2) {
        // Safety timeout
        break
      }
    }

    this.log('playHighlight() complete', { elapsed: performance.now() - startTime })
  }

  /**
   * Phase 3: CELEBRATION
   * Show BigWin overlay for BIG/MEGA/EPIC tiers
   */
  private async playCelebration(_bet: number, currencySymbol: string, _expectedSeqId: number): Promise<void> {
    if (!this.bigWinPresenter) {
      this.log('playCelebration() skipped - no presenter')
      return
    }

    this.phase = 'CELEBRATION'
    this.log('playCelebration() start', { tier: this.currentTier })

    // Notify callback
    this.callbacks.onCelebrationStart?.(this.currentTier)

    // Play tier stinger audio
    audioService.onWinTier(this.currentTier)

    // Update dim to celebration alpha (slightly darker)
    if (this.dimOverlay) {
      this.dimOverlay.show(this.currentWinningPositions, 'celebration')
    }

    // Convert tier to BigWinPresenter tier enum
    const bwpTier = this.toBWPTier(this.currentTier)

    // Present BigWin overlay
    await new Promise<void>((resolve) => {
      this.bigWinPresenter!.present({
        totalWin: this.currentTotalWin,
        tier: bwpTier,
        currencySymbol,
        onComplete: resolve
      })
    })

    this.log('playCelebration() complete')
  }

  /**
   * Phase 4: RESET
   * Clear all overlays, stop audio, return to idle
   */
  private reset(_expectedSeqId: number): void {
    this.phase = 'RESET'
    this.log('reset()')

    this.cleanupAll()

    this.phase = 'IDLE'
    this.currentWinningPositions = []
    this.currentTier = 'none'
    this.currentTotalWin = 0
    this.highlightCycleComplete = false

    // Notify completion
    this.callbacks.onComplete?.()
  }

  // ==================== HELPERS ====================

  /**
   * Validate sequence ID hasn't changed (cancellation check)
   */
  private isValid(expectedSeqId: number): boolean {
    return this.seqId === expectedSeqId
  }

  /**
   * Cleanup all visual/audio effects
   */
  private cleanupAll(): void {
    // Stop audio
    audioService.stopCoinRoll()

    // Hide dim overlay
    if (this.dimOverlay) {
      this.dimOverlay.hide()
    }

    // Clear win line highlighter
    if (this.winLineHighlighter) {
      this.winLineHighlighter.clear()
    }

    // Skip spotlight if active
    if (this.spotlightEvent?.active) {
      this.spotlightEvent.skip()
    }

    // Hide BigWin presenter
    if (this.bigWinPresenter?.active) {
      this.bigWinPresenter.skip()
    }
  }

  /**
   * Extract winning cell positions from winLine events
   * Returns flat indices (0-14)
   * @param _events - Game events (currently unused, will be used when protocol provides positions)
   */
  private extractWinningPositions(_events: GameEvent[]): number[] {
    const positions = new Set<number>()

    // For now, we don't have position data in winLine events
    // This would need to be added to the protocol or computed from grid
    // For demo purposes, use reveal grid to find symbols that match winning lines

    // TODO: When protocol provides winning positions, use them directly
    // For now, return empty array (will be populated when protocol is updated)

    return Array.from(positions)
  }

  /**
   * Compute win tier from winX
   */
  private computeTier(winX: number): WinTier {
    if (winX >= WIN_TIER_THRESHOLDS.EPIC) return 'epic'
    if (winX >= WIN_TIER_THRESHOLDS.MEGA) return 'mega'
    if (winX >= WIN_TIER_THRESHOLDS.BIG) return 'big'
    return 'none'
  }

  /**
   * Convert WinTier to BigWinPresenter tier enum
   */
  private toBWPTier(tier: WinTier): BWPTier {
    switch (tier) {
      case 'big': return BWPTier.BIG
      case 'mega': return BWPTier.MEGA
      case 'epic': return BWPTier.EPIC
      default: return BWPTier.NONE
    }
  }

  /**
   * Get highlight phase duration based on motion prefs
   */
  private getHighlightDuration(): number {
    if (MotionPrefs.reduceMotion) return PHASE_DURATION.HIGHLIGHT.REDUCE_MOTION
    if (MotionPrefs.turboEnabled) return PHASE_DURATION.HIGHLIGHT.TURBO
    return PHASE_DURATION.HIGHLIGHT.NORMAL
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Logging helper
   */
  private log(msg: string, data?: unknown): void {
    if (this._verbose && import.meta.env.DEV) {
      if (data) {
        console.log(`[WinSequenceV2] ${msg}`, data)
      } else {
        console.log(`[WinSequenceV2] ${msg}`)
      }
    }
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    this.cancel()
    this.dimOverlay = null
    this.winLineHighlighter = null
    this.spotlightEvent = null
    this.bigWinPresenter = null
  }
}

/** Singleton instance */
let _instance: WinSequenceV2 | null = null

/**
 * Get or create the WinSequenceV2 singleton
 */
export function getWinSequenceV2(): WinSequenceV2 {
  if (!_instance) {
    _instance = new WinSequenceV2()
  }
  return _instance
}

/**
 * Reset the singleton (for testing)
 */
export function resetWinSequenceV2(): void {
  if (_instance) {
    _instance.destroy()
    _instance = null
  }
}
