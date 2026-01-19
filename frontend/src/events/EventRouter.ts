/**
 * Event Router - maps backend events[] to animations
 * Events MUST be played in order per protocol_v1.md
 * Source of truth: protocol_v1.md Section 4
 */

import type { GameEvent } from '../types/events'
import {
  isRevealEvent,
  isWinLineEvent,
  isEnterFreeSpinsEvent,
  isHeatUpdateEvent,
  isEventStartEvent,
  isEventEndEvent,
  isSpotlightWildsEvent,
  isWinTierEvent,
  isBonusEndEvent,
  isAfterpartyMeterUpdateEvent
} from '../types/events'
import { Animations } from '../ux/animations/AnimationLibrary'
import type { TelemetryClient } from '../telemetry/TelemetryClient'
import { MotionPrefs } from '../ux/MotionPrefs'
import { winTierEffect, clearAllVFX, isVFXReady } from '../render/vfx'
import { audioService } from '../audio/AudioService'

/** Context for event processing */
export interface EventContext {
  roundId: string
  playerId: string
  betAmount: number
  telemetry: TelemetryClient
}

/** Event handler result */
export interface EventResult {
  type: string
  processed: boolean
  skipped?: boolean
}

/**
 * Routes backend events to appropriate animation handlers
 * Processes events sequentially in order (as required by protocol)
 */
export class EventRouter {
  private context: EventContext | null = null
  private isProcessing = false
  private skipRequested = false
  private currentGrid: number[][] | null = null

  /** Active event states for tracking */
  private activeEvents = new Set<string>()

  /** Set context for current spin */
  setContext(ctx: EventContext): void {
    this.context = ctx
  }

  /** Request skip (accelerates remaining animations) */
  requestSkip(): void {
    this.skipRequested = true
  }

  /** Check if currently processing events */
  get processing(): boolean {
    return this.isProcessing
  }

  /** Get current grid (after reveal) */
  getGrid(): number[][] | null {
    return this.currentGrid
  }

  /**
   * Process all events in order
   * Per protocol_v1.md: "Client MUST play events in the order returned"
   */
  async processEvents(events: GameEvent[]): Promise<EventResult[]> {
    if (this.isProcessing) {
      console.warn('[EventRouter] Already processing events')
      return []
    }

    this.isProcessing = true
    this.skipRequested = false
    const results: EventResult[] = []

    try {
      for (const event of events) {
        const result = await this.processEvent(event)
        results.push(result)

        // Check skip between events
        if (this.skipRequested) {
          // Mark remaining events as skipped but still process them quickly
          for (let i = results.length; i < events.length; i++) {
            const skippedEvent = events[i]
            const skippedResult = await this.processEventSkipped(skippedEvent)
            results.push({ ...skippedResult, skipped: true })
          }
          break
        }
      }
    } finally {
      this.isProcessing = false
    }

    return results
  }

  /**
   * Process a single event
   */
  private async processEvent(event: GameEvent): Promise<EventResult> {
    const type = event.type

    try {
      if (isRevealEvent(event)) {
        this.currentGrid = event.grid
        await Animations.revealGrid(event.grid)
      }
      else if (isSpotlightWildsEvent(event)) {
        await Animations.spotlightWilds(event.positions)
        this.logSpotlight(event.positions)
      }
      else if (isWinLineEvent(event)) {
        // Audio: play win_small for wins below big tier threshold
        // (Big/Mega/Epic wins are handled by winTier event)
        if (event.winX > 0 && event.winX < 20) {
          audioService.onWinSmall()
        }

        // Animation handles win line display
        // VFX highlight is called via Animations which coordinates with payline data
        await Animations.highlightWinLine(event.lineId, event.amount, event.winX)
      }
      else if (isEventStartEvent(event)) {
        this.activeEvents.add(event.eventType)
        await Animations.eventBanner(event.eventType, event.multiplier)
        this.logEventStart(event.eventType, event.reason)
      }
      else if (isEnterFreeSpinsEvent(event)) {
        // Audio: stop loops and play bonus enter sound
        audioService.onEnterFreeSpins()
        await Animations.enterFreeSpins(event.count)
        this.logBonusTriggered(event)
      }
      else if (isHeatUpdateEvent(event)) {
        await Animations.heatMeterUpdate(event.level)
      }
      else if (isBonusEndEvent(event)) {
        // Audio: play bonus end sound
        audioService.onBonusEnd()
        await this.handleBonusEnd(event)
      }
      else if (isEventEndEvent(event)) {
        this.activeEvents.delete(event.eventType)
        await Animations.eventBannerHide()
        this.logEventEnd(event.eventType)
      }
      else if (isWinTierEvent(event)) {
        if (event.tier !== 'none') {
          // Audio: play win tier stinger (handles ducking internally)
          audioService.onWinTier(event.tier)

          // Parallel: animation + VFX camera effects
          const animPromise = Animations.celebration(event.tier)
          const vfxPromise = isVFXReady() ? winTierEffect(event.tier) : Promise.resolve()
          await Promise.all([animPromise, vfxPromise])
          this.logWinTier(event.tier, event.winX)
        }
      }
      else if (isAfterpartyMeterUpdateEvent(event)) {
        // Meter update is informational, no direct animation
        this.logMeterUpdate(event.level)
      }
      else {
        // Unknown event type - ignore per protocol compatibility rules
        console.debug('[EventRouter] Unknown event type:', (event as { type: string }).type)
      }

      return { type, processed: true }
    } catch (error) {
      console.error('[EventRouter] Error processing event:', type, error)
      return { type, processed: false }
    }
  }

