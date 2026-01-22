/**
 * SpotlightEvent - Spotlight beam highlighting cells with Wild/Multiplier badges
 * v1: VISUAL-ONLY - does not affect actual win calculation
 * Triggers based on heat level to add micro-events to base game
 *
 * Timing:
 * - Normal: ~600ms total
 * - Turbo: disabled (returns immediately)
 * - ReduceMotion: disabled (returns immediately)
 */

import { Container, Graphics, Text, Ticker } from 'pixi.js'
import { MotionPrefs } from '../../../ux/MotionPrefs'

/** Result type for spotlight targets */
export interface SpotlightEventResult {
  type: 'wild' | 'multiplier'
  value?: number  // For multiplier: 2 or 3
}

/** Grid position on 5x3 grid */
export interface SpotlightGridPosition {
  reel: number  // 0-4
  row: number   // 0-2
}

/** Configuration for the effect */
interface SpotlightEventConfig {
  /** Beam color */
  beamColor: number
  /** Beam width */
  beamWidth: number
  /** Highlight glow color */
  highlightColor: number
  /** Badge background color */
  badgeBgColor: number
  /** Badge text color */
  badgeTextColor: number
}

const DEFAULT_CONFIG: SpotlightEventConfig = {
  beamColor: 0xffd700,      // VIP Gold
  beamWidth: 60,
  highlightColor: 0xffd700,
  badgeBgColor: 0x1a1a2e,
  badgeTextColor: 0xffd700
}

/** Animation phase durations (normal mode) */
const TIMING = {
  BEAM_TRAVEL_MS: 200,      // Beam travels to target
  HIGHLIGHT_SCALE_MS: 150,  // Cell highlight scale-in
  BADGE_SHOW_MS: 100,       // Badge appears
  HOLD_MS: 100,             // Brief hold
  FADE_OUT_MS: 50           // Fade out
}

/** Total duration (normal mode: ~600ms) */
const TOTAL_DURATION_NORMAL_MS =
  TIMING.BEAM_TRAVEL_MS + TIMING.HIGHLIGHT_SCALE_MS +
  TIMING.BADGE_SHOW_MS + TIMING.HOLD_MS + TIMING.FADE_OUT_MS

/**
 * SpotlightEvent - Visual effect for cell highlighting with badges
 */
export class SpotlightEvent {
  readonly container: Container
  private beam: Graphics
  private cellHighlights: Graphics[] = []
  private badges: Container[] = []
  private isActive = false
  private skipRequested = false
  private config: SpotlightEventConfig

  // Animation state
  private _startTime = 0
  private _targetCells: SpotlightGridPosition[] = []
  private _results: SpotlightEventResult[] = []
  private _cellWidth = 0
  private _cellHeight = 0
  private _resolvePlay: (() => void) | null = null
  private _tickerCallback: ((ticker: Ticker) => void) | null = null

  // Verbose logging flag
  private _verbose = false

  constructor(config: Partial<SpotlightEventConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    this.container = new Container()
    this.container.label = 'SpotlightEvent'
    this.container.eventMode = 'none'
    this.container.visible = false

    // Create beam graphics
    this.beam = new Graphics()
    this.beam.label = 'SpotlightEventBeam'
    this.container.addChild(this.beam)
  }

  /**
   * Enable verbose logging (DEV)
   */
  setVerbose(verbose: boolean): void {
    this._verbose = verbose
  }

  /**
   * Check if spotlight event should trigger based on heat level
   * - heat >= 10: always trigger (100%)
   * - heat >= 6: 15% chance
   * - heat < 6: never trigger
   */
  static shouldTrigger(heatLevel: number): boolean {
    if (heatLevel >= 10) return true
    if (heatLevel >= 6) return Math.random() < 0.15
    return false
  }

