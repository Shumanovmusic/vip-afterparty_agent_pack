/**
 * Motion Preferences Tests
 * Verifies: Turbo mode feedback <= 300ms
 *           Reduce motion celebrations <= 600ms
 *           Animation rules per UX_ANIMATION_SPEC.md
 * Source of truth: CONFIG.md, UX_ANIMATION_SPEC.md
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MotionPrefs, TIMING, WIN_TIER_THRESHOLDS } from '../src/ux/MotionPrefs'

describe('MotionPrefs', () => {
  // Save original state to restore after tests
  let originalState: ReturnType<typeof MotionPrefs.getState>

  beforeEach(() => {
    originalState = MotionPrefs.getState()
    // Reset to defaults
    MotionPrefs.turboEnabled = false
    MotionPrefs.reduceMotion = false
    MotionPrefs.postSpinBounce = true
    MotionPrefs.allowSkip = true
  })

  afterEach(() => {
    // Restore original state
    MotionPrefs.turboEnabled = originalState.turboEnabled
    MotionPrefs.reduceMotion = originalState.reduceMotion
    MotionPrefs.postSpinBounce = originalState.postSpinBounce
    MotionPrefs.allowSkip = originalState.allowSkip
  })

  describe('Turbo mode feedback max 300ms (LAW)', () => {
    it('TIMING.TURBO_FEEDBACK_MAX_MS is 300', () => {
      expect(TIMING.TURBO_FEEDBACK_MAX_MS).toBe(300)
    })

    it('win popup duration <= 300ms in turbo mode', () => {
      MotionPrefs.turboEnabled = true

      // All win sizes should be <= 300ms
      expect(MotionPrefs.getWinPopupDuration(1)).toBeLessThanOrEqual(300)
      expect(MotionPrefs.getWinPopupDuration(10)).toBeLessThanOrEqual(300)
      expect(MotionPrefs.getWinPopupDuration(100)).toBeLessThanOrEqual(300)
      expect(MotionPrefs.getWinPopupDuration(1000)).toBeLessThanOrEqual(300)
    })

    it('celebration duration <= 300ms in turbo mode', () => {
      MotionPrefs.turboEnabled = true

      expect(MotionPrefs.getCelebrationDuration('big')).toBeLessThanOrEqual(300)
      expect(MotionPrefs.getCelebrationDuration('mega')).toBeLessThanOrEqual(300)
      expect(MotionPrefs.getCelebrationDuration('epic')).toBeLessThanOrEqual(300)
    })

    it('feedback max duration is 300ms in turbo', () => {
      MotionPrefs.turboEnabled = true
      expect(MotionPrefs.getFeedbackMaxDuration()).toBe(300)
    })

    it('event FX duration is 0 in turbo (OFF)', () => {
      MotionPrefs.turboEnabled = true
      expect(MotionPrefs.getEventFxDuration()).toBe(0)
    })

    it('spin duration uses minimum in turbo', () => {
      MotionPrefs.turboEnabled = true
      expect(MotionPrefs.getSpinDuration()).toBe(TIMING.SPIN_CYCLE_MS.min)
    })
  })

  describe('Reduce motion celebrations max 600ms (LAW)', () => {
    it('TIMING.REDUCE_MOTION_MAX_MS is 600', () => {
      expect(TIMING.REDUCE_MOTION_MAX_MS).toBe(600)
    })

    it('celebration duration <= 600ms in reduce motion', () => {
      MotionPrefs.reduceMotion = true

      expect(MotionPrefs.getCelebrationDuration('big')).toBeLessThanOrEqual(600)
      expect(MotionPrefs.getCelebrationDuration('mega')).toBeLessThanOrEqual(600)
      expect(MotionPrefs.getCelebrationDuration('epic')).toBeLessThanOrEqual(600)
    })

    it('celebration duration is exactly 600ms in reduce motion', () => {
      MotionPrefs.reduceMotion = true

      expect(MotionPrefs.getCelebrationDuration('big')).toBe(600)
      expect(MotionPrefs.getCelebrationDuration('mega')).toBe(600)
      expect(MotionPrefs.getCelebrationDuration('epic')).toBe(600)
    })
  })

  describe('Bounce animation rules (LAW)', () => {
    it('bounce shows in normal mode with postSpinBounce=true', () => {
      MotionPrefs.turboEnabled = false
      MotionPrefs.reduceMotion = false
      MotionPrefs.postSpinBounce = true

      expect(MotionPrefs.shouldShowBounce()).toBe(true)
    })

    it('bounce OFF in turbo mode (regardless of postSpinBounce)', () => {
      MotionPrefs.turboEnabled = true
      MotionPrefs.postSpinBounce = true

      expect(MotionPrefs.shouldShowBounce()).toBe(false)
    })

    it('bounce OFF in reduce motion mode (regardless of postSpinBounce)', () => {
      MotionPrefs.reduceMotion = true
      MotionPrefs.postSpinBounce = true

      expect(MotionPrefs.shouldShowBounce()).toBe(false)
    })

    it('bounce OFF when user disables postSpinBounce', () => {
      MotionPrefs.turboEnabled = false
      MotionPrefs.reduceMotion = false
      MotionPrefs.postSpinBounce = false

      expect(MotionPrefs.shouldShowBounce()).toBe(false)
    })
  })

  describe('Decorative FX rules (LAW)', () => {
    it('decorative FX shows in normal mode', () => {
      MotionPrefs.turboEnabled = false
      expect(MotionPrefs.shouldShowDecorativeFX()).toBe(true)
    })

    it('decorative FX OFF in turbo mode', () => {
      MotionPrefs.turboEnabled = true
      expect(MotionPrefs.shouldShowDecorativeFX()).toBe(false)
    })

    it('decorative FX shows in reduce motion (only shake disabled)', () => {
      MotionPrefs.reduceMotion = true
      MotionPrefs.turboEnabled = false
      expect(MotionPrefs.shouldShowDecorativeFX()).toBe(true)
    })
  })

  describe('Screen shake rules (LAW)', () => {
    it('screen shake shows in normal mode', () => {
      MotionPrefs.reduceMotion = false
      expect(MotionPrefs.shouldShowScreenShake()).toBe(true)
    })

    it('screen shake OFF in reduce motion', () => {
      MotionPrefs.reduceMotion = true
      expect(MotionPrefs.shouldShowScreenShake()).toBe(false)
    })

    it('screen shake shows in turbo mode (only reduce motion disables it)', () => {
      MotionPrefs.turboEnabled = true
      MotionPrefs.reduceMotion = false
      expect(MotionPrefs.shouldShowScreenShake()).toBe(true)
    })
  })

  describe('Win tier thresholds (LAW)', () => {
    it('WIN_TIER_THRESHOLDS match UX_ANIMATION_SPEC.md', () => {
      expect(WIN_TIER_THRESHOLDS.BIG).toBe(20)
      expect(WIN_TIER_THRESHOLDS.MEGA).toBe(200)
      expect(WIN_TIER_THRESHOLDS.EPIC).toBe(1000)
    })

    it('returns "none" for winX < 20', () => {
      expect(MotionPrefs.getWinTier(0)).toBe('none')
      expect(MotionPrefs.getWinTier(5)).toBe('none')
      expect(MotionPrefs.getWinTier(19.99)).toBe('none')
    })

    it('returns "big" for 20 <= winX < 200', () => {
      expect(MotionPrefs.getWinTier(20)).toBe('big')
      expect(MotionPrefs.getWinTier(100)).toBe('big')
      expect(MotionPrefs.getWinTier(199.99)).toBe('big')
    })

    it('returns "mega" for 200 <= winX < 1000', () => {
      expect(MotionPrefs.getWinTier(200)).toBe('mega')
      expect(MotionPrefs.getWinTier(500)).toBe('mega')
      expect(MotionPrefs.getWinTier(999.99)).toBe('mega')
    })

    it('returns "epic" for winX >= 1000', () => {
      expect(MotionPrefs.getWinTier(1000)).toBe('epic')
      expect(MotionPrefs.getWinTier(5000)).toBe('epic')
      expect(MotionPrefs.getWinTier(25000)).toBe('epic')
    })
  })

  describe('Win popup duration tiers', () => {
    it('normal mode: small wins (< 5x) get 400ms', () => {
      MotionPrefs.turboEnabled = false
      expect(MotionPrefs.getWinPopupDuration(1)).toBe(400)
      expect(MotionPrefs.getWinPopupDuration(4.99)).toBe(400)
    })

    it('normal mode: mid wins (5-20x) get 1000ms', () => {
      MotionPrefs.turboEnabled = false
      expect(MotionPrefs.getWinPopupDuration(5)).toBe(1000)
      expect(MotionPrefs.getWinPopupDuration(19.99)).toBe(1000)
    })

    it('normal mode: big wins (>= 20x) get 3000ms', () => {
      MotionPrefs.turboEnabled = false
      expect(MotionPrefs.getWinPopupDuration(20)).toBe(3000)
      expect(MotionPrefs.getWinPopupDuration(100)).toBe(3000)
    })
  })

  describe('Celebration duration in normal mode', () => {
    it('tier=none returns 0', () => {
      expect(MotionPrefs.getCelebrationDuration('none')).toBe(0)
    })

    it('tier=big returns 2500ms', () => {
      MotionPrefs.turboEnabled = false
      MotionPrefs.reduceMotion = false
      expect(MotionPrefs.getCelebrationDuration('big')).toBe(2500)
    })

    it('tier=mega returns 3000ms', () => {
      MotionPrefs.turboEnabled = false
      MotionPrefs.reduceMotion = false
      expect(MotionPrefs.getCelebrationDuration('mega')).toBe(3000)
    })

    it('tier=epic returns 3500ms', () => {
      MotionPrefs.turboEnabled = false
      MotionPrefs.reduceMotion = false
      expect(MotionPrefs.getCelebrationDuration('epic')).toBe(3500)
    })
  })

  describe('Velvet rope teaser rules', () => {
    it('shows in normal mode', () => {
      MotionPrefs.turboEnabled = false
      expect(MotionPrefs.shouldShowVelvetRopeTeaser()).toBe(true)
    })

    it('OFF in turbo mode', () => {
      MotionPrefs.turboEnabled = true
      expect(MotionPrefs.shouldShowVelvetRopeTeaser()).toBe(false)
    })
  })

  describe('State persistence listeners', () => {
    it('notifies listeners on preference change', () => {
      const changes: Array<ReturnType<typeof MotionPrefs.getState>> = []
      const unsub = MotionPrefs.onChange(state => changes.push(state))

      MotionPrefs.turboEnabled = true

      expect(changes).toHaveLength(1)
      expect(changes[0].turboEnabled).toBe(true)

      unsub()
    })

    it('unsubscribe works', () => {
      const changes: Array<ReturnType<typeof MotionPrefs.getState>> = []
      const unsub = MotionPrefs.onChange(state => changes.push(state))

      MotionPrefs.turboEnabled = true
      unsub()
      MotionPrefs.reduceMotion = true

      expect(changes).toHaveLength(1) // Only first change captured
    })
  })
})
