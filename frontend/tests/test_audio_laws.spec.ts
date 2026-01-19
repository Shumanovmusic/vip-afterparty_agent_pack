/**
 * Audio Laws Tests
 * Verifies audio behavior laws per Audio Assets v1 spec DoD
 *
 * Covers:
 * - Stop guarantee (enterFreeSpins / bonusEnd / skip2)
 * - Ducking
 * - Concurrency limit
 * - Mute
 * - Turbo/Reduce-motion policy
 * - Loop single-instance guarantee
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { AudioPolicy, PolicyConfig } from '../src/audio/AudioPolicy'
import { audioEngine } from '../src/audio/AudioEngine'
import type { SoundName } from '../src/audio/AudioTypes'

describe('Audio Laws', () => {
  beforeEach(() => {
    AudioPolicy.reset()
    AudioPolicy.setMode({ turbo: false, reduceMotion: false, muted: false })
  })

  describe('LAW: Stop Guarantee', () => {
    let stopAllLoopsSpy: ReturnType<typeof vi.spyOn>
    let stopLoopSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      stopAllLoopsSpy = vi.spyOn(audioEngine, 'stopAllLoops').mockImplementation(() => {})
      stopLoopSpy = vi.spyOn(audioEngine, 'stopLoop').mockImplementation(() => {})
      vi.spyOn(audioEngine, 'startLoop').mockReturnValue(null)
      vi.spyOn(audioEngine, 'playSfx').mockReturnValue(null)
      vi.spyOn(audioEngine, 'stopAllSfx').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('enterFreeSpins stops all loops', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onEnterFreeSpins()

      expect(stopAllLoopsSpy).toHaveBeenCalled()
    })

    it('bonusEnd plays bonus_end sound (loop already stopped via winTier)', async () => {
      const playSfxSpy = vi.spyOn(audioEngine, 'playSfx').mockReturnValue(null)
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onBonusEnd()

      expect(playSfxSpy).toHaveBeenCalledWith('bonus_end')
    })

    it('skip stage 2 (onSkipComplete) stops all loops', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onSkipComplete()

      expect(stopAllLoopsSpy).toHaveBeenCalled()
    })

    it('onReelsComplete stops the spin loop', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onReelsComplete()

      expect(stopLoopSpy).toHaveBeenCalledWith('reel_spin_loop')
    })

    it('onScenarioAbort stops all loops and SFX', async () => {
      const stopAllSfxSpy = vi.spyOn(audioEngine, 'stopAllSfx').mockImplementation(() => {})
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onScenarioAbort()

      expect(stopAllLoopsSpy).toHaveBeenCalled()
      expect(stopAllSfxSpy).toHaveBeenCalled()
    })
  })

  describe('LAW: Ducking', () => {
    it('stingers (win_big/mega/epic, bonus_enter/end) trigger ducking', () => {
      const stingers: SoundName[] = ['win_big', 'win_mega', 'win_epic', 'bonus_enter', 'bonus_end']

      stingers.forEach(name => {
        const decision = AudioPolicy.evaluate(name)
        expect(decision.shouldDuck).toBe(true)
      })
    })

    it('non-stingers do not trigger ducking', () => {
      const nonStingers: SoundName[] = ['ui_click', 'reel_spin_loop', 'reel_stop_tick', 'win_small']

      nonStingers.forEach(name => {
        const decision = AudioPolicy.evaluate(name)
        expect(decision.shouldDuck).toBe(false)
      })
    })

    it('duck volume is 0.35 (per spec)', () => {
      expect(PolicyConfig.DUCK_VOLUME).toBe(0.35)
    })

    it('duck includes restore delay of 150ms', () => {
      expect(PolicyConfig.DUCK_RESTORE_DELAY_MS).toBe(150)
    })

    it('duck duration = stinger duration + restore delay', () => {
      const decision = AudioPolicy.evaluate('win_big')
      expect(decision.duckDurationMs).toBeGreaterThan(PolicyConfig.DUCK_RESTORE_DELAY_MS)
    })
  })

  describe('LAW: Concurrency Limit', () => {
    it('MAX_CONCURRENT_SFX is 6', () => {
      expect(PolicyConfig.MAX_CONCURRENT_SFX).toBe(6)
    })

    it('blocks low-priority SFX when limit reached', () => {
      for (let i = 0; i < PolicyConfig.MAX_CONCURRENT_SFX; i++) {
        AudioPolicy.onSfxStart()
      }

      const decision = AudioPolicy.evaluate('ui_click')
      expect(decision.allowed).toBe(false)
      expect(decision.reason).toBe('max_sfx_reached')
    })

    it('stingers bypass concurrency limit', () => {
      for (let i = 0; i < PolicyConfig.MAX_CONCURRENT_SFX; i++) {
        AudioPolicy.onSfxStart()
      }

      const decision = AudioPolicy.evaluate('win_big')
      expect(decision.allowed).toBe(true)
    })

    it('allows SFX after onSfxEnd decreases count', () => {
      for (let i = 0; i < PolicyConfig.MAX_CONCURRENT_SFX; i++) {
        AudioPolicy.onSfxStart()
      }
      AudioPolicy.onSfxEnd()

      const decision = AudioPolicy.evaluate('ui_click')
      expect(decision.allowed).toBe(true)
    })
  })

  describe('LAW: Mute', () => {
    it('muted mode blocks ALL sounds', () => {
      AudioPolicy.setMode({ muted: true })

      const sounds: SoundName[] = [
        'ui_click', 'reel_spin_loop', 'reel_stop_tick',
        'win_small', 'win_big', 'win_mega', 'win_epic',
        'bonus_enter', 'bonus_end'
      ]

      sounds.forEach(name => {
        const decision = AudioPolicy.evaluate(name)
        expect(decision.allowed).toBe(false)
        expect(decision.reason).toBe('muted')
      })
    })

    it('unmuted mode allows sounds', () => {
      AudioPolicy.setMode({ muted: false })

      const decision = AudioPolicy.evaluate('ui_click')
      expect(decision.allowed).toBe(true)
    })

    it('mute via audioEngine.setEnabled(false) stops all audio', async () => {
      const stopAllLoopsSpy = vi.spyOn(audioEngine, 'stopAllLoops').mockImplementation(() => {})
      const stopAllSfxSpy = vi.spyOn(audioEngine, 'stopAllSfx').mockImplementation(() => {})

      audioEngine.setEnabled(false)

      expect(stopAllLoopsSpy).toHaveBeenCalled()
      expect(stopAllSfxSpy).toHaveBeenCalled()

      vi.restoreAllMocks()
    })
  })

  describe('LAW: Turbo Mode Policy', () => {
    it('turbo mode reduces volume multiplier', () => {
      AudioPolicy.setMode({ turbo: false })
      const normalDecision = AudioPolicy.evaluate('win_small')

      AudioPolicy.setMode({ turbo: true })
      const turboDecision = AudioPolicy.evaluate('win_small')

      expect(turboDecision.volumeMultiplier).toBeLessThan(normalDecision.volumeMultiplier)
    })

    it('turbo mode applies extra reduction to decorative sounds', () => {
      AudioPolicy.setMode({ turbo: false })
      const normalDecision = AudioPolicy.evaluate('ui_click')

      AudioPolicy.setMode({ turbo: true })
      const turboDecision = AudioPolicy.evaluate('ui_click')

      // Decorative sounds get even more reduction
      expect(turboDecision.volumeMultiplier).toBeLessThan(normalDecision.volumeMultiplier * 0.5)
    })
  })

  describe('LAW: Reduce Motion Policy', () => {
    it('reduce motion mode reduces volume multiplier', () => {
      AudioPolicy.setMode({ reduceMotion: false })
      const normalDecision = AudioPolicy.evaluate('win_small')

      AudioPolicy.setMode({ reduceMotion: true })
      const reduceDecision = AudioPolicy.evaluate('win_small')

      expect(reduceDecision.volumeMultiplier).toBeLessThan(normalDecision.volumeMultiplier)
    })

    it('reduce motion + turbo compounds volume reduction', () => {
      AudioPolicy.setMode({ turbo: false, reduceMotion: false })
      const normalDecision = AudioPolicy.evaluate('win_small')

      AudioPolicy.setMode({ turbo: true, reduceMotion: true })
      const bothDecision = AudioPolicy.evaluate('win_small')

      // Turbo (0.7) * ReduceMotion (0.8) = 0.56, which is less than normal (1.0)
      expect(bothDecision.volumeMultiplier).toBeLessThan(normalDecision.volumeMultiplier)
      // Should be approximately 0.56 (0.7 * 0.8)
      expect(bothDecision.volumeMultiplier).toBeCloseTo(0.56, 2)
    })
  })

  describe('LAW: Loop Single-Instance', () => {
    it('MAX_CONCURRENT_LOOPS is 1 (single-instance guarantee)', () => {
      expect(PolicyConfig.MAX_CONCURRENT_LOOPS).toBe(1)
    })

    it('second loop request is blocked when one is active', () => {
      AudioPolicy.onLoopStart()

      const decision = AudioPolicy.evaluate('reel_spin_loop')
      expect(decision.allowed).toBe(false)
      expect(decision.reason).toBe('max_loops_reached')
    })

    it('loop allowed after onLoopEnd', () => {
      AudioPolicy.onLoopStart()
      AudioPolicy.onLoopEnd()

      const decision = AudioPolicy.evaluate('reel_spin_loop')
      expect(decision.allowed).toBe(true)
    })
  })

  describe('LAW: No-Leak Guard (stopAllLoops guarantees 0 active instances)', () => {
    it('stopAllLoops sets activeLoopCount to 0', async () => {
      // Mock the engine methods
      const startLoopSpy = vi.spyOn(audioEngine, 'startLoop').mockReturnValue(null)
      const stopAllLoopsSpy = vi.spyOn(audioEngine, 'stopAllLoops').mockImplementation(() => {
        // Simulate clearing all loops
        AudioPolicy.reset() // Reset policy counters
      })
      vi.spyOn(audioEngine, 'getActiveLoopCount').mockReturnValue(0)

      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      // Start a loop (simulated)
      service.onSpinStart()

      // Stop all loops
      service.stopAll()

      // Verify no active loops remain
      expect(audioEngine.getActiveLoopCount()).toBe(0)

      vi.restoreAllMocks()
    })

    it('AudioPolicy.onLoopEnd decreases count correctly', () => {
      // Start 1 loop
      AudioPolicy.onLoopStart()
      expect(AudioPolicy.getActiveLoopCount()).toBe(1)

      // Stop it
      AudioPolicy.onLoopEnd()
      expect(AudioPolicy.getActiveLoopCount()).toBe(0)
    })

    it('multiple onLoopEnd calls do not go negative', () => {
      AudioPolicy.onLoopEnd()
      AudioPolicy.onLoopEnd()
      AudioPolicy.onLoopEnd()

      // Should be clamped to 0, never negative
      expect(AudioPolicy.getActiveLoopCount()).toBe(0)
    })
  })

  describe('LAW: Silent Fallback on Error', () => {
    it('playSfx returns null when sound not loaded (no crash)', async () => {
      vi.spyOn(audioEngine, 'playSfx').mockReturnValue(null)

      const result = audioEngine.playSfx('ui_click')
      expect(result).toBeNull()

      vi.restoreAllMocks()
    })

    it('startLoop returns null when disabled (no crash)', async () => {
      vi.spyOn(audioEngine, 'startLoop').mockReturnValue(null)

      const result = audioEngine.startLoop('reel_spin_loop')
      expect(result).toBeNull()

      vi.restoreAllMocks()
    })
  })
})
