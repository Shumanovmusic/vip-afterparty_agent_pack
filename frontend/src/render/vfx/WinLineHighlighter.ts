/**
 * WinLineHighlighter - Highlight winning cells with glow overlay
 * Respects MotionPrefs for Turbo and ReduceMotion modes
 */

import { Container, Graphics } from 'pixi.js'
import { MotionPrefs } from '../../ux/MotionPrefs'

/** Position on 5x3 grid */
export interface CellPosition {
  reel: number  // 0-4
  row: number   // 0-2
}

/** Highlight configuration */
export interface HighlightConfig {
  cellWidth: number
  cellHeight: number
  gridOffsetX: number
  gridOffsetY: number
  gap: number
}

/** Default config */
const DEFAULT_CONFIG: HighlightConfig = {
  cellWidth: 80,
  cellHeight: 80,
  gridOffsetX: 0,
  gridOffsetY: 0,
  gap: 4,
}

/**
 * WinLineHighlighter class
 * Manages glow overlays for winning cells
 */
export class WinLineHighlighter {
  private container: Container
  private config: HighlightConfig
  private activeHighlights: Graphics[] = []
  private pulseAnimation: number | null = null

  constructor(parent: Container, config: Partial<HighlightConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.container = new Container()
    this.container.label = 'win-line-highlighter'
    parent.addChild(this.container)
  }

  /**
   * Update configuration (e.g., after resize)
   */
  setConfig(config: Partial<HighlightConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Highlight winning cells
   * @param positions Array of flat positions (0-14) or CellPosition objects
   * @param duration Duration in ms (overrides mode-based default)
   */
  async highlight(
    positions: (number | CellPosition)[],
    duration?: number
  ): Promise<void> {
    // Clear any existing highlights
    this.clear()

    // Get duration based on mode
    const highlightDuration = duration ?? this.getModeDuration()

    // Convert flat positions to cell positions
    const cellPositions = positions.map(p => {
      if (typeof p === 'number') {
        return { reel: Math.floor(p / 3), row: p % 3 }
      }
      return p
    })

    // Create highlight graphics for each position
    for (const pos of cellPositions) {
      const highlight = this.createHighlight(pos)
      this.activeHighlights.push(highlight)
      this.container.addChild(highlight)
    }

    // Start pulse animation (unless Turbo or ReduceMotion)
    if (!MotionPrefs.turboEnabled && !MotionPrefs.reduceMotion) {
      this.startPulse()
    }

    // Wait for duration
    await this.delay(highlightDuration)

    // Clean up
    this.clear()
  }

  /**
   * Clear all highlights immediately
   */
  clear(): void {
    this.stopPulse()
    for (const highlight of this.activeHighlights) {
      highlight.destroy()
    }
    this.activeHighlights = []
    this.container.removeChildren()
  }

  /**
   * Destroy the highlighter
   */
  destroy(): void {
    this.clear()
    this.container.destroy()
  }

  /**
   * Get highlight duration based on current mode
   */
  private getModeDuration(): number {
    if (MotionPrefs.turboEnabled) return 250
    if (MotionPrefs.reduceMotion) return 500
    return 550
  }

  /**
   * Create a highlight graphic for a cell
   */
  private createHighlight(pos: CellPosition): Graphics {
    const { cellWidth, cellHeight, gridOffsetX, gridOffsetY, gap } = this.config

    const x = gridOffsetX + pos.reel * cellWidth
    const y = gridOffsetY + pos.row * cellHeight
    const w = cellWidth - gap
    const h = cellHeight - gap

    const g = new Graphics()

    // Outer glow (only in normal mode)
    if (!MotionPrefs.turboEnabled && !MotionPrefs.reduceMotion) {
      g.roundRect(x - 4, y - 4, w + 8, h + 8, 12)
      g.fill({ color: 0xffd700, alpha: 0.3 })
    }

    // Main highlight border
    g.roundRect(x, y, w, h, 8)
    g.stroke({ width: 3, color: 0xffd700, alpha: 0.9 })

    // Inner fill
    g.roundRect(x + 2, y + 2, w - 4, h - 4, 6)
    g.fill({ color: 0xffd700, alpha: 0.15 })

    return g
  }

  /**
   * Start pulse animation
   */
  private startPulse(): void {
    if (this.pulseAnimation !== null) return

    let phase = 0
    const pulseSpeed = 0.1

    const animate = () => {
      phase += pulseSpeed
      const alpha = 0.7 + Math.sin(phase) * 0.3

      for (const highlight of this.activeHighlights) {
        highlight.alpha = alpha
      }

      this.pulseAnimation = requestAnimationFrame(animate)
    }

    this.pulseAnimation = requestAnimationFrame(animate)
  }

  /**
   * Stop pulse animation
   */
  private stopPulse(): void {
    if (this.pulseAnimation !== null) {
      cancelAnimationFrame(this.pulseAnimation)
      this.pulseAnimation = null
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Factory function for creating a WinLineHighlighter
 */
export function createWinLineHighlighter(
  parent: Container,
  config?: Partial<HighlightConfig>
): WinLineHighlighter {
  return new WinLineHighlighter(parent, config)
}
