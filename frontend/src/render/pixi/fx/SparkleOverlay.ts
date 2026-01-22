/**
 * SparkleOverlay - Animated sparkle effect for premium symbols (WILD/DIAMOND)
 * Uses 4-pointed stars with sine-based alpha animation
 * Respects MotionPrefs (turbo/reduceMotion disables)
 */

import { Container, Graphics, Ticker } from 'pixi.js'
import { MotionPrefs } from '../../../ux/MotionPrefs'

/** Configuration for SparkleOverlay */
export interface SparkleOverlayConfig {
  width: number
  height: number
  pointCount: number
  color: number
  maxRadius: number
}

/** Internal sparkle point state (preallocated) */
interface SparklePoint {
  x: number        // Local position
  y: number
  phase: number    // 0-1, animated
  speed: number    // Phase increment per frame (0.008-0.02)
  size: number     // 0.5-1.0 multiplier
  driftX: number   // Drift direction X
  driftY: number   // Drift direction Y
}

const DEFAULT_CONFIG: SparkleOverlayConfig = {
  width: 100,
  height: 100,
  pointCount: 6,
  color: 0xffd700,  // VIP Gold
  maxRadius: 5
}

/**
 * SparkleOverlay - Renders animated sparkles over a symbol cell
 */
export class SparkleOverlay {
  public readonly container: Container
  private graphics: Graphics
  private points: SparklePoint[] = []
  private active = false
  private config: SparkleOverlayConfig
  private tickerCallback: ((ticker: Ticker) => void) | null = null

  constructor(config: Partial<SparkleOverlayConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    this.container = new Container()
    this.container.label = 'SparkleOverlay'
    this.container.eventMode = 'none'
    this.container.visible = false

    this.graphics = new Graphics()
    this.graphics.label = 'SparkleGraphics'
    this.container.addChild(this.graphics)

    // Preallocate sparkle points
    this.initPoints()
  }

  /**
   * Check if sparkle effects should be enabled
   * OFF if turbo or reduceMotion
   */
  get isEnabled(): boolean {
    return !MotionPrefs.turboEnabled && !MotionPrefs.reduceMotion
  }

  /**
   * Activate sparkle animation
   */
  activate(): void {
    if (!this.isEnabled) {
      this.deactivate()
      return
    }

    if (this.active) return

    this.active = true
    this.container.visible = true

    // Randomize starting phases
    for (const point of this.points) {
      point.phase = Math.random()
    }

    // Start ticker
    this.tickerCallback = (ticker: Ticker) => this.update(ticker)
    Ticker.shared.add(this.tickerCallback)
  }

  /**
   * Deactivate sparkle animation
   */
  deactivate(): void {
    if (!this.active) return

    this.active = false
    this.container.visible = false
    this.graphics.clear()

    // Stop ticker
    if (this.tickerCallback) {
      Ticker.shared.remove(this.tickerCallback)
      this.tickerCallback = null
    }
  }

  /**
   * Update configuration (for layout changes)
   */
  updateConfig(config: Partial<SparkleOverlayConfig>): void {
    const needsReinit =
      config.pointCount !== undefined && config.pointCount !== this.config.pointCount

    this.config = { ...this.config, ...config }

    if (needsReinit) {
      this.initPoints()
    } else {
      // Reposition existing points within new bounds
      this.repositionPoints()
    }
  }

  /**
   * Initialize sparkle points (preallocated)
   */
  private initPoints(): void {
    this.points = []
    const { width, height, pointCount } = this.config

    for (let i = 0; i < pointCount; i++) {
      this.points.push({
        x: Math.random() * width,
        y: Math.random() * height,
        phase: Math.random(),
        speed: 0.008 + Math.random() * 0.012,  // 0.008-0.02
        size: 0.5 + Math.random() * 0.5,       // 0.5-1.0
        driftX: (Math.random() - 0.5) * 0.3,   // Slow drift
        driftY: (Math.random() - 0.5) * 0.3
      })
    }
  }

  /**
   * Reposition points within current bounds
   */
  private repositionPoints(): void {
    const { width, height } = this.config

    for (const point of this.points) {
      // Clamp positions to new bounds
      point.x = Math.max(0, Math.min(width, point.x))
      point.y = Math.max(0, Math.min(height, point.y))
    }
  }

  /**
   * Animation update tick
   */
  private update(ticker: Ticker): void {
    if (!this.active) return

    const { width, height } = this.config
    const deltaFactor = ticker.deltaTime  // ~1 at 60fps

    // Update point positions and phases
    for (const point of this.points) {
      // Advance phase
      point.phase += point.speed * deltaFactor
      if (point.phase >= 1) {
        point.phase -= 1
      }

      // Slow drift
      point.x += point.driftX * deltaFactor
      point.y += point.driftY * deltaFactor

      // Wrap around bounds
      if (point.x < 0) point.x = width
      if (point.x > width) point.x = 0
      if (point.y < 0) point.y = height
      if (point.y > height) point.y = 0
    }

    this.draw()
  }

  /**
   * Draw all sparkle points as 4-pointed stars
   */
  private draw(): void {
    const g = this.graphics
    const { color, maxRadius } = this.config

    g.clear()

    for (const point of this.points) {
      // Sine-based alpha: peak at phase 0.5
      const alpha = Math.sin(point.phase * Math.PI)
      if (alpha < 0.05) continue  // Skip nearly invisible

      const radius = maxRadius * point.size * (0.6 + alpha * 0.4)

      // Draw 4-pointed star
      g.star(point.x, point.y, 4, radius, radius * 0.4)
      g.fill({ color, alpha: alpha * 0.9 })
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.deactivate()
    this.graphics.destroy()
    this.container.destroy({ children: true })
    this.points = []
  }
}
