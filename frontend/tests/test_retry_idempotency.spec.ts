/**
 * Retry Idempotency Tests
 * Verifies: NetworkClient retries reuse SAME clientRequestId
 *           400/402 are never retried
 *           ROUND_IN_PROGRESS retries exactly 3 with 500ms delay policy
 * Source of truth: error_codes.md
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NetworkClient } from '../src/net/NetworkClient'

describe('NetworkClient Retry Idempotency', () => {
  let client: NetworkClient
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    client = new NetworkClient('http://localhost:8000', 'test-player')

    // Mock global fetch
    fetchMock = vi.fn()
    global.fetch = fetchMock
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('400/402 errors are NEVER retried (LAW)', () => {
    it('does NOT retry 400 INVALID_REQUEST', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          protocolVersion: '1.0',
          error: {
            code: 'INVALID_REQUEST',
            message: 'Bad request',
            recoverable: false
          }
        })
      })

      const spinPromise = client.spin({
        clientRequestId: 'test-uuid-1',
        betAmount: 1.0,
        mode: 'NORMAL',
        hypeMode: false
      })

      await expect(spinPromise).rejects.toMatchObject({
        code: 'INVALID_REQUEST'
      })

      // Should only be called once - no retry
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('does NOT retry 400 INVALID_BET', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          protocolVersion: '1.0',
          error: {
            code: 'INVALID_BET',
            message: 'Bet not allowed',
            recoverable: false
          }
        })
      })

      const spinPromise = client.spin({
        clientRequestId: 'test-uuid-2',
        betAmount: 999.0,
        mode: 'NORMAL',
        hypeMode: false
      })

      await expect(spinPromise).rejects.toMatchObject({
        code: 'INVALID_BET'
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('does NOT retry 402 INSUFFICIENT_FUNDS', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 402,
        json: () => Promise.resolve({
          protocolVersion: '1.0',
          error: {
            code: 'INSUFFICIENT_FUNDS',
            message: 'Not enough balance',
            recoverable: true
          }
        })
      })

      const spinPromise = client.spin({
        clientRequestId: 'test-uuid-3',
        betAmount: 1.0,
        mode: 'NORMAL',
        hypeMode: false
      })

      await expect(spinPromise).rejects.toMatchObject({
        code: 'INSUFFICIENT_FUNDS'
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('ROUND_IN_PROGRESS retries exactly 3 times with 500ms delay (LAW)', () => {
    it('retries 3 times with 500ms delay then fails', async () => {
      // All 4 calls return ROUND_IN_PROGRESS (initial + 3 retries)
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 409,
          json: () => Promise.resolve({
            protocolVersion: '1.0',
            error: {
              code: 'ROUND_IN_PROGRESS',
              message: 'Lock active',
              recoverable: true
            }
          })
        })
      }

      const spinPromise = client.spin({
        clientRequestId: 'idempotent-uuid',
        betAmount: 1.0,
        mode: 'NORMAL',
        hypeMode: false
      }).catch(e => e) // Catch rejection to prevent unhandled rejection warning

      // First call immediate
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // After 500ms - second call
      await vi.advanceTimersByTimeAsync(500)
      expect(fetchMock).toHaveBeenCalledTimes(2)

      // After another 500ms - third call
      await vi.advanceTimersByTimeAsync(500)
      expect(fetchMock).toHaveBeenCalledTimes(3)

      // After another 500ms - fourth call (last retry)
      await vi.advanceTimersByTimeAsync(500)
      expect(fetchMock).toHaveBeenCalledTimes(4)

      const result = await spinPromise
      expect(result).toMatchObject({
        code: 'ROUND_IN_PROGRESS'
      })

      // Exactly 4 calls: 1 initial + 3 retries
      expect(fetchMock).toHaveBeenCalledTimes(4)
    })

    it('succeeds on retry with same clientRequestId', async () => {
      // First two fail, third succeeds
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          json: () => Promise.resolve({
            protocolVersion: '1.0',
            error: { code: 'ROUND_IN_PROGRESS', message: 'Lock', recoverable: true }
          })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          json: () => Promise.resolve({
            protocolVersion: '1.0',
            error: { code: 'ROUND_IN_PROGRESS', message: 'Lock', recoverable: true }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            protocolVersion: '1.0',
            roundId: 'round-123',
            context: { currency: 'USD' },
            outcome: { totalWin: 0, totalWinX: 0, isCapped: false, capReason: null },
            events: [{ type: 'reveal', grid: [[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]] }],
            nextState: { mode: 'BASE', spinsRemaining: 0, heatLevel: 0 }
          })
        })

      const spinPromise = client.spin({
        clientRequestId: 'retry-uuid',
        betAmount: 1.0,
        mode: 'NORMAL',
        hypeMode: false
      })

      // Advance through retries
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(500)
      await vi.advanceTimersByTimeAsync(500)

      const result = await spinPromise

      expect(result.roundId).toBe('round-123')
      expect(fetchMock).toHaveBeenCalledTimes(3)

      // Verify ALL calls used same clientRequestId
      const calls = fetchMock.mock.calls
      for (const call of calls) {
        const body = JSON.parse(call[1].body)
        expect(body.clientRequestId).toBe('retry-uuid')
      }
    })
  })

  describe('RATE_LIMIT_EXCEEDED retries 2 times with 1s delay (LAW)', () => {
    it('retries 2 times with 1000ms delay', async () => {
      for (let i = 0; i < 3; i++) {
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: () => Promise.resolve({
            protocolVersion: '1.0',
            error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too fast', recoverable: true }
          })
        })
      }

      const spinPromise = client.spin({
        clientRequestId: 'rate-limit-uuid',
        betAmount: 1.0,
        mode: 'NORMAL',
        hypeMode: false
      }).catch(e => e) // Catch rejection to prevent unhandled rejection warning

      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1000)
      expect(fetchMock).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(1000)
      expect(fetchMock).toHaveBeenCalledTimes(3)

      const result = await spinPromise
      expect(result).toMatchObject({
        code: 'RATE_LIMIT_EXCEEDED'
      })

      // 1 initial + 2 retries = 3 total
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
  })

  describe('Network errors retry with backoff (LAW)', () => {
    it('retries network errors with exponential backoff', async () => {
      // First two fail with network error, third succeeds
      fetchMock
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            protocolVersion: '1.0',
            roundId: 'success-round',
            context: { currency: 'USD' },
            outcome: { totalWin: 0, totalWinX: 0, isCapped: false, capReason: null },
            events: [{ type: 'reveal', grid: [[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]] }],
            nextState: { mode: 'BASE', spinsRemaining: 0, heatLevel: 0 }
          })
        })

      const spinPromise = client.spin({
        clientRequestId: 'network-retry-uuid',
        betAmount: 1.0,
        mode: 'NORMAL',
        hypeMode: false
      })

      // First call immediate
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // After 1000ms - second call (backoff 1s)
      await vi.advanceTimersByTimeAsync(1000)
      expect(fetchMock).toHaveBeenCalledTimes(2)

      // After 2000ms - third call (backoff 2s)
      await vi.advanceTimersByTimeAsync(2000)
      expect(fetchMock).toHaveBeenCalledTimes(3)

      const result = await spinPromise
      expect(result.roundId).toBe('success-round')
    })

    it('exhausts all 3 retries with 1s, 2s, 4s delays on persistent 500 errors (LAW)', async () => {
      // All 4 calls return 500 errors (initial + 3 retries all fail)
      // Per error_codes.md line 28: INTERNAL_ERROR backoff 1s/2s/4s, max 3
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({
            protocolVersion: '1.0',
            error: { code: 'INTERNAL_ERROR', message: 'Server error', recoverable: true }
          })
        })
      }

      const spinPromise = client.spin({
        clientRequestId: 'backoff-exhaust-uuid',
        betAmount: 1.0,
        mode: 'NORMAL',
        hypeMode: false
      }).catch(e => e) // Catch rejection to prevent unhandled rejection warning

      // First call immediate
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // After 1000ms - second call (backoff 1s = 1000 * 2^0)
      await vi.advanceTimersByTimeAsync(1000)
      expect(fetchMock).toHaveBeenCalledTimes(2)

      // After 2000ms - third call (backoff 2s = 1000 * 2^1)
      await vi.advanceTimersByTimeAsync(2000)
      expect(fetchMock).toHaveBeenCalledTimes(3)

      // After 4000ms - fourth call (backoff 4s = 1000 * 2^2)
      await vi.advanceTimersByTimeAsync(4000)
      expect(fetchMock).toHaveBeenCalledTimes(4)

      const result = await spinPromise
      expect(result).toMatchObject({
        code: 'INTERNAL_ERROR'
      })

      // Exactly 4 calls: 1 initial + 3 retries (per error_codes.md line 28)
      expect(fetchMock).toHaveBeenCalledTimes(4)

      // Verify ALL calls used same clientRequestId
      const calls = fetchMock.mock.calls
      for (const call of calls) {
        const body = JSON.parse(call[1].body)
        expect(body.clientRequestId).toBe('backoff-exhaust-uuid')
      }
    })
  })

  describe('Idempotency key preserved across retries (LAW)', () => {
    it('all retry requests use the SAME clientRequestId', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({
            protocolVersion: '1.0',
            error: { code: 'INTERNAL_ERROR', message: 'Server error', recoverable: true }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            protocolVersion: '1.0',
            roundId: 'final-round',
            context: { currency: 'USD' },
            outcome: { totalWin: 5.0, totalWinX: 5.0, isCapped: false, capReason: null },
            events: [{ type: 'reveal', grid: [[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]] }],
            nextState: { mode: 'BASE', spinsRemaining: 0, heatLevel: 0 }
          })
        })

      const FIXED_REQUEST_ID = 'must-be-same-uuid'

      const spinPromise = client.spin({
        clientRequestId: FIXED_REQUEST_ID,
        betAmount: 1.0,
        mode: 'NORMAL',
        hypeMode: false
      })

      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(1000)

      await spinPromise

      // Verify both calls had same clientRequestId
      expect(fetchMock).toHaveBeenCalledTimes(2)

      const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body)
      const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body)

      expect(firstBody.clientRequestId).toBe(FIXED_REQUEST_ID)
      expect(secondBody.clientRequestId).toBe(FIXED_REQUEST_ID)
    })
  })
})