  /**
   * Play the spotlight event animation
   * @param targetCells - Grid positions to highlight
   * @param results - Result types (wild/multiplier) for each cell
   * @param cellWidth - Cell width in pixels
   * @param cellHeight - Cell height in pixels
   */
  async play(
    targetCells: SpotlightGridPosition[],
    results: SpotlightEventResult[],
    cellWidth: number,
    cellHeight: number
  ): Promise<void> {
    // Gate: disabled in Turbo or ReduceMotion
    if (MotionPrefs.turboEnabled || MotionPrefs.reduceMotion) {
      if (this._verbose && import.meta.env.DEV) {
        console.log('[SpotlightEvent] Skipped - Turbo/ReduceMotion active')
      }
      return Promise.resolve()
    }

    // Guard against concurrent plays
    if (this.isActive) {
      if (this._verbose && import.meta.env.DEV) {
        console.log('[SpotlightEvent] Skipped - already active')
      }
      return Promise.resolve()
    }

    if (targetCells.length === 0) {
      return Promise.resolve()
    }

    // Store state
    this._targetCells = targetCells
    this._results = results
    this._cellWidth = cellWidth
    this._cellHeight = cellHeight
    this.skipRequested = false
    this.isActive = true
    this._startTime = performance.now()

    // Show container
    this.container.visible = true

    // Create cell highlights and badges for each target
    this.createHighlightsAndBadges()

    if (this._verbose && import.meta.env.DEV) {
      console.log('[SpotlightEvent] play()', {
        targets: targetCells,
        results,
        cellSize: { w: cellWidth, h: cellHeight }
      })
    }

    // Return promise that resolves when animation completes
    return new Promise<void>((resolve) => {
      this._resolvePlay = resolve

      // Start ticker
      this._tickerCallback = () => this.update()
      Ticker.shared.add(this._tickerCallback)
    })
  }

  /**
   * Create highlight graphics and badge containers for each target cell
   */
  private createHighlightsAndBadges(): void {
    // Clear previous
    this.cleanupHighlightsAndBadges()

    for (let i = 0; i < this._targetCells.length; i++) {
      const cell = this._targetCells[i]
      const result = this._results[i]

      // Calculate cell position
      const x = cell.reel * this._cellWidth
      const y = cell.row * this._cellHeight

      // Create highlight glow
      const highlight = new Graphics()
      highlight.label = `SpotlightHighlight_${i}`
      highlight.roundRect(4, 4, this._cellWidth - 8, this._cellHeight - 8, 8)
      highlight.fill({ color: this.config.highlightColor, alpha: 0 })
      highlight.position.set(x, y)
      highlight.scale.set(0.5)
      highlight.pivot.set(this._cellWidth / 2, this._cellHeight / 2)
      highlight.position.set(x + this._cellWidth / 2, y + this._cellHeight / 2)
      this.container.addChild(highlight)
      this.cellHighlights.push(highlight)

      // Create badge container
      const badge = this.createBadge(result)
      badge.position.set(x + this._cellWidth / 2, y + this._cellHeight / 2)
      badge.alpha = 0
      badge.scale.set(0)
      this.container.addChild(badge)
      this.badges.push(badge)
    }
  }

  /**
   * Create a badge container for a result
   */
  private createBadge(result: SpotlightEventResult): Container {
    const badge = new Container()
    badge.label = 'SpotlightBadge'

    // Background circle
    const bg = new Graphics()
    bg.circle(0, 0, 20)
    bg.fill({ color: this.config.badgeBgColor, alpha: 0.9 })
    bg.stroke({ color: this.config.badgeTextColor, width: 2 })
    badge.addChild(bg)

    // Text
    const text = result.type === 'wild'
      ? 'W'
      : `x${result.value ?? 2}`

    const label = new Text({
      text,
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: result.type === 'wild' ? 18 : 14,
        fontWeight: 'bold',
        fill: this.config.badgeTextColor,
        align: 'center'
      }
    })
    label.anchor.set(0.5)
    badge.addChild(label)

