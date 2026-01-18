/**
 * Protocol types derived from protocol_v1.md
 * Source of truth: /protocol_v1.md
 */

/** Configuration returned from /init */
export interface Configuration {
  currency: string
  allowedBets: number[]
  enableBuyFeature: boolean
  buyFeatureCostMultiplier: number
  enableTurbo: boolean
  enableHypeModeAnteBet: boolean
  hypeModeCostIncrease: number
}

/** Restore state if player has unfinished free-spins */
export interface RestoreState {
  mode: 'FREE_SPINS'
  spinsRemaining: number
  heatLevel: number
}

/** Response from GET /init */
export interface InitResponse {
  protocolVersion: string
  configuration: Configuration
  restoreState: RestoreState | null
}

/** Request body for POST /spin */
export interface SpinRequest {
  clientRequestId: string
  betAmount: number
  mode: 'NORMAL' | 'BUY_FEATURE'
  hypeMode: boolean
}

/** Context included in spin response */
export interface SpinContext {
  currency: string
}

/** Outcome of a spin */
export interface Outcome {
  totalWin: number
  totalWinX: number
  isCapped: boolean
  capReason: 'max_win_base' | 'max_win_bonus' | 'max_exposure' | null
}

/** Next state after spin */
export interface NextState {
  mode: 'BASE' | 'FREE_SPINS'
  spinsRemaining: number
  heatLevel: number
}

/** Game event - see events.ts for full union type */
import type { GameEvent } from './events'

/** Response from POST /spin */
export interface SpinResponse {
  protocolVersion: string
  roundId: string
  context: SpinContext
  outcome: Outcome
  events: GameEvent[]
  nextState: NextState
}

/** Error object structure */
export interface ErrorInfo {
  code: ErrorCode
  message: string
  recoverable: boolean
}

/** Error response from server */
export interface ErrorResponse {
  protocolVersion: string
  error: ErrorInfo
}

/** Error codes from error_codes.md */
export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_BET'
  | 'FEATURE_DISABLED'
  | 'INSUFFICIENT_FUNDS'
  | 'ROUND_IN_PROGRESS'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RATE_LIMIT_EXCEEDED'
  | 'MAINTENANCE'
  | 'INTERNAL_ERROR'
  | 'NOT_IMPLEMENTED'
