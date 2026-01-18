/**
 * Game state machine
 * States: BOOT → IDLE → SPIN_REQ → SPINNING → RESULT → IDLE
 */

export type GameState = 'BOOT' | 'IDLE' | 'SPIN_REQ' | 'SPINNING' | 'RESULT'

/** Valid state transitions */
const VALID_TRANSITIONS: Record<GameState, GameState[]> = {
  BOOT: ['IDLE'],
  IDLE: ['SPIN_REQ'],
  SPIN_REQ: ['SPINNING', 'IDLE'],  // IDLE for error cases
  SPINNING: ['RESULT'],
  RESULT: ['IDLE']
}

type StateChangeListener = (from: GameState, to: GameState) => void

/**
 * Finite state machine for game flow control
 */
export class GameStateMachine {
  private _state: GameState = 'BOOT'
  private listeners: Set<StateChangeListener> = new Set()

  get state(): GameState {
    return this._state
  }

  /**
   * Can spin be requested?
   * Only true when in IDLE state
   */
  canSpin(): boolean {
    return this._state === 'IDLE'
  }

  /**
   * Is the game busy with a spin cycle?
   * True during SPIN_REQ, SPINNING, or RESULT
   */
  isBusy(): boolean {
    return ['SPIN_REQ', 'SPINNING', 'RESULT'].includes(this._state)
  }

  /**
   * Is the game initialized?
   * True after leaving BOOT state
   */
  isInitialized(): boolean {
    return this._state !== 'BOOT'
  }

  /**
   * Transition to a new state
   * @throws Error if transition is invalid
   */
  transition(to: GameState): void {
    const validTargets = VALID_TRANSITIONS[this._state]

    if (!validTargets.includes(to)) {
      throw new Error(
        `Invalid state transition: ${this._state} → ${to}. ` +
        `Valid transitions: ${validTargets.join(', ')}`
      )
    }

    const from = this._state
    this._state = to
    this.notifyListeners(from, to)
  }

  /**
   * Subscribe to state changes
   * @returns Unsubscribe function
   */
  onStateChange(callback: StateChangeListener): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  private notifyListeners(from: GameState, to: GameState): void {
    this.listeners.forEach(l => l(from, to))
  }

  // --- Convenience methods for common transitions ---

  /**
   * Initialize complete: BOOT → IDLE
   */
  initialize(): void {
    this.transition('IDLE')
  }

  /**
   * Start spin request: IDLE → SPIN_REQ
   * @throws if not in IDLE state
   */
  startSpinRequest(): void {
    this.transition('SPIN_REQ')
  }

  /**
   * Spin request sent: SPIN_REQ → SPINNING
   */
  spinSent(): void {
    this.transition('SPINNING')
  }

  /**
   * Response received: SPINNING → RESULT
   */
  spinResult(): void {
    this.transition('RESULT')
  }

  /**
   * Result animations complete: RESULT → IDLE
   */
  resultComplete(): void {
    this.transition('IDLE')
  }

  /**
   * Error during spin request: SPIN_REQ → IDLE
   */
  spinError(): void {
    if (this._state === 'SPIN_REQ') {
      this.transition('IDLE')
    }
  }
}
