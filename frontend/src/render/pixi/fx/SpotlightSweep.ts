/**
 * SpotlightSweep - VIP spotlight beam sweep effect
 * Purely visual FX that sweeps across the reels grid
 * Uses Graphics layers for soft beam effect (no shaders)
 */

import { Container, Graphics, Ticker } from 'pixi.js'

/** Spotlight sweep options */
export interface SpotlightSweepOptions {
  /** Grid width in pixels */
  gridW: number
  /** Grid height in pixels */
  gridH: number
  /** Sweep direction */
  direction?: 'L2R' | 'R2L'
  /** Animation duration in ms */
  durationMs: number
  /** Beam intensity [0..1] */
  intensity: number
}

/** Beam visual constants */
const BEAM_WIDTH = 80
const BEAM_COLOR = 0xffd700 // VIP Gold
const BEAM_LAYERS = 3
const OVERSHOOT = BEAM_WIDTH * 1.5

/**
 * SpotlightSweep - Pixi-based spotlight animation
 */
export class SpotlightSweep {
  public readonly container: Container

  /** Graphics layers for soft beam effect */
  private beamLayers: Graphics[] = []

  /** Grid dimensions */
  private gridW = 0
  private gridH = 0

  /** Animation state */
  private _isPlaying = false
  private _startTime = 0
  private _duration = 0
  private _direction: 'L2R' | 'R2L' = 'L2R'
  private _intensity = 0.35

  /** Ticker reference for cleanup */
  private _tickerCallback: ((delta: Ticker) => void) | null = null
  private _ticker: Ticker | null = null

  /** Verbose logging */
  private _verbose = false

  constructor() {
    this.container = new Container()
    this.container.label = 'SpotlightSweep'
    this.container.eventMode = 'none'
    this.container.visible = false

    // Create layered beam graphics for soft glow effect
    for (let i = 0; i < BEAM_LAYERS; i++) {
      const g = new Graphics()
      g.label = `BeamLayer${i}`
      this.beamLayers.push(g)
      this.container.addChild(g)
    }
  }

  /**
   * Set verbose logging (DEV)
   */
  setVerbose(verbose: boolean): void {
    this._verbose = verbose
  }

  /**
   * Update grid dimensions
   */
  setGridDimensions(gridW: number, gridH: number): void {
    this.gridW = gridW
    this.gridH = gridH
  }

  /**
   * Check if animation is playing
   */
  get isPlaying(): boolean {
    return this._isPlaying
  }

  /**
   * Play spotlight sweep animation
   */
  play(options: SpotlightSweepOptions): void {
    // Cancel any existing animation
    this.cancel()

    // Store options
    this.gridW = options.gridW
    this.gridH = options.gridH
    this._direction = options.direction ?? 'L2R'
    this._duration = options.durationMs
    this._intensity = Math.max(0, Math.min(1, options.intensity))

    // DEBUG: Unconditional trace logging
    if (import.meta.env.DEV) {
      console.log('[SpotlightSweep] PLAY CALLED!', {
        gridW: this.gridW,
        gridH: this.gridH,
        direction: this._direction,
        durationMs: this._duration,
        intensity: this._intensity,
        containerVisible: this.container.visible,
        containerParent: !!this.container.parent
      })
    }

    // Show container
    this.container.visible = true
    this._isPlaying = true
    this._startTime = performance.now()

    // Start ticker
    this._ticker = Ticker.shared
    this._tickerCallback = () => this.update()
    this._ticker.add(this._tickerCallback)
  }

  /**
   * Cancel current animation
   */
  cancel(): void {
    if (!this._isPlaying) return

    this._isPlaying = false
    this.container.visible = false

    // Remove ticker callback
    if (this._ticker && this._tickerCallback) {
      this._ticker.remove(this._tickerCallback)
      this._tickerCallback = null
      this._ticker = null
    }

    // Clear graphics
    for (const g of this.beamLayers) {
      g.clear()
    }

    if (this._verbose && import.meta.env.DEV) {
      console.log('[SpotlightSweep] cancelled')
    }
  }

  /**
   * Update animation frame
   */
  private update(): void {
    if (!this._isPlaying) return

    const now = performance.now()
    const elapsed = now - this._startTime
    const progress = Math.min(1, elapsed / this._duration)

    // Calculate beam X position
    const startX = this._direction === 'L2R' ? -OVERSHOOT : this.gridW + OVERSHOOT
    const endX = this._direction === 'L2R' ? this.gridW + OVERSHOOT : -OVERSHOOT
    const currentX = startX + (endX - startX) * this.easeInOutQuad(progress)

    // Draw beam at current position
    this.drawBeam(currentX)

    // Check completion
    if (progress >= 1) {
      this.cancel()
    }
  }

  /**
   * Draw the beam at the given X position
   */
  private drawBeam(centerX: number): void {
    // Each layer has increasing width and decreasing alpha
    for (let i = 0; i < BEAM_LAYERS; i++) {
      const g = this.beamLayers[i]
      g.clear()

      // Layer properties
      const layerMultiplier = 1 + i * 0.5
      const layerWidth = BEAM_WIDTH * layerMultiplier
      const layerAlpha = this._intensity * (1 - i * 0.25)

      // Calculate visible portion (clipped to grid)
      const leftEdge = centerX - layerWidth / 2
      const rightEdge = centerX + layerWidth / 2

      // Skip if completely outside grid
      if (rightEdge < 0 || leftEdge > this.gridW) continue

      // Clamp to grid bounds for drawing
      const drawLeft = Math.max(0, leftEdge)
      const drawRight = Math.min(this.gridW, rightEdge)
      const drawWidth = drawRight - drawLeft

      if (drawWidth <= 0) continue

      // Draw rectangle
      g.rect(drawLeft, 0, drawWidth, this.gridH)
      g.fill({
        color: BEAM_COLOR,
        alpha: layerAlpha
      })
    }
  }

  /**
   * Ease function for smooth animation
   */
  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
  }

  /**
   * Destroy and clean up
   */
  destroy(): void {
    this.cancel()

    for (const g of this.beamLayers) {
      g.destroy()
    }
    this.beamLayers = []

    this.container.destroy({ children: true })
  }
}
