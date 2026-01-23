/**
 * Scenario Runner - encodes SCENARIO_V1.md beats
 * Orchestrates the UX timeline for each spin cycle
 * Source of truth: SCENARIO_V1.md, UX_ANIMATION_SPEC.md
 */

import type { SpinResponse } from '../types/protocol'
import type { GameEvent, WinTier } from '../types/events'
import { EventRouter, EventContext } from '../events/EventRouter'
import { Animations } from './animations/AnimationLibrary'
import { MotionPrefs, TIMING } from './MotionPrefs'
import { Timeline } from './timeline/Timeline'
import type { TelemetryClient } from '../telemetry/TelemetryClient'
import { audioService } from '../audio/AudioService'
import { getWinSequenceV2, type WinSequenceV2 } from './WinSequenceV2'

/** Scenario runner callbacks for UI updates */
export interface ScenarioCallbacks {
  onSpinStart?: () => void
  onReelsSpinning?: () => void
  onReelsStopped?: () => void
  onEventsComplete?: () => void
  onCycleComplete?: () => void
  /** Called when highlight phase starts (for HUD count-up) */
  onHighlightStart?: (totalWin: number, tier: WinTier) => void
  /** Called when celebration phase starts */
  onCelebrationStart?: (tier: WinTier) => void
  /** Called when win sequence completes */
  onWinSequenceComplete?: () => void
}

/**
 * Runs the full spin scenario per SCENARIO_V1.md
 */
export class ScenarioRunner {
  private eventRouter: EventRouter
  private telemetry: TelemetryClient
  private playerId: string
  private callbacks: ScenarioCallbacks = {}
  private isRunning = false
  private timeline: Timeline | null = null
  /** 2-stage skip: 0=none, 1=accelerate, 2=complete */
  private skipCount: 0 | 1 | 2 = 0
  /** Win sequence presenter (v2) */
  private winSequence: WinSequenceV2

  constructor(telemetry: TelemetryClient, playerId: string) {
    this.eventRouter = new EventRouter()
    this.telemetry = telemetry
    this.playerId = playerId
    this.winSequence = getWinSequenceV2()

    // Wire up WinSequenceV2 callbacks
    this.winSequence.setCallbacks({
      onHighlightStart: (totalWin, tier) => {
        this.callbacks.onHighlightStart?.(totalWin, tier)
      },
      onCelebrationStart: (tier) => {
        this.callbacks.onCelebrationStart?.(tier)
      },
      onComplete: () => {
        this.callbacks.onWinSequenceComplete?.()
      }
    })
  }

  /**
   * Get WinSequenceV2 instance for component injection
   */
  getWinSequence(): WinSequenceV2 {
    return this.winSequence
  }

  /** Set scenario callbacks */
  setCallbacks(callbacks: ScenarioCallbacks): void {
    this.callbacks = callbacks
  }

  /** Check if scenario is running */
  get running(): boolean {
    return this.isRunning
  }

  /** Check if win sequence presentation is active */
  get winSequenceBusy(): boolean {
    return this.winSequence.isBusy()
  }

  /**
   * Request skip (user interaction during animations)
   * 2-stage skip behavior:
   * - First click: Accelerate timeline (4x speed)
   * - Second click: Complete immediately
   */
  skip(): void {
    if (this.skipCount === 0) {
      // First skip: accelerate
      this.skipCount = 1
      if (this.timeline) {
        this.timeline.setTimeScale(4)
      }

      // WinSequenceV2: stage 1 skip (accelerate)
      this.winSequence.skip(1)

      // Audio: first skip just accelerates, loop can continue
      audioService.onSkipAccelerate()

      // Log accelerate
      this.telemetry.logAnimationSkipped({
        type: 'celebration',
        mode: MotionPrefs.turboEnabled ? 'turbo' : 'normal',
        reduce_motion: MotionPrefs.reduceMotion
      })
    } else if (this.skipCount === 1) {
      // Second skip: complete immediately
      this.skipCount = 2
      if (this.timeline) {
        this.timeline.skip()
      }
      this.eventRouter.requestSkip()

      // WinSequenceV2: stage 2 skip (complete)
      this.winSequence.skip(2)

      // Audio: second skip stops all loops immediately
      audioService.onSkipComplete()

      // Log complete skip
      this.telemetry.logAnimationSkipped({
        type: 'celebration',
        mode: MotionPrefs.turboEnabled ? 'turbo' : 'normal',
        reduce_motion: MotionPrefs.reduceMotion
      })
    }
    // skipCount === 2: already completed, ignore further skips
  }

