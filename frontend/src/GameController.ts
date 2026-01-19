/**
 * GameController - Main orchestrator
 * Coordinates network, state machine, events, and scenario runner
 */

import { v4 as uuidv4 } from 'uuid'
import type { Configuration } from './types/protocol'
import { NetworkClient, NetworkErrorEvent } from './net/NetworkClient'
import { GameStateMachine, GameState } from './state/GameStateMachine'
import { ScenarioRunner } from './ux/ScenarioRunner'
import { TelemetryClient } from './telemetry/TelemetryClient'
import { MotionPrefs } from './ux/MotionPrefs'
import { audioService } from './audio/AudioService'

type SpinStartListener = () => void
type ErrorListener = (error: NetworkErrorEvent) => void
type StateChangeListener = (from: GameState, to: GameState) => void

/**
 * Main game controller
 */
export class GameController {
  private network: NetworkClient
  private _stateMachine: GameStateMachine
  private scenarioRunner: ScenarioRunner
  private telemetry: TelemetryClient

  private _configuration: Configuration | null = null
  private _playerId: string

  // Event listeners
  private spinStartListeners: Set<SpinStartListener> = new Set()
  private errorListeners: Set<ErrorListener> = new Set()

  constructor(playerId: string = 'dev-player') {
    this._playerId = playerId

    // Initialize components
    this.network = new NetworkClient('/api', playerId)
    this._stateMachine = new GameStateMachine()
    this.telemetry = new TelemetryClient()
    this.scenarioRunner = new ScenarioRunner(this.telemetry, playerId)

    // Wire up error handling
    this.network.onError((error) => {
      this.handleNetworkError(error)
    })
  }

  // --- Getters ---

  get configuration(): Configuration | null {
    return this._configuration
  }

  get allowedBets(): number[] {
    return this._configuration?.allowedBets || [1.00]
  }

  get stateMachine(): GameStateMachine {
    return this._stateMachine
  }

  get playerId(): string {
    return this._playerId
  }

  // --- Boot Sequence ---

  /**
   * Boot the game
   * GET /init, store configuration, transition to IDLE
   */
  async boot(): Promise<void> {
    try {
      // Initialize audio service (non-blocking, safe to fail)
      audioService.init(this.telemetry).catch(err => {
        console.warn('[GameController] Audio init failed (non-fatal):', err)
      })

      const response = await this.network.init()

      // Store configuration
      this._configuration = response.configuration

      // Generate config hash for telemetry
      const configHash = TelemetryClient.generateConfigHash(response.configuration as unknown as Record<string, unknown>)
      this.telemetry.setConfigHash(configHash)

      // Handle restore state if present
      if (response.restoreState) {
        console.log('[GameController] Restore state:', response.restoreState)
        // TODO: Apply restore state (mode, spinsRemaining, heatLevel)
      }

      // Transition to IDLE
      this._stateMachine.initialize()

      console.log('[GameController] Boot complete', {
        protocolVersion: response.protocolVersion,
        currency: response.configuration.currency,
        bets: response.configuration.allowedBets
      })
    } catch (error) {
      console.error('[GameController] Boot failed:', error)
      throw error
    }
  }

  // --- Spin Control ---

  /**
   * Can a spin be requested?
   */
  canSpin(): boolean {
    return this._stateMachine.canSpin()
  }

  /**
   * Request a spin
   */
  async requestSpin(betAmount: number, hypeMode: boolean = false): Promise<void> {
    if (!this.canSpin()) {
      console.warn('[GameController] Cannot spin in current state')
      return
    }

    // Validate bet
    if (!this.allowedBets.includes(betAmount)) {
      console.error('[GameController] Invalid bet amount:', betAmount)
      return
    }

    const clientRequestId = uuidv4()

    try {
      // Transition: IDLE -> SPIN_REQ
      this._stateMachine.startSpinRequest()
      this.notifySpinStart()

      // Log telemetry
      this.telemetry.logSpinStart({
        mode: MotionPrefs.turboEnabled ? 'turbo' : 'normal',
        reduce_motion: MotionPrefs.reduceMotion,
        config_hash: ''
      })

      // Send request
      this._stateMachine.spinSent()

      const response = await this.network.spin({
        clientRequestId,
        betAmount,
        mode: 'NORMAL',
        hypeMode
      })

      // Transition: SPINNING -> RESULT
      this._stateMachine.spinResult()

      // Run scenario (animations)
      await this.scenarioRunner.runSpinScenario(response, betAmount)

      // Transition: RESULT -> IDLE
      this._stateMachine.resultComplete()

    } catch (error) {
      console.error('[GameController] Spin error:', error)
      this._stateMachine.spinError()
    }
  }

  /**
   * Request buy feature
   */
  async requestBuyFeature(betAmount: number): Promise<void> {
    if (!this.canSpin()) {
      console.warn('[GameController] Cannot buy feature in current state')
      return
    }

    if (!this._configuration?.enableBuyFeature) {
      console.warn('[GameController] Buy feature not enabled')
      return
    }

    const clientRequestId = uuidv4()

    try {
      // Transition: IDLE -> SPIN_REQ
      this._stateMachine.startSpinRequest()
      this.notifySpinStart()

      // Log telemetry
      this.telemetry.logSpinStart({
        mode: MotionPrefs.turboEnabled ? 'turbo' : 'normal',
        reduce_motion: MotionPrefs.reduceMotion,
        config_hash: ''
      })

      // Send request
      this._stateMachine.spinSent()

      const response = await this.network.spin({
        clientRequestId,
        betAmount,
        mode: 'BUY_FEATURE',
        hypeMode: false
      })

      // Log buy feature trigger
      this.telemetry.logBonusTriggered({
        bonus_type: 'freespins',
        bonus_is_bought: true,
        bonus_variant: 'vip_buy',
        bonus_multiplier_applied: this._configuration?.buyFeatureCostMultiplier || 100,
        config_hash: ''
      })

      // Transition: SPINNING -> RESULT
      this._stateMachine.spinResult()

      // Run scenario (animations)
      await this.scenarioRunner.runSpinScenario(response, betAmount)

      // Transition: RESULT -> IDLE
      this._stateMachine.resultComplete()

    } catch (error) {
      console.error('[GameController] Buy feature error:', error)
      this._stateMachine.spinError()
    }
  }

  /**
   * Skip current animations
   */
  skip(): void {
    if (MotionPrefs.allowSkip && this.scenarioRunner.running) {
      this.scenarioRunner.skip()
    }
  }

  // --- Event Subscriptions ---

  /**
   * Subscribe to spin start events
   */
  onSpinStart(listener: SpinStartListener): () => void {
    this.spinStartListeners.add(listener)
    return () => this.spinStartListeners.delete(listener)
  }

  /**
   * Subscribe to network errors
   */
  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(listener: StateChangeListener): () => void {
    return this._stateMachine.onStateChange(listener)
  }

  // --- Private Helpers ---

  private notifySpinStart(): void {
    this.spinStartListeners.forEach(l => l())
  }

  private handleNetworkError(error: NetworkErrorEvent): void {
    console.error('[GameController] Network error:', error)
    this.errorListeners.forEach(l => l(error))
  }
}
