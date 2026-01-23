/**
 * DimOverlay - Overlay-based dimming for non-winning cells
 * Source of truth: UX_ANIMATION_SPEC.md (DIM STRATEGY section)
 *
 * Uses per-cell overlay rectangles rather than per-sprite alpha
 * to avoid conflicts with blur/filters and improve performance.
 */

import { Container, Graphics } from 'pixi.js'

/** Grid configuration for dim overlay */
export interface DimOverlayConfig {
  cellWidth: number
  cellHeight: number
  gridOffsetX: number
  gridOffsetY: number
  cols: number  // Default 5
  rows: number  // Default 3
  gap: number   // Gap between cells
}

/** Default configuration for 5x3 grid */
const DEFAULT_CONFIG: DimOverlayConfig = {
  cellWidth: 100,
  cellHeight: 100,
  gridOffsetX: 0,
  gridOffsetY: 0,
  cols: 5,
  rows: 3,
  gap: 0
}

/** Dim alpha levels per UX spec */
const DIM_ALPHA = {
  HIGHLIGHT: 0.55,   // During highlight phase
  CELEBRATION: 0.65  // During celebration phase (slightly darker)
} as const

/**
 * DimOverlay - Manages overlay rectangles for dimming non-winning cells
 */
export class DimOverlay {
  private container: Container
  private cells: Graphics[] = []
  private config: DimOverlayConfig
  private isVisible = false

  constructor(parent: Container, config: Partial<DimOverlayConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    this.container = new Container()
    this.container.label = 'DimOverlay'
    // Prevent overlay from blocking clicks
    this.container.eventMode = 'none'
    this.container.visible = false

    // Create cell overlays
    this.createCells()

    parent.addChild(this.container)
  }

  /**
   * Create overlay graphics for each cell
   */
  private createCells(): void {
    const { cols, rows, cellWidth, cellHeight, gridOffsetX, gridOffsetY, gap } = this.config
    const totalCells = cols * rows

    for (let i = 0; i < totalCells; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)

      const x = gridOffsetX + col * cellWidth + gap / 2
      const y = gridOffsetY + row * cellHeight + gap / 2
      const w = cellWidth - gap
      const h = cellHeight - gap

      const cell = new Graphics()
      cell.label = `DimCell_${col}_${row}`
      cell.rect(x, y, w, h)
      cell.fill({ color: 0x000000, alpha: 1 })
      cell.alpha = 0 // Start transparent

      this.cells.push(cell)
      this.container.addChild(cell)
    }
  }

  /**
   * Update configuration (e.g., after resize)
   */
  setConfig(config: Partial<DimOverlayConfig>): void {
    this.config = { ...this.config, ...config }
    this.rebuildCells()
  }

  /**
   * Rebuild cell graphics with current config
   */
  private rebuildCells(): void {
    // Clear existing cells
    for (const cell of this.cells) {
      cell.destroy()
    }
    this.cells = []
    this.container.removeChildren()

    // Recreate cells
    this.createCells()
  }

  /**
   * Show dim overlay, making losing cells semi-transparent
   * @param winningIndices - Flat indices (0-14) of winning cells to NOT dim
   * @param phase - 'highlight' or 'celebration' for alpha level
   */
  show(winningIndices: number[], phase: 'highlight' | 'celebration' = 'highlight'): void {
    const alpha = phase === 'celebration' ? DIM_ALPHA.CELEBRATION : DIM_ALPHA.HIGHLIGHT
    const winSet = new Set(winningIndices)

    for (let i = 0; i < this.cells.length; i++) {
      // Winning cells: transparent (no dim)
      // Losing cells: dimmed
      this.cells[i].alpha = winSet.has(i) ? 0 : alpha
    }

    this.container.visible = true
    this.isVisible = true
  }

  /**
   * Show dim with specific alpha for all non-winning cells
   * @param winningIndices - Flat indices of winning cells
   * @param alpha - Custom alpha value (0-1)
   */
  showWithAlpha(winningIndices: number[], alpha: number): void {
    const winSet = new Set(winningIndices)
    const clampedAlpha = Math.max(0, Math.min(1, alpha))

    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i].alpha = winSet.has(i) ? 0 : clampedAlpha
    }

    this.container.visible = true
    this.isVisible = true
  }

  /**
   * Hide dim overlay immediately
   */
  hide(): void {
    // Reset all cells to transparent
    for (const cell of this.cells) {
      cell.alpha = 0
    }
    this.container.visible = false
    this.isVisible = false
  }

  /**
   * Fade out dim overlay (for smooth transitions)
   * @param durationMs - Fade duration in milliseconds
   * @returns Promise that resolves when fade completes
   */
  async fadeOut(durationMs: number = 200): Promise<void> {
    if (!this.isVisible) return

    const startAlphas = this.cells.map(c => c.alpha)
    const startTime = performance.now()

    return new Promise(resolve => {
      const animate = () => {
        const elapsed = performance.now() - startTime
        const t = Math.min(elapsed / durationMs, 1)

        for (let i = 0; i < this.cells.length; i++) {
          this.cells[i].alpha = startAlphas[i] * (1 - t)
        }

        if (t < 1) {
          requestAnimationFrame(animate)
        } else {
          this.hide()
          resolve()
        }
      }

      requestAnimationFrame(animate)
    })
  }

  /**
   * Check if overlay is currently visible
   */
  get visible(): boolean {
    return this.isVisible
  }

  /**
   * Convert reel/row position to flat index
   * @param reel - Reel index (0-4)
   * @param row - Row index (0-2)
   * @param _cols - Number of columns (unused, kept for API compatibility)
   */
  static positionToIndex(reel: number, row: number, _cols: number = 5): number {
    return reel * 3 + row  // For 5x3 grid stored as reel-major
  }

  /**
   * Convert flat index to reel/row position
   * @param index - Flat index (0-14)
   * @param _cols - Number of columns (unused, kept for API compatibility)
   */
  static indexToPosition(index: number, _cols: number = 5): { reel: number; row: number } {
    return {
      reel: Math.floor(index / 3),
      row: index % 3
    }
  }

  /**
   * Destroy overlay and cleanup
   */
  destroy(): void {
    for (const cell of this.cells) {
      cell.destroy()
    }
    this.cells = []
    this.container.destroy()
  }
}

/**
 * Factory function to create DimOverlay
 */
export function createDimOverlay(
  parent: Container,
  config?: Partial<DimOverlayConfig>
): DimOverlay {
  return new DimOverlay(parent, config)
}