  /**
   * Process event in skipped mode (minimal/no animation)
   */
  private async processEventSkipped(event: GameEvent): Promise<EventResult> {
    const type = event.type

    // Clear VFX when skipping
    if (isVFXReady()) {
      clearAllVFX()
    }

    // Still update state for critical events
    if (isRevealEvent(event)) {
      this.currentGrid = event.grid
    }
    else if (isEventStartEvent(event)) {
      this.activeEvents.add(event.eventType)
    }
    else if (isEventEndEvent(event)) {
      this.activeEvents.delete(event.eventType)
    }

    return { type, processed: true }
  }

  /**
   * Handle bonus end with finale path animation
   */
  private async handleBonusEnd(event: import('../types/events').BonusEndEvent): Promise<void> {
    const bonusEvent = event

    // Finale animation based on path
    switch (bonusEvent.finalePath) {
      case 'upgrade':
        // "Afterhours Encore" - extra spins awarded
        await Animations.eventBanner('bonus')
        break
      case 'multiplier':
        // "Final Count Up" - multiplier applied
        await Animations.eventBanner('finale')
        break
      case 'standard':
      default:
        // Normal end
        break
    }

    // Log bonus end
    this.logBonusEnd(bonusEvent)
  }

  // --- Telemetry helpers ---

  private logSpotlight(positions: number[]): void {
    if (!this.context) return
    this.context.telemetry.logSpotlightApplied(
      this.context.roundId,
      positions.length,
      positions
    )
  }

  private logEventStart(type: string, reason: string): void {
    if (!this.context) return
    this.context.telemetry.logEventStart({
      type: type as 'boost' | 'rage' | 'explosive' | 'bonus' | 'finale',
      reason,
      mode: MotionPrefs.turboEnabled ? 'turbo' : 'normal',
      reduce_motion: MotionPrefs.reduceMotion,
      config_hash: ''
    })
  }

  private logEventEnd(type: string): void {
    if (!this.context) return
    this.context.telemetry.logEventEnd({
      type: type as 'boost' | 'rage' | 'explosive' | 'bonus' | 'finale',
      mode: MotionPrefs.turboEnabled ? 'turbo' : 'normal',
      reduce_motion: MotionPrefs.reduceMotion,
      config_hash: ''
    })
  }

  private logBonusTriggered(event: import('../types/events').EnterFreeSpinsEvent): void {
    if (!this.context) return
    this.context.telemetry.logBonusTriggered({
      bonus_type: 'freespins',
      bonus_is_bought: event.reason === 'buy_feature',
      bonus_variant: event.bonusVariant ?? 'standard',
      bonus_multiplier_applied: 1,
      config_hash: ''
    })
  }

  private logBonusEnd(event: import('../types/events').BonusEndEvent): void {
    if (!this.context) return
    this.context.telemetry.logBonusEnd({
      bonus_type: event.bonusType,
      bonus_is_bought: event.bonusVariant === 'vip_buy',
      bonus_variant: event.bonusVariant ?? 'standard',
      bonus_multiplier_applied: event.bonusMultiplierApplied ?? 1,
      bonus_total_win_x_pre_multiplier: event.totalWinXPreMultiplier ?? event.totalWinX,
      bonus_total_win_x_post_multiplier: event.totalWinX,
      total_win_x: event.totalWinX,
      finale_path: event.finalePath,
      config_hash: ''
    })
  }

  private logMeterUpdate(level: number): void {
    if (!this.context) return
    this.context.telemetry.logMeterUpdate(
      this.context.playerId,
      this.context.roundId,
      level
    )
  }

  private logWinTier(tier: import('../types/events').WinTier, winX: number): void {
    if (!this.context) return
    this.context.telemetry.logWinTier(this.context.roundId, tier, winX)
  }
}
