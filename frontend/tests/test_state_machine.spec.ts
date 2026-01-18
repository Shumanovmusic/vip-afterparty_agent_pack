/**
 * State Machine Tests
 * Verifies: SPIN_REQ only allowed from IDLE, retries do not cause illegal transitions
 * Source of truth: SCENARIO_V1.md (state flow)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { GameStateMachine } from '../src/state/GameStateMachine'

describe('GameStateMachine', () => {
  let sm: GameStateMachine

  beforeEach(() => {
    sm = new GameStateMachine()
  })

  describe('Initial State', () => {
    it('starts in BOOT state', () => {
      expect(sm.state).toBe('BOOT')
    })

    it('canSpin returns false in BOOT', () => {
      expect(sm.canSpin()).toBe(false)
    })

    it('isInitialized returns false in BOOT', () => {
      expect(sm.isInitialized()).toBe(false)
    })
  })

  describe('SPIN_REQ only allowed from IDLE (LAW)', () => {
    it('allows SPIN_REQ transition from IDLE', () => {
      sm.initialize() // BOOT -> IDLE
      expect(sm.state).toBe('IDLE')
      expect(sm.canSpin()).toBe(true)

      sm.startSpinRequest() // IDLE -> SPIN_REQ
      expect(sm.state).toBe('SPIN_REQ')
    })

    it('throws when trying SPIN_REQ from BOOT', () => {
      expect(() => sm.startSpinRequest()).toThrow('Invalid state transition')
    })

    it('throws when trying SPIN_REQ from SPIN_REQ', () => {
      sm.initialize()
      sm.startSpinRequest()
      expect(() => sm.startSpinRequest()).toThrow('Invalid state transition')
    })

    it('throws when trying SPIN_REQ from SPINNING', () => {
      sm.initialize()
      sm.startSpinRequest()
      sm.spinSent() // SPIN_REQ -> SPINNING
      expect(() => sm.startSpinRequest()).toThrow('Invalid state transition')
    })

    it('throws when trying SPIN_REQ from RESULT', () => {
      sm.initialize()
      sm.startSpinRequest()
      sm.spinSent()
      sm.spinResult() // SPINNING -> RESULT
      expect(() => sm.startSpinRequest()).toThrow('Invalid state transition')
    })
  })

  describe('Valid State Transitions', () => {
    it('BOOT -> IDLE via initialize()', () => {
      sm.initialize()
      expect(sm.state).toBe('IDLE')
      expect(sm.isInitialized()).toBe(true)
    })

    it('full spin cycle: IDLE -> SPIN_REQ -> SPINNING -> RESULT -> IDLE', () => {
      sm.initialize()
      expect(sm.state).toBe('IDLE')

      sm.startSpinRequest()
      expect(sm.state).toBe('SPIN_REQ')
      expect(sm.isBusy()).toBe(true)

      sm.spinSent()
      expect(sm.state).toBe('SPINNING')
      expect(sm.isBusy()).toBe(true)

      sm.spinResult()
      expect(sm.state).toBe('RESULT')
      expect(sm.isBusy()).toBe(true)

      sm.resultComplete()
      expect(sm.state).toBe('IDLE')
      expect(sm.isBusy()).toBe(false)
      expect(sm.canSpin()).toBe(true)
    })

    it('error recovery: SPIN_REQ -> IDLE via spinError()', () => {
      sm.initialize()
      sm.startSpinRequest()
      expect(sm.state).toBe('SPIN_REQ')

      sm.spinError()
      expect(sm.state).toBe('IDLE')
      expect(sm.canSpin()).toBe(true)
    })
  })

  describe('Retries do not cause illegal transitions (LAW)', () => {
    it('spinError only works from SPIN_REQ state', () => {
      sm.initialize()
      sm.startSpinRequest()
      sm.spinSent() // Now in SPINNING

      // spinError should be a no-op when not in SPIN_REQ
      sm.spinError()
      expect(sm.state).toBe('SPINNING') // Still SPINNING, not IDLE
    })

    it('multiple spin cycles work correctly', () => {
      sm.initialize()

      // First spin
      sm.startSpinRequest()
      sm.spinSent()
      sm.spinResult()
      sm.resultComplete()
      expect(sm.state).toBe('IDLE')

      // Second spin
      sm.startSpinRequest()
      sm.spinSent()
      sm.spinResult()
      sm.resultComplete()
      expect(sm.state).toBe('IDLE')

      // Third spin with error
      sm.startSpinRequest()
      sm.spinError()
      expect(sm.state).toBe('IDLE')

      // Fourth spin should still work
      sm.startSpinRequest()
      expect(sm.state).toBe('SPIN_REQ')
    })
  })

  describe('State Change Listeners', () => {
    it('notifies listeners on state change', () => {
      const transitions: Array<{ from: string; to: string }> = []

      sm.onStateChange((from, to) => {
        transitions.push({ from, to })
      })

      sm.initialize()
      sm.startSpinRequest()

      expect(transitions).toEqual([
        { from: 'BOOT', to: 'IDLE' },
        { from: 'IDLE', to: 'SPIN_REQ' }
      ])
    })

    it('unsubscribe works', () => {
      const transitions: string[] = []

      const unsub = sm.onStateChange((_from, to) => {
        transitions.push(to)
      })

      sm.initialize()
      unsub()
      sm.startSpinRequest()

      expect(transitions).toEqual(['IDLE']) // Only first transition recorded
    })
  })
})
