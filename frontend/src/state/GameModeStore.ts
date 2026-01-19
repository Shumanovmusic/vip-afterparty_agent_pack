/**
 * GameModeStore - Reactive singleton for game mode state
 * Tracks: mode (BASE/FREE_SPINS), spinsRemaining, heatLevel
 * Source of truth: protocol_v1.md (RestoreState/NextState)
 */

import type { RestoreState, NextState } from '../types/protocol'

export type GameMode = 'BASE' | 'FREE_SPINS'

export interface GameModeState {
  mode: GameMode
  spinsRemaining: number
  heatLevel: number
}

type GameModeListener = (state: GameModeState) => void

class GameModeStoreManager {
  private _mode: GameMode = 'BASE'
  private _spinsRemaining: number = 0
  private _heatLevel: number = 0
  private listeners: Set<GameModeListener> = new Set()

  get mode(): GameMode {
    return this._mode
  }

  get spinsRemaining(): number {
    return this._spinsRemaining
  }

  get heatLevel(): number {
    return this._heatLevel
  }

  get isInFreeSpins(): boolean {
    return this._mode === 'FREE_SPINS'
  }

  /**
   * Apply restore state from /init response
   * Called when player reconnects with unfinished bonus
   */
  applyRestoreState(state: RestoreState): void {
    this._mode = state.mode
    this._spinsRemaining = state.spinsRemaining
    this._heatLevel = state.heatLevel
    console.log('[GameModeStore] Applied restore state:', this.getState())
    this.notifyListeners()
  }

  /**
   * Apply next state from /spin response
   * Called after each spin completes
   */
  applyNextState(state: NextState): void {
    this._mode = state.mode
    this._spinsRemaining = state.spinsRemaining
    this._heatLevel = state.heatLevel
    console.log('[GameModeStore] Applied next state:', this.getState())
    this.notifyListeners()
  }

  /**
   * Update heat level (from heatUpdate event)
   */
  updateHeatLevel(level: number): void {
    this._heatLevel = level
    this.notifyListeners()
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this._mode = 'BASE'
    this._spinsRemaining = 0
    this._heatLevel = 0
    this.notifyListeners()
  }

  /**
   * Get current state snapshot
   */
  getState(): GameModeState {
    return {
      mode: this._mode,
      spinsRemaining: this._spinsRemaining,
      heatLevel: this._heatLevel
    }
  }

  /**
   * Subscribe to state changes
   * @returns Unsubscribe function
   */
  onChange(listener: GameModeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners(): void {
    const state = this.getState()
    this.listeners.forEach(l => l(state))
  }
}

/** Singleton instance */
export const GameModeStore = new GameModeStoreManager()