  /** Get current skip stage (for testing) */
  get skipStage(): 0 | 1 | 2 {
    return this.skipCount
  }

  /**
   * Run the full spin scenario
   * Implements Scene B from SCENARIO_V1.md
   */
  async runSpinScenario(response: SpinResponse, betAmount: number): Promise<void> {
    if (this.isRunning) {
      console.warn('[ScenarioRunner] Already running')
      return
    }

    // Cancel any running win sequence from previous spin
    this.winSequence.cancel()

    this.isRunning = true
    this.skipCount = 0  // Reset 2-stage skip
    const startTime = performance.now()

    try {
      // Set context for event router
      const context: EventContext = {
        roundId: response.roundId,
        playerId: this.playerId,
        betAmount,
        telemetry: this.telemetry
      }
      this.eventRouter.setContext(context)

      // === Scene B1: Spin Start (T+0ms) ===
      this.callbacks.onSpinStart?.()
      await this.runSpinStartScene()

      // === Scene B2: Reel Stop (T+600-1000ms) ===
      this.callbacks.onReelsSpinning?.()
      await this.runReelStopScene()

      // === Process Events (reveal, wins, etc.) ===
      await this.processEvents(response.events)

      // === Present Win Result (if any) ===
      if (response.outcome.totalWin > 0) {
        // Get currency symbol from context (fallback to $)
        const currencySymbol = response.context?.currency ?? '$'
        Animations.presentWinResult(response.outcome.totalWin, [], currencySymbol)
      }

      // Stop spin loop after reels revealed
      audioService.onReelsComplete()
      this.callbacks.onReelsStopped?.()

      // === Run WinSequenceV2 (HIGHLIGHT → CELEBRATION → RESET) ===
      // This replaces the old checkCelebrations() flow
      if (response.outcome.totalWin > 0) {
        await this.winSequence.run(response, betAmount)
      }

      // === Events complete ===
      this.callbacks.onEventsComplete?.()

      // === Log result ===
      const spinLoopMs = performance.now() - startTime
      this.logSpinResult(response, betAmount, spinLoopMs)

    } finally {
      this.isRunning = false
      this.timeline = null

      // Ensure audio is cleaned up on any exit (error or complete)
      audioService.onReelsComplete()

      this.callbacks.onCycleComplete?.()
    }
  }

  /**
   * Scene B1: Spin Start
   * - Spin pressed feedback instant (<=50ms)
   * - Reels: strong blur/motion
   * - Audio: start reel spin loop
   */
  private async runSpinStartScene(): Promise<void> {
    this.timeline = new Timeline()

    if (MotionPrefs.turboEnabled) {
      this.timeline.setTimeScale(2)
    }

    // Start audio loop for spin
    audioService.onSpinStart()

    this.timeline.add(async () => {
      await Animations.allReelsSpinStart()
    }, 0, 'spin-start')

    await this.timeline.run()
  }

  /**
   * Scene B2: Reel Stop
   * - Stop left to right
   * - Bounce on stop (if enabled)
   */
  private async runReelStopScene(): Promise<void> {
    // Reels stop during event processing (reveal event)
    // Wait for spin duration before events
    const spinDuration = MotionPrefs.getSpinDuration()
    await this.delay(spinDuration - TIMING.SPIN_BUTTON_FEEDBACK_MS)
  }

  /**
   * Process all events via EventRouter
   */
  private async processEvents(events: GameEvent[]): Promise<void> {
    await this.eventRouter.processEvents(events)
  }

  /**
   * Log spin result telemetry
   */
  private logSpinResult(response: SpinResponse, _betAmount: number, spinLoopMs: number): void {
    const hasSpotlight = response.events.some(e => e.type === 'spotlightWilds')
    const spotlightEvent = response.events.find(e => e.type === 'spotlightWilds')

    this.telemetry.logSpinResult({
      win_x: response.outcome.totalWinX,
      is_bonus: response.nextState.mode === 'FREE_SPINS',
      anticipation_used: false, // Would be tracked separately
      spotlight_used: hasSpotlight,
      spotlight_count: spotlightEvent && 'count' in spotlightEvent ? spotlightEvent.count : 0,
      teaser_used: false, // Would be tracked by velvet rope logic
      teaser_type: 'none',
      hype_mode_enabled: false, // Would come from spin request
      mode: MotionPrefs.turboEnabled ? 'turbo' : 'normal',
      reduce_motion: MotionPrefs.reduceMotion,
      config_hash: '',
      win_tier: MotionPrefs.getWinTier(response.outcome.totalWinX)
    }, spinLoopMs)
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
