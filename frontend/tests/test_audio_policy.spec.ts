/**
 * Audio Policy Tests
 * Tests for audio mix rules: ducking, concurrency, stop guarantees
 * Source of truth: Audio Assets v1 spec
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AudioPolicy, PolicyConfig } from '../src/audio/AudioPolicy'
import type { SoundName } from '../src/audio/AudioTypes'

describe('AudioPolicy', () => {
  beforeEach(() => {
    AudioPolicy.reset()
    AudioPolicy.setMode({ turbo: false, reduceMotion: false, muted: false })
  })

  describe('Concurrency Limits', () => {
    it('MAX_CONCURRENT_SFX is 6', () => {
      expect(PolicyConfig.MAX_CONCURRENT_SFX).toBe(6)
    })

    it('MAX_CONCURRENT_LOOPS is 1', () => {
      expect(PolicyConfig.MAX_CONCURRENT_LOOPS).toBe(1)
    })

    it('blocks SFX when max reached and sound is not a stinger', () => {
      // Simulate max SFX active
      for (let i = 0; i < PolicyConfig.MAX_CONCURRENT_SFX; i++) {
        AudioPolicy.onSfxStart()
      }

      // Low priority sound should be blocked
      const decision = AudioPolicy.evaluate('ui_click')
      expect(decision.allowed).toBe(false)
      expect(decision.reason).toBe('max_sfx_reached')
    })

    it('allows stingers even when max SFX reached', () => {
      // Simulate max SFX active
      for (let i = 0; i < PolicyConfig.MAX_CONCURRENT_SFX; i++) {
        AudioPolicy.onSfxStart()
      }

      // Stinger should still be allowed
      const decision = AudioPolicy.evaluate('win_big')
      expect(decision.allowed).toBe(true)
    })

    it('blocks loops when max reached', () => {
      // Simulate max loops active
      for (let i = 0; i < PolicyConfig.MAX_CONCURRENT_LOOPS; i++) {
        AudioPolicy.onLoopStart()
      }

      const decision = AudioPolicy.evaluate('reel_spin_loop')
      expect(decision.allowed).toBe(false)
      expect(decision.reason).toBe('max_loops_reached')
    })

    it('respects onSfxEnd to decrease count', () => {
      // Fill up SFX slots
      for (let i = 0; i < PolicyConfig.MAX_CONCURRENT_SFX; i++) {
        AudioPolicy.onSfxStart()
      }

      // Remove one
      AudioPolicy.onSfxEnd()

      // Now should allow
      const decision = AudioPolicy.evaluate('ui_click')
      expect(decision.allowed).toBe(true)
    })

    it('respects onLoopEnd to decrease count', () => {
      AudioPolicy.onLoopStart()

      // Should be blocked
      let decision = AudioPolicy.evaluate('reel_spin_loop')
      expect(decision.allowed).toBe(false)

      // Remove loop
      AudioPolicy.onLoopEnd()

      // Now should allow
      decision = AudioPolicy.evaluate('reel_spin_loop')
      expect(decision.allowed).toBe(true)
    })
  })

  describe('Stinger Priority', () => {
    it('identifies stingers correctly', () => {
      const stingers: SoundName[] = ['win_big', 'win_mega', 'win_epic', 'bonus_enter', 'bonus_end']
      const nonStingers: SoundName[] = ['ui_click', 'reel_spin_loop', 'reel_stop_tick', 'win_small']

      stingers.forEach(name => {
        const decision = AudioPolicy.evaluate(name)
        expect(decision.shouldDuck).toBe(true)
      })

      nonStingers.forEach(name => {
        const decision = AudioPolicy.evaluate(name)
        expect(decision.shouldDuck).toBe(false)
      })
    })

    it('shouldDropForIncoming prioritizes stingers over low-priority sounds', () => {
      const activeSounds: SoundName[] = ['ui_click', 'reel_stop_tick']
      const incoming: SoundName = 'win_big'

      const toDrop = AudioPolicy.shouldDropForIncoming(incoming, activeSounds)
      expect(toDrop).toBe('ui_click') // Lowest priority
    })

    it('shouldDropForIncoming returns null when incoming has lower priority', () => {
      const activeSounds: SoundName[] = ['win_big']
      const incoming: SoundName = 'ui_click'

      const toDrop = AudioPolicy.shouldDropForIncoming(incoming, activeSounds)
      expect(toDrop).toBeNull()
    })
  })

  describe('Ducking Configuration', () => {
    it('DUCK_VOLUME is 0.35', () => {
      expect(PolicyConfig.DUCK_VOLUME).toBe(0.35)
    })

    it('DUCK_RESTORE_DELAY_MS is 150', () => {
      expect(PolicyConfig.DUCK_RESTORE_DELAY_MS).toBe(150)
    })

    it('stinger evaluation includes duck duration', () => {
      const decision = AudioPolicy.evaluate('win_big')
      expect(decision.shouldDuck).toBe(true)
      expect(decision.duckDurationMs).toBeGreaterThan(0)
    })

    it('duck duration includes restore delay', () => {
      const decision = AudioPolicy.evaluate('win_big')
      expect(decision.duckDurationMs).toBeGreaterThan(PolicyConfig.DUCK_RESTORE_DELAY_MS)
    })
  })

  describe('Mode Flags', () => {
    it('muted mode blocks all sounds', () => {
      AudioPolicy.setMode({ muted: true })

      expect(AudioPolicy.evaluate('ui_click').allowed).toBe(false)
      expect(AudioPolicy.evaluate('win_big').allowed).toBe(false)
      expect(AudioPolicy.evaluate('reel_spin_loop').allowed).toBe(false)
    })

    it('muted mode sets reason to muted', () => {
      AudioPolicy.setMode({ muted: true })
      const decision = AudioPolicy.evaluate('ui_click')
      expect(decision.reason).toBe('muted')
    })

    it('turbo mode reduces volume multiplier', () => {
      AudioPolicy.setMode({ turbo: false })
      const normalDecision = AudioPolicy.evaluate('win_small')

      AudioPolicy.setMode({ turbo: true })
      const turboDecision = AudioPolicy.evaluate('win_small')

      expect(turboDecision.volumeMultiplier).toBeLessThan(normalDecision.volumeMultiplier)
    })

    it('reduce motion mode reduces volume multiplier', () => {
      AudioPolicy.setMode({ reduceMotion: false })
      const normalDecision = AudioPolicy.evaluate('win_small')

      AudioPolicy.setMode({ reduceMotion: true })
      const reduceDecision = AudioPolicy.evaluate('win_small')

      expect(reduceDecision.volumeMultiplier).toBeLessThan(normalDecision.volumeMultiplier)
    })

    it('turbo + reduce motion compounds volume reduction', () => {
      AudioPolicy.setMode({ turbo: false, reduceMotion: false })
      const normalDecision = AudioPolicy.evaluate('win_small')

      AudioPolicy.setMode({ turbo: true, reduceMotion: true })
      const bothDecision = AudioPolicy.evaluate('win_small')

      AudioPolicy.setMode({ turbo: true, reduceMotion: false })
      const turboOnlyDecision = AudioPolicy.evaluate('win_small')

      expect(bothDecision.volumeMultiplier).toBeLessThan(turboOnlyDecision.volumeMultiplier)
      expect(turboOnlyDecision.volumeMultiplier).toBeLessThan(normalDecision.volumeMultiplier)
    })

    it('getMode returns current mode state', () => {
      AudioPolicy.setMode({ turbo: true, reduceMotion: false, muted: true })
      const mode = AudioPolicy.getMode()
      expect(mode.turbo).toBe(true)
      expect(mode.reduceMotion).toBe(false)
      expect(mode.muted).toBe(true)
    })
  })

  describe('Decorative Sounds in Turbo', () => {
    it('decorative sounds have reduced volume in turbo', () => {
      AudioPolicy.setMode({ turbo: false })
      const normalDecision = AudioPolicy.evaluate('ui_click')

      AudioPolicy.setMode({ turbo: true })
      const turboDecision = AudioPolicy.evaluate('ui_click')

      // Decorative sounds should have even more reduction in turbo
      expect(turboDecision.volumeMultiplier).toBeLessThan(normalDecision.volumeMultiplier * 0.5)
    })
  })
})
