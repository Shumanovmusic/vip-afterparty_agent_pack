/**
 * Restore State Tests
 * Verifies: GameModeStore correctly handles restoreState/nextState from protocol
 * Source of truth: protocol_v1.md (RestoreState, NextState)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GameModeStore } from '../src/state/GameModeStore'

describe('GameModeStore', () => {
  beforeEach(() => {
    GameModeStore.reset()
  })

  describe('Initial State', () => {
    it('starts in BASE mode with 0 spins', () => {
      expect(GameModeStore.mode).toBe('BASE')
      expect(GameModeStore.spinsRemaining).toBe(0)
      expect(GameModeStore.heatLevel).toBe(0)
    })

    it('isInFreeSpins returns false in BASE mode', () => {
      expect(GameModeStore.isInFreeSpins).toBe(false)
    })
  })

  describe('applyRestoreState', () => {
    it('sets FREE_SPINS mode from restore state', () => {
      GameModeStore.applyRestoreState({
        mode: 'FREE_SPINS',
        spinsRemaining: 7,
        heatLevel: 4
      })

      expect(GameModeStore.mode).toBe('FREE_SPINS')
      expect(GameModeStore.spinsRemaining).toBe(7)
      expect(GameModeStore.heatLevel).toBe(4)
      expect(GameModeStore.isInFreeSpins).toBe(true)
    })

    it('preserves exact values from server', () => {
      GameModeStore.applyRestoreState({
        mode: 'FREE_SPINS',
        spinsRemaining: 12,
        heatLevel: 9
      })

      expect(GameModeStore.spinsRemaining).toBe(12)
      expect(GameModeStore.heatLevel).toBe(9)
    })
  })

  describe('applyNextState', () => {
    it('updates from BASE to FREE_SPINS', () => {
      expect(GameModeStore.mode).toBe('BASE')

      GameModeStore.applyNextState({
        mode: 'FREE_SPINS',
        spinsRemaining: 10,
        heatLevel: 0
      })

      expect(GameModeStore.mode).toBe('FREE_SPINS')
      expect(GameModeStore.spinsRemaining).toBe(10)
      expect(GameModeStore.isInFreeSpins).toBe(true)
    })

    it('updates spins remaining during FREE_SPINS', () => {
      GameModeStore.applyNextState({
        mode: 'FREE_SPINS',
        spinsRemaining: 9,
        heatLevel: 2
      })

      expect(GameModeStore.spinsRemaining).toBe(9)
      expect(GameModeStore.heatLevel).toBe(2)
    })

    it('transitions back to BASE when bonus ends', () => {
      // Enter free spins
      GameModeStore.applyNextState({
        mode: 'FREE_SPINS',
        spinsRemaining: 1,
        heatLevel: 5
      })
      expect(GameModeStore.isInFreeSpins).toBe(true)

      // Bonus ends
      GameModeStore.applyNextState({
        mode: 'BASE',
        spinsRemaining: 0,
        heatLevel: 0
      })

      expect(GameModeStore.mode).toBe('BASE')
      expect(GameModeStore.spinsRemaining).toBe(0)
      expect(GameModeStore.isInFreeSpins).toBe(false)
    })
  })

  describe('updateHeatLevel', () => {
    it('updates heat level independently', () => {
      GameModeStore.updateHeatLevel(5)
      expect(GameModeStore.heatLevel).toBe(5)

      GameModeStore.updateHeatLevel(8)
      expect(GameModeStore.heatLevel).toBe(8)
    })

    it('does not affect mode or spinsRemaining', () => {
      GameModeStore.applyRestoreState({
        mode: 'FREE_SPINS',
        spinsRemaining: 7,
        heatLevel: 2
      })

      GameModeStore.updateHeatLevel(9)

      expect(GameModeStore.mode).toBe('FREE_SPINS')
      expect(GameModeStore.spinsRemaining).toBe(7)
      expect(GameModeStore.heatLevel).toBe(9)
    })
  })

  describe('reset', () => {
    it('resets to initial state', () => {
      GameModeStore.applyRestoreState({
        mode: 'FREE_SPINS',
        spinsRemaining: 7,
        heatLevel: 4
      })

      GameModeStore.reset()

      expect(GameModeStore.mode).toBe('BASE')
      expect(GameModeStore.spinsRemaining).toBe(0)
      expect(GameModeStore.heatLevel).toBe(0)
      expect(GameModeStore.isInFreeSpins).toBe(false)
    })
  })

  describe('getState', () => {
    it('returns snapshot of current state', () => {
      GameModeStore.applyRestoreState({
        mode: 'FREE_SPINS',
        spinsRemaining: 5,
        heatLevel: 3
      })

      const state = GameModeStore.getState()

      expect(state).toEqual({
        mode: 'FREE_SPINS',
        spinsRemaining: 5,
        heatLevel: 3
      })
    })
  })

  describe('Listeners', () => {
    it('notifies listeners on applyRestoreState', () => {
      const listener = vi.fn()
      GameModeStore.onChange(listener)

      GameModeStore.applyRestoreState({
        mode: 'FREE_SPINS',
        spinsRemaining: 5,
        heatLevel: 1
      })

      expect(listener).toHaveBeenCalledWith({
        mode: 'FREE_SPINS',
        spinsRemaining: 5,
        heatLevel: 1
      })
    })

    it('notifies listeners on applyNextState', () => {
      const listener = vi.fn()
      GameModeStore.onChange(listener)

      GameModeStore.applyNextState({
        mode: 'FREE_SPINS',
        spinsRemaining: 10,
        heatLevel: 0
      })

      expect(listener).toHaveBeenCalled()
    })

    it('notifies listeners on updateHeatLevel', () => {
      const listener = vi.fn()
      GameModeStore.onChange(listener)

      GameModeStore.updateHeatLevel(7)

      expect(listener).toHaveBeenCalledWith({
        mode: 'BASE',
        spinsRemaining: 0,
        heatLevel: 7
      })
    })

    it('notifies listeners on reset', () => {
      const listener = vi.fn()
      GameModeStore.onChange(listener)

      GameModeStore.reset()

      expect(listener).toHaveBeenCalledWith({
        mode: 'BASE',
        spinsRemaining: 0,
        heatLevel: 0
      })
    })

    it('unsubscribe stops notifications', () => {
      const listener = vi.fn()
      const unsubscribe = GameModeStore.onChange(listener)

      GameModeStore.updateHeatLevel(1)
      expect(listener).toHaveBeenCalledTimes(1)

      unsubscribe()
      GameModeStore.updateHeatLevel(2)
      expect(listener).toHaveBeenCalledTimes(1) // No additional call
    })

    it('multiple listeners are all notified', () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      GameModeStore.onChange(listener1)
      GameModeStore.onChange(listener2)

      GameModeStore.updateHeatLevel(3)

      expect(listener1).toHaveBeenCalled()
      expect(listener2).toHaveBeenCalled()
    })
  })

  describe('Server Authoritative (LAW)', () => {
    it('client only applies server-provided state', () => {
      // Client cannot set arbitrary values - only through server responses
      // This test verifies the store only has methods that take server data

      // applyRestoreState - from /init response
      GameModeStore.applyRestoreState({
        mode: 'FREE_SPINS',
        spinsRemaining: 10,
        heatLevel: 5
      })

      // applyNextState - from /spin response
      GameModeStore.applyNextState({
        mode: 'FREE_SPINS',
        spinsRemaining: 9,
        heatLevel: 5
      })

      // The store reflects exactly what server told it
      expect(GameModeStore.spinsRemaining).toBe(9)
    })
  })

  /**
   * Restore UX Contract v1
   * These tests define the minimal UX guarantees for restore state handling.
   * Breaking these = regression in bonus continuation flow.
   */
  describe('Restore UX Contract v1', () => {
    describe('Mid-bonus restore (page reload during FREE_SPINS)', () => {
      it('restores FREE_SPINS mode with correct spinsRemaining', () => {
        // Simulate: player bought feature, did 1 spin, then reloaded
        // /init returns restoreState
        GameModeStore.applyRestoreState({
          mode: 'FREE_SPINS',
          spinsRemaining: 8,
          heatLevel: 1
        })

        expect(GameModeStore.mode).toBe('FREE_SPINS')
        expect(GameModeStore.spinsRemaining).toBe(8)
        expect(GameModeStore.heatLevel).toBe(1)
        expect(GameModeStore.isInFreeSpins).toBe(true)
      })

      it('UI should disable Buy/Hype in restored FREE_SPINS mode', () => {
        GameModeStore.applyRestoreState({
          mode: 'FREE_SPINS',
          spinsRemaining: 7,
          heatLevel: 4
        })

        // UI uses isInFreeSpins to disable buttons
        expect(GameModeStore.isInFreeSpins).toBe(true)
        // canBuyFeature computed: enableBuyFeature && !isSpinning && !isInFreeSpins
        // canToggleHypeMode computed: enableHypeMode && !isInFreeSpins
        // Both should be disabled when isInFreeSpins is true
      })
    })

    describe('Bonus end cleanup', () => {
      it('transitions to BASE mode when bonus ends', () => {
        // Start in FREE_SPINS
        GameModeStore.applyRestoreState({
          mode: 'FREE_SPINS',
          spinsRemaining: 1,
          heatLevel: 5
        })
        expect(GameModeStore.isInFreeSpins).toBe(true)

        // Last spin completes, bonus ends
        GameModeStore.applyNextState({
          mode: 'BASE',
          spinsRemaining: 0,
          heatLevel: 0
        })

        expect(GameModeStore.mode).toBe('BASE')
        expect(GameModeStore.spinsRemaining).toBe(0)
        expect(GameModeStore.isInFreeSpins).toBe(false)
      })

      it('UI buttons become active again after bonus ends', () => {
        // In FREE_SPINS
        GameModeStore.applyNextState({
          mode: 'FREE_SPINS',
          spinsRemaining: 1,
          heatLevel: 3
        })
        expect(GameModeStore.isInFreeSpins).toBe(true)

        // Bonus ends
        GameModeStore.applyNextState({
          mode: 'BASE',
          spinsRemaining: 0,
          heatLevel: 0
        })

        // isInFreeSpins is false, so Buy/Hype buttons can be enabled
        expect(GameModeStore.isInFreeSpins).toBe(false)
      })
    })
  })
})
