/**
 * Audio Integration Tests
 * Tests for audio integration with game flow
 * Source of truth: Audio Assets v1 spec
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { audioEngine } from '../src/audio/AudioEngine'
import { AudioPolicy } from '../src/audio/AudioPolicy'

// Create spies for the audioEngine methods
describe('AudioService Integration', () => {
  let startLoopSpy: ReturnType<typeof vi.spyOn>
  let stopLoopSpy: ReturnType<typeof vi.spyOn>
  let stopAllLoopsSpy: ReturnType<typeof vi.spyOn>
  let stopAllSfxSpy: ReturnType<typeof vi.spyOn>
  let playSfxSpy: ReturnType<typeof vi.spyOn>
  let setEnabledSpy: ReturnType<typeof vi.spyOn>
  let setMasterVolumeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Reset audio policy
    AudioPolicy.reset()

    // Create spies that mock the implementations
    startLoopSpy = vi.spyOn(audioEngine, 'startLoop').mockReturnValue(null)
    stopLoopSpy = vi.spyOn(audioEngine, 'stopLoop').mockImplementation(() => {})
    stopAllLoopsSpy = vi.spyOn(audioEngine, 'stopAllLoops').mockImplementation(() => {})
    stopAllSfxSpy = vi.spyOn(audioEngine, 'stopAllSfx').mockImplementation(() => {})
    playSfxSpy = vi.spyOn(audioEngine, 'playSfx').mockReturnValue(null)
    setEnabledSpy = vi.spyOn(audioEngine, 'setEnabled').mockImplementation(() => {})
    setMasterVolumeSpy = vi.spyOn(audioEngine, 'setMasterVolume').mockImplementation(() => {})

    // Also mock isLoopPlaying and getter methods
    vi.spyOn(audioEngine, 'isLoopPlaying').mockReturnValue(false)
    vi.spyOn(audioEngine, 'isEnabled').mockReturnValue(true)
    vi.spyOn(audioEngine, 'getMasterVolume').mockReturnValue(1)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Import AudioService after mocks are set up
  // We need to test the service's method calls to audioEngine

  describe('Spin Lifecycle - AudioService methods', () => {
    it('onSpinStart should call startLoop with reel_spin_loop', async () => {
      // Dynamically import to get fresh module
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onSpinStart()

      expect(startLoopSpy).toHaveBeenCalledWith('reel_spin_loop')
    })

    it('onReelsComplete should call stopLoop with reel_spin_loop', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onReelsComplete()

      expect(stopLoopSpy).toHaveBeenCalledWith('reel_spin_loop')
    })

    it('onReelStop should call playSfx with reel_stop_tick', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onReelStop()

      expect(playSfxSpy).toHaveBeenCalledWith('reel_stop_tick')
    })
  })

  describe('Skip Behavior', () => {
    it('onSkipComplete should call stopAllLoops', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onSkipComplete()

      expect(stopAllLoopsSpy).toHaveBeenCalled()
    })

    it('onSkipAccelerate should not call stopAllLoops', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onSkipAccelerate()

      expect(stopAllLoopsSpy).not.toHaveBeenCalled()
    })
  })

  describe('Bonus Events', () => {
    it('onEnterFreeSpins should stop loops and play bonus_enter', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onEnterFreeSpins()

      expect(stopAllLoopsSpy).toHaveBeenCalled()
      expect(playSfxSpy).toHaveBeenCalledWith('bonus_enter')
    })

    it('onBonusEnd should play bonus_end', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onBonusEnd()

      expect(playSfxSpy).toHaveBeenCalledWith('bonus_end')
    })
  })

  describe('Win Tier Events', () => {
    it('onWinTier(big) should stop loops and play win_big', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onWinTier('big')

      expect(stopAllLoopsSpy).toHaveBeenCalled()
      expect(playSfxSpy).toHaveBeenCalledWith('win_big')
    })

    it('onWinTier(mega) should play win_mega', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onWinTier('mega')

      expect(playSfxSpy).toHaveBeenCalledWith('win_mega')
    })

    it('onWinTier(epic) should play win_epic', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onWinTier('epic')

      expect(playSfxSpy).toHaveBeenCalledWith('win_epic')
    })

    it('onWinTier(none) should not play anything', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onWinTier('none')

      expect(playSfxSpy).not.toHaveBeenCalled()
    })

    it('onWinSmall should play win_small', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onWinSmall()

      expect(playSfxSpy).toHaveBeenCalledWith('win_small')
    })
  })

  describe('UI Sounds', () => {
    it('playUIClick should play ui_click', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.playUIClick()

      expect(playSfxSpy).toHaveBeenCalledWith('ui_click')
    })
  })

  describe('Error Recovery', () => {
    it('onScenarioAbort should stop all loops and SFX', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.onScenarioAbort()

      expect(stopAllLoopsSpy).toHaveBeenCalled()
      expect(stopAllSfxSpy).toHaveBeenCalled()
    })

    it('stopAll should stop all loops and SFX', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.stopAll()

      expect(stopAllLoopsSpy).toHaveBeenCalled()
      expect(stopAllSfxSpy).toHaveBeenCalled()
    })
  })

  describe('Sound Settings', () => {
    it('setSoundEnabled(false) should call setEnabled(false)', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.setSoundEnabled(false)

      expect(setEnabledSpy).toHaveBeenCalledWith(false)
    })

    it('setVolume should call setMasterVolume', async () => {
      const { AudioService } = await import('../src/audio/AudioService')
      const service = new AudioService()

      service.setVolume(0.5)

      expect(setMasterVolumeSpy).toHaveBeenCalledWith(0.5)
    })
  })
})
