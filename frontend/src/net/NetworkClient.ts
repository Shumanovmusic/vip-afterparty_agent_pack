/**
 * HTTP client with retry logic per error_codes.md
 * Source of truth: /protocol_v1.md, /error_codes.md
 */

import type {
  InitResponse,
  SpinRequest,
  SpinResponse,
  ErrorResponse,
  ErrorCode
} from '../types/protocol'

/** Network error event for UI handling */
export interface NetworkErrorEvent {
  code: ErrorCode | 'NETWORK_ERROR' | 'TIMEOUT'
  message: string
  recoverable: boolean
  httpStatus?: number
}

type ErrorListener = (error: NetworkErrorEvent) => void

/** Retry configuration per error_codes.md */
const RETRY_CONFIG = {
  // 409 ROUND_IN_PROGRESS: wait 500ms, retry 3x
  ROUND_IN_PROGRESS: { delay: 500, maxRetries: 3 },
  // 429 RATE_LIMIT_EXCEEDED: wait 1s, retry 2x
  RATE_LIMIT_EXCEEDED: { delay: 1000, maxRetries: 2 },
  // Network/5xx/INTERNAL_ERROR: backoff 1s/2s/4s, max 3 (per error_codes.md line 28)
  NETWORK_ERROR: { delay: 1000, maxRetries: 3, backoffMultiplier: 2 },
  // Request timeout
  TIMEOUT_MS: 10000
} as const

/**
 * Sleep for given milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Network client for VIP Afterparty API
 */
export class NetworkClient {
  private baseUrl: string
  private playerId: string
  private errorListeners: Set<ErrorListener> = new Set()

  constructor(baseUrl: string = '/api', playerId: string = 'dev-player') {
    this.baseUrl = baseUrl
    this.playerId = playerId
  }

  /** Set player ID for requests */
  setPlayerId(id: string): void {
    this.playerId = id
  }

  /** Subscribe to error events for UI handling */
  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  private emitError(error: NetworkErrorEvent): void {
    this.errorListeners.forEach(l => l(error))
  }

  /**
   * GET /init - Bootstrap client configuration
   */
  async init(): Promise<InitResponse> {
    return this.fetchWithRetry<InitResponse>('GET', '/init')
  }

  /**
   * POST /spin - Execute a spin
   */
  async spin(request: SpinRequest): Promise<SpinResponse> {
    return this.fetchWithRetry<SpinResponse>(
      'POST',
      '/spin',
      request,
      request.clientRequestId
    )
  }

  /**
   * Fetch with retry logic per error_codes.md
   */
  private async fetchWithRetry<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    idempotencyKey?: string
  ): Promise<T> {
    let lastError: NetworkErrorEvent | null = null
    let retryCount = 0

    // Max retries is the highest of all retry configs
    // ROUND_IN_PROGRESS: 3, RATE_LIMIT_EXCEEDED: 2, NETWORK_ERROR: 2
    const maxRetries = Math.max(
      RETRY_CONFIG.ROUND_IN_PROGRESS.maxRetries,
      RETRY_CONFIG.RATE_LIMIT_EXCEEDED.maxRetries,
      RETRY_CONFIG.NETWORK_ERROR.maxRetries
    )

    while (retryCount <= maxRetries) {
      try {
        const result = await this.doFetch<T>(method, path, body)
        return result
      } catch (error) {
        lastError = error as NetworkErrorEvent

        // Determine if we should retry
        const shouldRetry = this.shouldRetry(lastError, retryCount, idempotencyKey)
        if (!shouldRetry.retry) {
          break
        }

        // Wait before retry
        await sleep(shouldRetry.delay)
        retryCount++
      }
    }

    // All retries exhausted, emit error
    if (lastError) {
      this.emitError(lastError)
      throw lastError
    }

    throw new Error('Unknown error')
  }

  /**
   * Determine if we should retry based on error code
   */
  private shouldRetry(
    error: NetworkErrorEvent,
    currentRetry: number,
    _idempotencyKey?: string
  ): { retry: boolean; delay: number } {
    const code = error.code

    // 409 ROUND_IN_PROGRESS: retry 3x with 500ms delay
    if (code === 'ROUND_IN_PROGRESS') {
      if (currentRetry < RETRY_CONFIG.ROUND_IN_PROGRESS.maxRetries) {
        return { retry: true, delay: RETRY_CONFIG.ROUND_IN_PROGRESS.delay }
      }
    }

    // 429 RATE_LIMIT_EXCEEDED: retry 2x with 1s delay
    if (code === 'RATE_LIMIT_EXCEEDED') {
      if (currentRetry < RETRY_CONFIG.RATE_LIMIT_EXCEEDED.maxRetries) {
        return { retry: true, delay: RETRY_CONFIG.RATE_LIMIT_EXCEEDED.delay }
      }
    }

    // Network/timeout/5xx: retry with backoff
    if (code === 'NETWORK_ERROR' || code === 'TIMEOUT' || code === 'INTERNAL_ERROR') {
      if (currentRetry < RETRY_CONFIG.NETWORK_ERROR.maxRetries) {
        const delay = RETRY_CONFIG.NETWORK_ERROR.delay *
          Math.pow(RETRY_CONFIG.NETWORK_ERROR.backoffMultiplier, currentRetry)
        return { retry: true, delay }
      }
    }

    // No retry for other errors
    return { retry: false, delay: 0 }
  }

  /**
   * Execute single fetch request
   */
  private async doFetch<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const headers: Record<string, string> = {
      'X-Player-Id': this.playerId,
      'Content-Type': 'application/json'
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), RETRY_CONFIG.TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      })

      clearTimeout(timeout)

      if (response.ok) {
        return await response.json() as T
      }

      // Parse error response
      let errorData: ErrorResponse | null = null
      try {
        errorData = await response.json() as ErrorResponse
      } catch {
        // Could not parse error body
      }

      const errorEvent: NetworkErrorEvent = {
        code: errorData?.error.code ?? this.httpStatusToCode(response.status),
        message: errorData?.error.message ?? response.statusText,
        recoverable: errorData?.error.recoverable ?? false,
        httpStatus: response.status
      }

      throw errorEvent
    } catch (error) {
      clearTimeout(timeout)

      // Already a NetworkErrorEvent
      if (error && typeof error === 'object' && 'code' in error) {
        throw error
      }

      // AbortError = timeout
      if (error instanceof Error && error.name === 'AbortError') {
        throw {
          code: 'TIMEOUT',
          message: 'Request timed out',
          recoverable: true
        } as NetworkErrorEvent
      }

      // Network error
      throw {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network error',
        recoverable: true
      } as NetworkErrorEvent
    }
  }

  /**
   * Map HTTP status to error code (fallback)
   */
  private httpStatusToCode(status: number): ErrorCode | 'NETWORK_ERROR' {
    switch (status) {
      case 400: return 'INVALID_REQUEST'
      case 402: return 'INSUFFICIENT_FUNDS'
      case 409: return 'ROUND_IN_PROGRESS'
      case 429: return 'RATE_LIMIT_EXCEEDED'
      case 500: return 'INTERNAL_ERROR'
      case 501: return 'NOT_IMPLEMENTED'
      case 503: return 'MAINTENANCE'
      default: return 'NETWORK_ERROR'
    }
  }
}
