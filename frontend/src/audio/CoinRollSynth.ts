/**
 * CoinRollSynth - WebAudio synthesizer for coin roll sound
 * Generates procedural 8-bit style coin cascade sound
 * Used during big win count-up when no audio file is available
 */

/** Configuration for coin roll synth */
export interface CoinRollConfig {
  /** Base volume (0-1) */
  volume?: number
  /** Tempo in BPM for coin ticks */
  tempo?: number
}

/**
 * WebAudio-based coin roll synthesizer
 * Creates rapid arpeggio "coin cascade" effect
 */
export class CoinRollSynth {
  private audioContext: AudioContext | null = null
  private gainNode: GainNode | null = null
  private masterVolume = 0.3
  private isPlaying = false
  private intervalId: number | null = null
  private noteIndex = 0

  // 8-bit style arpeggio notes (pentatonic scale in Hz)
  private readonly notes = [
    523.25,  // C5
    659.25,  // E5
    783.99,  // G5
    1046.50, // C6
    1318.51, // E6
    1567.98, // G6
  ]

  /**
   * Start the coin roll loop
   */
  start(config: CoinRollConfig = {}): void {
    if (this.isPlaying) return

    try {
      // Create or resume audio context
      if (!this.audioContext) {
        this.audioContext = new AudioContext()
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {})
      }

      this.masterVolume = config.volume ?? 0.3
      const tempo = config.tempo ?? 180

      // Create master gain node
      this.gainNode = this.audioContext.createGain()
      this.gainNode.connect(this.audioContext.destination)
      this.gainNode.gain.setValueAtTime(this.masterVolume, this.audioContext.currentTime)

      this.isPlaying = true
      this.noteIndex = 0

      // Calculate interval from tempo
      const interval = 60000 / tempo / 2  // 16th notes

      // Start the arpeggio loop
      this.playNote()
      this.intervalId = window.setInterval(() => {
        this.playNote()
      }, interval)

    } catch (error) {
      // Fail silently - audio is not critical
      console.debug('[CoinRollSynth] Failed to start:', error)
    }
  }

  /**
   * Stop the coin roll loop
   */
  stop(): void {
    if (!this.isPlaying) return

    this.isPlaying = false

    // Clear interval
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId)
      this.intervalId = null
    }

    // Fade out and disconnect
    if (this.gainNode && this.audioContext) {
      const now = this.audioContext.currentTime
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now)
      this.gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05)

      // Disconnect after fade
      setTimeout(() => {
        this.gainNode?.disconnect()
        this.gainNode = null
      }, 60)
    }
  }

  /**
   * Set volume (0-1)
   */
  setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume))
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setValueAtTime(this.masterVolume, this.audioContext.currentTime)
    }
  }

  /**
   * Set tempo dynamically (Task 9.2: rising pitch during count-up)
   * @param bpm - New tempo in beats per minute (clamped 60-300)
   */
  setTempo(bpm: number): void {
    if (!this.isPlaying || this.intervalId === null) return

    // Clamp BPM to reasonable range
    const clampedBpm = Math.max(60, Math.min(300, bpm))

    // Clear existing interval and restart with new tempo
    window.clearInterval(this.intervalId)
    const interval = 60000 / clampedBpm / 2  // 16th notes
    this.intervalId = window.setInterval(() => this.playNote(), interval)
  }

  /**
   * Check if currently playing
   */
  get playing(): boolean {
    return this.isPlaying
  }

  /**
   * Play a single note in the arpeggio
   */
  private playNote(): void {
    if (!this.audioContext || !this.gainNode || !this.isPlaying) return

    try {
      // Create oscillator for this note
      const osc = this.audioContext.createOscillator()
      const noteGain = this.audioContext.createGain()

      // Use square wave for 8-bit sound
      osc.type = 'square'
      osc.frequency.setValueAtTime(this.notes[this.noteIndex], this.audioContext.currentTime)

      // Connect through per-note gain for envelope
      osc.connect(noteGain)
      noteGain.connect(this.gainNode)

      // Short plucky envelope
      const now = this.audioContext.currentTime
      const noteVolume = 0.15 + Math.random() * 0.1  // Slight randomization
      noteGain.gain.setValueAtTime(noteVolume, now)
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)

      // Start and stop
      osc.start(now)
      osc.stop(now + 0.1)

      // Cleanup
      osc.onended = () => {
        osc.disconnect()
        noteGain.disconnect()
      }

      // Advance to next note (with some randomization for organic feel)
      if (Math.random() > 0.3) {
        this.noteIndex = (this.noteIndex + 1) % this.notes.length
      } else {
        // Occasionally jump to a random note
        this.noteIndex = Math.floor(Math.random() * this.notes.length)
      }

    } catch {
      // Ignore individual note errors
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stop()
    if (this.audioContext) {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }
  }
}

/** Singleton instance */
export const coinRollSynth = new CoinRollSynth()
