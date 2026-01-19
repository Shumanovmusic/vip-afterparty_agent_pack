/**
 * CameraFeedback - Punch-scale and micro-shake effects
 * Applied to main container for win celebrations
 *
 * punchScale: Big/Mega/Epic wins
 * microShake: Epic only, OFF in ReduceMotion
 */

import type { Container } from 'pixi.js'
import { MotionPrefs } from '../../ux/MotionPrefs'

/** Camera feedback configuration */
export interface CameraFeedbackConfig {
  /** Duration of punch scale effect in ms */
  punchDuration: number
  /** Duration of micro shake effect in ms */
  shakeDuration: number
  /** Max scale for punch (1.0 = no scale) */
  punchScaleMax: number
  /** Max offset for shake in pixels */
  shakeOffsetMax: number
}

/** Default configuration */
const DEFAULT_CONFIG: CameraFeedbackConfig = {
  punchDuration: 150,
  shakeDuration: 100,
  punchScaleMax: 1.05,
  shakeOffsetMax: 4,
}

/**
 * CameraFeedback class
 * Manages screen effects on the main container
 */
export class CameraFeedback {
  private container: Container | null = null
  private config: CameraFeedbackConfig
  private originalX: number = 0
  private originalY: number = 0
  private originalScaleX: number = 1
  private originalScaleY: number = 1
  private activeAnimation: number | null = null

  constructor(config: Partial<CameraFeedbackConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Set the container to apply effects to
   */
  setContainer(container: Container): void {
    this.container = container
    this.saveOriginalState()
  }

  /**
   * Save original container state
   */
  private saveOriginalState(): void {
    if (!this.container) return
    this.originalX = this.container.x
    this.originalY = this.container.y
    this.originalScaleX = this.container.scale.x
    this.originalScaleY = this.container.scale.y
  }

  /**
   * Restore original container state
   */
  private restoreOriginalState(): void {
    if (!this.container) return
    this.container.x = this.originalX
    this.container.y = this.originalY
    this.container.scale.x = this.originalScaleX
    this.container.scale.y = this.originalScaleY
  }

  /**
   * Punch scale effect (1.0 -> max -> 1.0)
   * Used for Big/Mega/Epic wins
   * @param intensity 0-1 intensity multiplier
   */
  async punchScale(intensity: number = 1): Promise<void> {
    if (!this.container) return

    // Cancel any active animation
    this.cancel()

    const { punchDuration, punchScaleMax } = this.config
    const maxScale = 1 + (punchScaleMax - 1) * intensity

    return new Promise<void>((resolve) => {
      const startTime = performance.now()
      this.saveOriginalState()

      const animate = (time: number) => {
        const elapsed = time - startTime
        const progress = Math.min(elapsed / punchDuration, 1)

        // Ease out bounce curve
        const scale = this.easeOutBounce(progress, 1, maxScale)

        if (this.container) {
          this.container.scale.x = this.originalScaleX * scale
          this.container.scale.y = this.originalScaleY * scale
        }

        if (progress < 1) {
          this.activeAnimation = requestAnimationFrame(animate)
        } else {
          this.restoreOriginalState()
          this.activeAnimation = null
          resolve()
        }
      }

      this.activeAnimation = requestAnimationFrame(animate)
    })
  }

  /**
   * Micro shake effect (small x/y offsets)
   * Used for Epic wins only, OFF in ReduceMotion
   * @param intensity 0-1 intensity multiplier
   */
  async microShake(intensity: number = 1): Promise<void> {
    if (!this.container) return

    // Disabled in ReduceMotion
    if (MotionPrefs.reduceMotion) return

    // Cancel any active animation
    this.cancel()

    const { shakeDuration, shakeOffsetMax } = this.config
    const maxOffset = shakeOffsetMax * intensity

    return new Promise<void>((resolve) => {
      const startTime = performance.now()
      this.saveOriginalState()

      const animate = (time: number) => {
        const elapsed = time - startTime
        const progress = Math.min(elapsed / shakeDuration, 1)

        // Decay shake intensity over time
        const decay = 1 - progress
        const offsetX = (Math.random() - 0.5) * 2 * maxOffset * decay
        const offsetY = (Math.random() - 0.5) * 2 * maxOffset * decay

        if (this.container) {
          this.container.x = this.originalX + offsetX
          this.container.y = this.originalY + offsetY
        }

        if (progress < 1) {
          this.activeAnimation = requestAnimationFrame(animate)
        } else {
          this.restoreOriginalState()
          this.activeAnimation = null
          resolve()
        }
      }

      this.activeAnimation = requestAnimationFrame(animate)
    })
  }

  /**
   * Combined effect for win tiers
   * @param tier Win tier ('big' | 'mega' | 'epic')
   */
  async winEffect(tier: 'big' | 'mega' | 'epic'): Promise<void> {
    switch (tier) {
      case 'big':
        await this.punchScale(0.5)
        break
      case 'mega':
        await this.punchScale(0.75)
        break
      case 'epic':
        // Epic gets both punch and shake
        await this.punchScale(1)
        await this.microShake(1)
        break
    }
  }

  /**
   * Cancel any active animation
   */
  cancel(): void {
    if (this.activeAnimation !== null) {
      cancelAnimationFrame(this.activeAnimation)
      this.activeAnimation = null
      this.restoreOriginalState()
    }
  }

  /**
   * Ease out bounce curve for punch effect
   * Goes from 1 -> maxScale -> 1
   */
  private easeOutBounce(t: number, start: number, peak: number): number {
    // First half: ease to peak
    // Second half: ease back to start
    if (t < 0.5) {
      // Ease out to peak
      const t2 = t * 2
      const eased = 1 - Math.pow(1 - t2, 2)
      return start + (peak - start) * eased
    } else {
      // Ease back to start
      const t2 = (t - 0.5) * 2
      const eased = Math.pow(1 - t2, 2)
      return start + (peak - start) * eased
    }
  }
}

/**
 * Singleton instance
 */
export const cameraFeedback = new CameraFeedback()

/**
 * Factory function for creating CameraFeedback
 */
export function createCameraFeedback(
  config?: Partial<CameraFeedbackConfig>
): CameraFeedback {
  return new CameraFeedback(config)
}
