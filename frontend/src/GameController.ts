/**
 * GameController - Main orchestrator
 * Coordinates network, state machine, events, and scenario runner
 */

import { v4 as uuidv4 } from 'uuid'
import type { Configuration, SpinResponse } from './types/protocol'
import { NetworkClient, NetworkErrorEvent } from './net/NetworkClient'
import { GameStateMachine, GameState } from './state/GameStateMachine'
import { GameModeStore } from './state/GameModeStore'
import { ScenarioRunner } from './ux/ScenarioRunner'
import { TelemetryClient } from './telemetry/TelemetryClient'
import { MotionPrefs } from './ux/MotionPrefs'
import { audioService } from './audio/AudioService'
import { HeatModel, type HeatChangeListener, type HeatThresholdListener } from './ux/heat/HeatModel'
import { DEBUG_FLAGS } from './render/pixi/DebugFlags'

type SpinStartListener = () => void
type QuickStopListener = () => void
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
  private quickStopListeners: Set<QuickStopListener> = new Set()
  private errorListeners: Set<ErrorListener> = new Set()

  // Heat model (frontend-only juice progression)
  private _heatModel: HeatModel

  // Heat tick interval handle
  private _heatTickInterval: number | null = null

  constructor(playerId: string = 'dev-player') {
    this._playerId = playerId

    // Initialize components
    this.network = new NetworkClient('/api', playerId)
    this._stateMachine = new GameStateMachine()
    this.telemetry = new TelemetryClient()
    this.scenarioRunner = new ScenarioRunner(this.telemetry, playerId)

    // Initialize heat model
    this._heatModel = new HeatModel()
    this._heatModel.setVerbose(DEBUG_FLAGS.heatVerbose)
    this._heatModel.setMotionPrefs({
      turbo: MotionPrefs.turboEnabled,
      reduceMotion: MotionPrefs.reduceMotion
    })

    // Wire up error handling
    this.network.onError((error) => {
      this.handleNetworkError(error)
    })

    // Start heat decay tick
    this.startHeatTick()
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

  // --- Heat Model ---

  /**
   * Get current heat value (continuous 0..10)
   */
  get heatValue(): number {
    return this._heatModel.getValue()
  }

  /**
   * Get current heat level (integer 0..10)
   */
  get heatLevel(): number {
    return this._heatModel.getLevel()
  }

  /**
   * Get the heat model instance for direct access
   */
  get heatModel(): HeatModel {
    return this._heatModel
  }

  /**
   * Subscribe to heat value changes
   * @returns Unsubscribe function
   */
  onHeatChange(listener: HeatChangeListener): () => void {
    return this._heatModel.onChange(listener)
  }

  /**
   * Subscribe to heat threshold crossings (for spotlight triggers)
   * Called when heat crosses 3, 6, or 9
   * @returns Unsubscribe function
   */
  onHeatThreshold(listener: HeatThresholdListener): () => void {
    return this._heatModel.onThreshold(listener)
  }

  /**
   * Add heat manually (for DEV testing)
   */
  addHeat(delta: number): void {
    this._heatModel.addHeat(delta, 'manual')
  }

  /**
   * Remove heat manually (for DEV testing)
   */
  removeHeat(delta: number): void {
    this._heatModel.removeHeat(delta, 'manual')
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

      // Handle restore state if present (unfinished bonus)
      if (response.restoreState) {
        console.log('[GameController] Applying restore state:', response.restoreState)
        GameModeStore.applyRestoreState(response.restoreState)
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

      // Feed heat model with spin result
      this.feedHeatFromSpinResult(response, betAmount)

      // Update game mode state from server response
      GameModeStore.applyNextState(response.nextState)

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

    // Buy feature not allowed during FREE_SPINS
    if (GameModeStore.isInFreeSpins) {
      console.warn('[GameController] Cannot buy feature during FREE_SPINS')
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

      // Feed heat model with spin result
      this.feedHeatFromSpinResult(response, betAmount)

      // Update game mode state from server response
      GameModeStore.applyNextState(response.nextState)

      // Transition: RESULT -> IDLE
      this._stateMachine.resultComplete()

    } catch (error) {
      console.error('[GameController] Buy feature error:', error)
      this._stateMachine.spinError()
    }
  }

  /**
   * Skip current animations and request quick stop on reels
   */
  skip(): void {
    if (MotionPrefs.allowSkip && this.scenarioRunner.running) {
      this.scenarioRunner.skip()
    }
    // Always notify quick stop listeners (for reel animation)
    this.notifyQuickStop()
  }

  /**
   * Request quick stop on reels only (without skipping scenario)
   */
  requestQuickStop(): void {
    this.notifyQuickStop()
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
   * Subscribe to quick stop events (for reel animation acceleration)
   */
  onQuickStop(listener: QuickStopListener): () => void {
    this.quickStopListeners.add(listener)
    return () => this.quickStopListeners.delete(listener)
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
    // Feed heat model
    this._heatModel.onSpinStart()
  }

  private notifyQuickStop(): void {
    this.quickStopListeners.forEach(l => l())
  }

  private handleNetworkError(error: NetworkErrorEvent): void {
    console.error('[GameController] Network error:', error)
    this.errorListeners.forEach(l => l(error))
  }

  /**
   * Feed spin result to heat model
   * Extracts relevant features from response and updates heat
   */
  private feedHeatFromSpinResult(response: SpinResponse, betAmount: number): void {
    const { outcome, events } = response

    // Calculate winX if we have totalWin and bet
    const winX = betAmount > 0 ? outcome.totalWin / betAmount : 0

    // Count wilds in revealed grid (symbol id 8)
    let wildCount = 0
    const revealEvent = events.find(e => e.type === 'reveal')
    if (revealEvent && 'grid' in revealEvent) {
      const grid = (revealEvent as { grid: number[][] }).grid
      for (const col of grid) {
        for (const sym of col) {
          if (sym === 8) wildCount++
        }
      }
    }

    // Check for scatter (symbol id 7) presence
    let hasScatter = false
    if (revealEvent && 'grid' in revealEvent) {
      const grid = (revealEvent as { grid: number[][] }).grid
      for (const col of grid) {
        for (const sym of col) {
          if (sym === 7) hasScatter = true
        }
      }
    }

    // Feed to heat model
    this._heatModel.onSpinResult({
      totalWin: outcome.totalWin,
      winX,
      hasScatter,
      wildCount
    })

    // Check for free spins entry
    const enterFreeSpinsEvent = events.find(e => e.type === 'enterFreeSpins')
    if (enterFreeSpinsEvent) {
      this._heatModel.onFreeSpinsEnter()
    }

    // Check for win tier
    const winTierEvent = events.find(e => e.type === 'winTier')
    if (winTierEvent && 'tier' in winTierEvent) {
      const tier = (winTierEvent as { tier: string }).tier
      if (tier === 'big' || tier === 'mega' || tier === 'epic') {
        this._heatModel.onWinTier(tier)
      }
    }
  }

  /**
   * Start heat decay tick interval
   */
  private startHeatTick(): void {
    if (this._heatTickInterval !== null) return

    // Tick every ~100ms for smooth decay
    // Pass dtSec in SECONDS (100ms = 0.1 seconds)
    const TICK_INTERVAL_MS = 100
    const TICK_INTERVAL_SEC = TICK_INTERVAL_MS / 1000

    this._heatTickInterval = window.setInterval(() => {
      this._heatModel.tick(TICK_INTERVAL_SEC)
    }, TICK_INTERVAL_MS)
  }

  /**
   * Stop heat decay tick interval
   */
  stopHeatTick(): void {
    if (this._heatTickInterval !== null) {
      window.clearInterval(this._heatTickInterval)
      this._heatTickInterval = null
    }
  }
}
