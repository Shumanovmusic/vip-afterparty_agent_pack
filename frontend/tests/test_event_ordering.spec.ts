/**
 * Event Ordering Tests
 * Verifies: EventRouter processes events in array order (no sort/group)
 *           ScenarioRunner executes timeline steps in correct sequence
 * Source of truth: protocol_v1.md Section 4, SCENARIO_V1.md
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventRouter } from '../src/events/EventRouter'
import type { GameEvent } from '../src/types/events'

// Mock the Animations module
vi.mock('../src/ux/animations/AnimationLibrary', () => ({
  Animations: {
    revealGrid: vi.fn().mockResolvedValue(undefined),
    spotlightWilds: vi.fn().mockResolvedValue(undefined),
    highlightWinLine: vi.fn().mockResolvedValue(undefined),
    eventBanner: vi.fn().mockResolvedValue(undefined),
    eventBannerHide: vi.fn().mockResolvedValue(undefined),
    enterFreeSpins: vi.fn().mockResolvedValue(undefined),
    heatMeterUpdate: vi.fn().mockResolvedValue(undefined),
    celebration: vi.fn().mockResolvedValue(undefined),
    allReelsSpinStart: vi.fn().mockResolvedValue(undefined),
    reelStop: vi.fn().mockResolvedValue(undefined)
  }
}))

// Mock TelemetryClient
const mockTelemetry = {
  logSpotlightApplied: vi.fn(),
  logEventStart: vi.fn(),
  logEventEnd: vi.fn(),
  logBonusTriggered: vi.fn(),
  logBonusEnd: vi.fn(),
  logMeterUpdate: vi.fn(),
  logWinTier: vi.fn()
}

describe('EventRouter Event Ordering', () => {
  let router: EventRouter
  let callOrder: string[]

  beforeEach(async () => {
    vi.clearAllMocks()
    callOrder = []

    // Get mocked animations
    const { Animations } = await import('../src/ux/animations/AnimationLibrary')

    // Track call order
    vi.mocked(Animations.revealGrid).mockImplementation(async () => {
      callOrder.push('reveal')
    })
    vi.mocked(Animations.spotlightWilds).mockImplementation(async () => {
      callOrder.push('spotlightWilds')
    })
    vi.mocked(Animations.highlightWinLine).mockImplementation(async () => {
      callOrder.push('winLine')
    })
    vi.mocked(Animations.eventBanner).mockImplementation(async () => {
      callOrder.push('eventBanner')
    })
    vi.mocked(Animations.enterFreeSpins).mockImplementation(async () => {
      callOrder.push('enterFreeSpins')
    })
    vi.mocked(Animations.heatMeterUpdate).mockImplementation(async () => {
      callOrder.push('heatUpdate')
    })
    vi.mocked(Animations.celebration).mockImplementation(async () => {
      callOrder.push('celebration')
    })
    vi.mocked(Animations.eventBannerHide).mockImplementation(async () => {
      callOrder.push('eventBannerHide')
    })

    router = new EventRouter()
    router.setContext({
      roundId: 'test-round',
      playerId: 'test-player',
      betAmount: 1.0,
      telemetry: mockTelemetry as any
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Events processed in array order (LAW)', () => {
    it('processes events in exact array order - no sorting', async () => {
      const events: GameEvent[] = [
        { type: 'reveal', grid: [[1,2,3],[4,5,6],[7,8,9],[1,2,3],[4,5,6]] },
        { type: 'spotlightWilds', positions: [0, 1], count: 2 },
        { type: 'winLine', lineId: 1, amount: 5.0, winX: 5.0 },
        { type: 'heatUpdate', level: 3 }
      ]

      await router.processEvents(events)

      expect(callOrder).toEqual([
        'reveal',
        'spotlightWilds',
        'winLine',
        'heatUpdate'
      ])
    })

    it('does NOT reorder events even if out of typical sequence', async () => {
      // Intentionally "wrong" order - router must NOT fix it
      const events: GameEvent[] = [
        { type: 'winLine', lineId: 1, amount: 5.0, winX: 5.0 },
        { type: 'reveal', grid: [[1,2,3],[4,5,6],[7,8,9],[1,2,3],[4,5,6]] },
        { type: 'heatUpdate', level: 1 },
        { type: 'spotlightWilds', positions: [0], count: 1 }
      ]

      await router.processEvents(events)

      // Must be in array order, NOT sorted to "correct" order
      expect(callOrder).toEqual([
        'winLine',
        'reveal',
        'heatUpdate',
        'spotlightWilds'
      ])
    })

    it('processes eventStart/eventEnd in order', async () => {
      const events: GameEvent[] = [
        { type: 'reveal', grid: [[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]] },
        { type: 'eventStart', eventType: 'boost', reason: 'heat', durationSpins: 5 },
        { type: 'winLine', lineId: 1, amount: 10.0, winX: 10.0 },
        { type: 'eventEnd', eventType: 'boost' }
      ]

      await router.processEvents(events)

      expect(callOrder).toEqual([
        'reveal',
        'eventBanner',
        'winLine',
        'eventBannerHide'
      ])
    })

    it('processes free spins sequence correctly', async () => {
      const events: GameEvent[] = [
        { type: 'eventStart', eventType: 'bonus', reason: 'scatter', durationSpins: 10 },
        { type: 'enterFreeSpins', count: 10, reason: 'scatter' },
        { type: 'reveal', grid: [[8,8,8],[8,8,8],[8,8,8],[8,8,8],[8,8,8]] },
        { type: 'heatUpdate', level: 5 }
      ]

      await router.processEvents(events)

      expect(callOrder).toEqual([
        'eventBanner',
        'enterFreeSpins',
        'reveal',
        'heatUpdate'
      ])
    })

    it('handles VIP buy sequence from fixture', async () => {
      // Events from spin_vip_buy.json (simplified)
      const events: GameEvent[] = [
        { type: 'eventStart', eventType: 'bonus', reason: 'buy_feature', durationSpins: 10 },
        { type: 'enterFreeSpins', count: 10, reason: 'buy_feature', bonusVariant: 'vip_buy' },
        { type: 'reveal', grid: [[8,8,8],[8,8,8],[8,8,8],[8,8,8],[8,8,8]] },
        { type: 'spotlightWilds', positions: [0,1,2,3,4], count: 5 },
        { type: 'winLine', lineId: 1, amount: 38.0, winX: 38.0 },
        { type: 'heatUpdate', level: 10 },
        {
          type: 'bonusEnd',
          bonusType: 'freespins',
          finalePath: 'upgrade',
          totalWinX: 418.0,
          bonusVariant: 'vip_buy',
          bonusMultiplierApplied: 11,
          totalWinXPreMultiplier: 38.0
        },
        { type: 'eventEnd', eventType: 'bonus' },
        { type: 'winTier', tier: 'mega', winX: 418.0 }
      ]

      await router.processEvents(events)

      // Verify exact order matches event array
      expect(callOrder).toEqual([
        'eventBanner',      // eventStart
        'enterFreeSpins',   // enterFreeSpins
        'reveal',           // reveal
        'spotlightWilds',   // spotlightWilds
        'winLine',          // winLine
        'heatUpdate',       // heatUpdate
        'eventBanner',      // bonusEnd (shows finale banner)
        'eventBannerHide',  // eventEnd
        'celebration'       // winTier mega
      ])
    })
  })

  describe('Event results track processing', () => {
    it('returns result for each event', async () => {
      const events: GameEvent[] = [
        { type: 'reveal', grid: [[1,2,3],[4,5,6],[7,8,9],[1,2,3],[4,5,6]] },
        { type: 'winLine', lineId: 1, amount: 2.5, winX: 2.5 }
      ]

      const results = await router.processEvents(events)

      expect(results).toHaveLength(2)
      expect(results[0]).toEqual({ type: 'reveal', processed: true })
      expect(results[1]).toEqual({ type: 'winLine', processed: true })
    })

    it('stores grid from reveal event', async () => {
      const grid = [[1,2,3],[4,5,6],[7,8,9],[1,2,3],[4,5,6]]
      const events: GameEvent[] = [
        { type: 'reveal', grid }
      ]

      expect(router.getGrid()).toBeNull()
      await router.processEvents(events)
      expect(router.getGrid()).toEqual(grid)
    })
  })

  describe('Skip handling preserves order', () => {
    it('marks remaining events as skipped after skip request', async () => {
      // Make reveal trigger skip
      const { Animations } = await import('../src/ux/animations/AnimationLibrary')
      vi.mocked(Animations.revealGrid).mockImplementation(async () => {
        callOrder.push('reveal')
        router.requestSkip()
      })

      const events: GameEvent[] = [
        { type: 'reveal', grid: [[1,2,3],[4,5,6],[7,8,9],[1,2,3],[4,5,6]] },
        { type: 'winLine', lineId: 1, amount: 2.5, winX: 2.5 },
        { type: 'heatUpdate', level: 1 }
      ]

      const results = await router.processEvents(events)

      // First event processed normally
      expect(results[0]).toEqual({ type: 'reveal', processed: true })
      // Remaining events marked as skipped
      expect(results[1]).toEqual({ type: 'winLine', processed: true, skipped: true })
      expect(results[2]).toEqual({ type: 'heatUpdate', processed: true, skipped: true })

      // Only reveal animation was called
      expect(callOrder).toEqual(['reveal'])
    })
  })

  describe('winTier "none" does not animate (LAW)', () => {
    it('skips celebration for tier=none', async () => {
      const events: GameEvent[] = [
        { type: 'reveal', grid: [[1,2,3],[4,5,6],[7,8,9],[1,2,3],[4,5,6]] },
        { type: 'winTier', tier: 'none', winX: 0 }
      ]

      await router.processEvents(events)

      expect(callOrder).toEqual(['reveal'])
      // No celebration for 'none' tier
    })

    it('shows celebration for non-none tiers', async () => {
      const events: GameEvent[] = [
        { type: 'reveal', grid: [[1,2,3],[4,5,6],[7,8,9],[1,2,3],[4,5,6]] },
        { type: 'winTier', tier: 'big', winX: 10 }
      ]

      await router.processEvents(events)

      expect(callOrder).toEqual(['reveal', 'celebration'])
    })
  })
})
