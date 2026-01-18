/**
 * Smoke Fetch Tests
 * Verifies: NetworkClient correctly parses /init and /spin responses
 *           Uses mocked fetch with test fixtures
 * Source of truth: protocol_v1.md
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NetworkClient } from '../src/net/NetworkClient'
import initResponse from './fixtures/init_response.json'
import spinMinimal from './fixtures/spin_minimal.json'
import spinVipBuy from './fixtures/spin_vip_buy.json'

describe('NetworkClient Smoke Tests', () => {
  let client: NetworkClient
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    client = new NetworkClient('http://localhost:8000', 'test-player')
    fetchMock = vi.fn()
    global.fetch = fetchMock
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('GET /init', () => {
    it('parses init response correctly', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(initResponse)
      })

      const result = await client.init()

      expect(result.protocolVersion).toBe('1.0')
      expect(result.configuration).toBeDefined()
      expect(result.configuration.currency).toBe('USD')
      expect(result.configuration.allowedBets).toEqual([0.10, 0.20, 0.50, 1.00, 2.00, 5.00, 10.00])
      expect(result.configuration.enableBuyFeature).toBe(true)
      expect(result.configuration.buyFeatureCostMultiplier).toBe(100)
      expect(result.configuration.enableTurbo).toBe(true)
      expect(result.configuration.enableHypeModeAnteBet).toBe(true)
      expect(result.configuration.hypeModeCostIncrease).toBe(0.25)
      expect(result.restoreState).toBeNull()
    })

    it('sends correct headers', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(initResponse)
      })

      await client.init()

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/init',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'X-Player-Id': 'test-player',
            'Content-Type': 'application/json'
          }
        })
      )
    })
  })

  describe('POST /spin - Minimal Response', () => {
    it('parses minimal spin response correctly', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(spinMinimal)
      })

      const result = await client.spin({
        clientRequestId: 'test-uuid',
        betAmount: 1.0,
        mode: 'NORMAL',
        hypeMode: false
      })

      expect(result.protocolVersion).toBe('1.0')
      expect(result.roundId).toBe('550e8400-e29b-41d4-a716-446655440001')
      expect(result.context.currency).toBe('USD')
      expect(result.outcome.totalWin).toBe(2.50)
      expect(result.outcome.totalWinX).toBe(2.5)
      expect(result.outcome.isCapped).toBe(false)
      expect(result.outcome.capReason).toBeNull()
      expect(result.events).toHaveLength(3)
      expect(result.nextState.mode).toBe('BASE')
      expect(result.nextState.spinsRemaining).toBe(0)
      expect(result.nextState.heatLevel).toBe(1)
    })

    it('includes events in correct order from fixture', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(spinMinimal)
      })

      const result = await client.spin({
        clientRequestId: 'test-uuid',
        betAmount: 1.0,
        mode: 'NORMAL',
        hypeMode: false
      })

      expect(result.events[0].type).toBe('reveal')
      expect(result.events[1].type).toBe('winLine')
      expect(result.events[2].type).toBe('heatUpdate')
    })

    it('sends correct headers and body', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(spinMinimal)
      })

      await client.spin({
        clientRequestId: 'idempotent-key-123',
        betAmount: 1.0,
        mode: 'NORMAL',
        hypeMode: false
      })

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/spin',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'X-Player-Id': 'test-player',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            clientRequestId: 'idempotent-key-123',
            betAmount: 1.0,
            mode: 'NORMAL',
            hypeMode: false
          })
        })
      )
    })
  })

  describe('POST /spin - VIP Buy Response', () => {
    it('parses VIP buy spin response correctly', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(spinVipBuy)
      })

      const result = await client.spin({
        clientRequestId: 'vip-buy-uuid',
        betAmount: 100.0,
        mode: 'BUY_FEATURE',
        hypeMode: false
      })

      expect(result.roundId).toBe('550e8400-e29b-41d4-a716-446655440002')
      expect(result.outcome.totalWin).toBe(418.0)
      expect(result.outcome.totalWinX).toBe(418.0)
      expect(result.events).toHaveLength(9)
      expect(result.nextState.heatLevel).toBe(10)
    })

    it('includes bonus events in correct order', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(spinVipBuy)
      })

      const result = await client.spin({
        clientRequestId: 'vip-buy-uuid',
        betAmount: 100.0,
        mode: 'BUY_FEATURE',
        hypeMode: false
      })

      // Per spin_vip_buy.json event order
      expect(result.events[0].type).toBe('eventStart')
      expect(result.events[1].type).toBe('enterFreeSpins')
      expect(result.events[2].type).toBe('reveal')
      expect(result.events[3].type).toBe('spotlightWilds')
      expect(result.events[4].type).toBe('winLine')
      expect(result.events[5].type).toBe('heatUpdate')
      expect(result.events[6].type).toBe('bonusEnd')
      expect(result.events[7].type).toBe('eventEnd')
      expect(result.events[8].type).toBe('winTier')
    })

    it('parses bonusEnd event fields', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(spinVipBuy)
      })

      const result = await client.spin({
        clientRequestId: 'vip-buy-uuid',
        betAmount: 100.0,
        mode: 'BUY_FEATURE',
        hypeMode: false
      })

      const bonusEnd = result.events.find(e => e.type === 'bonusEnd')
      expect(bonusEnd).toBeDefined()
      if (bonusEnd && bonusEnd.type === 'bonusEnd') {
        expect(bonusEnd.bonusType).toBe('freespins')
        expect(bonusEnd.finalePath).toBe('upgrade')
        expect(bonusEnd.totalWinX).toBe(418.0)
        expect(bonusEnd.bonusVariant).toBe('vip_buy')
        expect(bonusEnd.bonusMultiplierApplied).toBe(11)
        expect(bonusEnd.totalWinXPreMultiplier).toBe(38.0)
      }
    })

    it('parses winTier event', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(spinVipBuy)
      })

      const result = await client.spin({
        clientRequestId: 'vip-buy-uuid',
        betAmount: 100.0,
        mode: 'BUY_FEATURE',
        hypeMode: false
      })

      const winTier = result.events.find(e => e.type === 'winTier')
      expect(winTier).toBeDefined()
      if (winTier && winTier.type === 'winTier') {
        expect(winTier.tier).toBe('mega')
        expect(winTier.winX).toBe(418.0)
      }
    })
  })

  describe('Error listener', () => {
    it('emits error event on failure after retries', async () => {
      // All retries fail (initial + 3 retries per error_codes.md line 28)
      for (let i = 0; i < 5; i++) {
        fetchMock.mockRejectedValueOnce(new Error('Network error'))
      }

      const errors: Array<{ code: string; message: string }> = []
      client.onError(err => errors.push({ code: err.code, message: err.message }))

      const spinPromise = client.spin({
        clientRequestId: 'error-test-uuid',
        betAmount: 1.0,
        mode: 'NORMAL',
        hypeMode: false
      }).catch(e => e) // Catch rejection to prevent unhandled rejection warning

      // Advance through retries: 1s, 2s, 4s backoff (per error_codes.md line 28)
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(4000)

      const result = await spinPromise
      expect(result).toMatchObject({
        code: 'NETWORK_ERROR'
      })

      expect(errors).toHaveLength(1)
      expect(errors[0].code).toBe('NETWORK_ERROR')
    })

    it('unsubscribe stops listener', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          protocolVersion: '1.0',
          error: { code: 'INVALID_REQUEST', message: 'Bad', recoverable: false }
        })
      })

      const errors: string[] = []
      const unsub = client.onError(err => errors.push(err.code))
      unsub()

      await expect(client.spin({
        clientRequestId: 'test',
        betAmount: 1.0,
        mode: 'NORMAL',
        hypeMode: false
      })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })

      expect(errors).toHaveLength(0) // Listener was unsubscribed
    })
  })

  describe('Player ID', () => {
    it('uses configured player ID in header', async () => {
      client.setPlayerId('custom-player-456')

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(initResponse)
      })

      await client.init()

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Player-Id': 'custom-player-456'
          })
        })
      )
    })
  })
})