    return badge
  }

  /**
   * Animation update tick
   */
  private update(): void {
    if (!this.isActive) return

    const now = performance.now()
    const elapsed = now - this._startTime
    const totalDuration = TOTAL_DURATION_NORMAL_MS

    // Handle skip
    if (this.skipRequested || elapsed >= totalDuration) {
      this.complete()
      return
    }

    // Calculate animation phases
    const beamEnd = TIMING.BEAM_TRAVEL_MS
    const highlightEnd = beamEnd + TIMING.HIGHLIGHT_SCALE_MS
    const badgeEnd = highlightEnd + TIMING.BADGE_SHOW_MS
    const holdEnd = badgeEnd + TIMING.HOLD_MS

    // Phase 1: Beam travel
    if (elapsed < beamEnd) {
      const beamProgress = elapsed / beamEnd
      this.drawBeam(beamProgress)
    }
    // Phase 2: Highlight scale-in
    else if (elapsed < highlightEnd) {
      this.beam.alpha = Math.max(0, 1 - (elapsed - beamEnd) / 100)
      const highlightProgress = (elapsed - beamEnd) / TIMING.HIGHLIGHT_SCALE_MS
      this.updateHighlights(highlightProgress)
    }
    // Phase 3: Badge show
    else if (elapsed < badgeEnd) {
      this.beam.alpha = 0
      this.updateHighlights(1)
      const badgeProgress = (elapsed - highlightEnd) / TIMING.BADGE_SHOW_MS
      this.updateBadges(badgeProgress)
    }
    // Phase 4: Hold
    else if (elapsed < holdEnd) {
      this.updateHighlights(1)
      this.updateBadges(1)
    }
    // Phase 5: Fade out
    else {
      const fadeProgress = (elapsed - holdEnd) / TIMING.FADE_OUT_MS
      this.updateFadeOut(fadeProgress)
    }
  }

  /**
   * Draw beam traveling toward first target cell
   */
  private drawBeam(progress: number): void {
    if (this._targetCells.length === 0) return

    this.beam.clear()

    // Calculate first target position
    const firstCell = this._targetCells[0]
    const targetX = firstCell.reel * this._cellWidth + this._cellWidth / 2
    const targetY = firstCell.row * this._cellHeight + this._cellHeight / 2

    // Beam travels from top of grid toward target
    const startY = -this.config.beamWidth
    const currentY = startY + (targetY - startY) * this.easeOutQuad(progress)

    // Draw vertical beam
    const beamWidth = this.config.beamWidth
    const beamHeight = this._cellHeight * 1.5

    // Outer glow
    this.beam.rect(targetX - beamWidth / 2, currentY - beamHeight / 2, beamWidth, beamHeight)
    this.beam.fill({ color: this.config.beamColor, alpha: 0.2 })

    // Inner bright core
    this.beam.rect(targetX - beamWidth / 4, currentY - beamHeight / 2, beamWidth / 2, beamHeight)
    this.beam.fill({ color: this.config.beamColor, alpha: 0.5 })

    this.beam.alpha = 1
  }

  /**
   * Update highlight glow scale and alpha
   */
  private updateHighlights(progress: number): void {
    // Scale with overshoot easing
    const scale = this.easeOutBack(progress)
    const alpha = Math.min(1, progress * 1.5) * 0.6

    for (const highlight of this.cellHighlights) {
      highlight.scale.set(scale)
      highlight.clear()
      highlight.roundRect(
        -this._cellWidth / 2 + 4,
        -this._cellHeight / 2 + 4,
        this._cellWidth - 8,
        this._cellHeight - 8,
        8
      )
      highlight.fill({ color: this.config.highlightColor, alpha })
    }
  }

  /**
   * Update badge scale and alpha
   */
  private updateBadges(progress: number): void {
    const scale = this.easeOutBack(progress)
    const alpha = progress

    for (const badge of this.badges) {
      badge.scale.set(scale)
      badge.alpha = alpha
    }
  }

  /**
   * Update fade out for all elements
   */
  private updateFadeOut(progress: number): void {
    const alpha = 1 - progress

    for (const highlight of this.cellHighlights) {
      highlight.alpha = alpha
    }
    for (const badge of this.badges) {
      badge.alpha = alpha
    }
  }

  /**
   * Complete the animation
   */
  private complete(): void {
    this.isActive = false
    this.container.visible = false

    // Clear beam
    this.beam.clear()
    this.beam.alpha = 0

    // Cleanup highlights and badges
    this.cleanupHighlightsAndBadges()

    // Remove ticker
    if (this._tickerCallback) {
      Ticker.shared.remove(this._tickerCallback)
      this._tickerCallback = null
    }

    // Resolve promise
    if (this._resolvePlay) {
      this._resolvePlay()
      this._resolvePlay = null
    }

    if (this._verbose && import.meta.env.DEV) {
      console.log('[SpotlightEvent] complete')
    }
  }

  /**
   * Cleanup highlight and badge graphics
   */
  private cleanupHighlightsAndBadges(): void {
    for (const highlight of this.cellHighlights) {
      highlight.destroy()
    }
    this.cellHighlights = []

    for (const badge of this.badges) {
      badge.destroy({ children: true })
    }
    this.badges = []
  }

  /**
   * Request skip of current animation
   */
  skip(): void {
    if (this.isActive) {
      this.skipRequested = true
    }
  }

  /**
   * Check if animation is currently active
   */
  get active(): boolean {
    return this.isActive
  }

  /**
   * Easing: ease out quadratic
   */
  private easeOutQuad(t: number): number {
    return 1 - (1 - t) * (1 - t)
  }

  /**
   * Easing: ease out with overshoot (back)
   */
  private easeOutBack(t: number): number {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  }

  /**
   * Destroy and clean up
   */
  destroy(): void {
    this.complete()
    this.beam.destroy()
    this.container.destroy({ children: true })
  }
}
