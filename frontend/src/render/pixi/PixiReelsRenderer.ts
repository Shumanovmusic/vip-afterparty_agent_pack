/**
 * PixiReelsRenderer - Coordinates 5 reel strips for the slot grid
 * Handles spin/stop animations and win highlighting
 * Integrates with AnimationLibrary event system
 */

import { Container, Graphics } from 'pixi.js'
import { ReelStrip, type ReelStripConfig } from './ReelStrip'
import { Animations, type GridPosition, flatToGrid } from '../../ux/animations/AnimationLibrary'
import { MotionPrefs, TIMING } from '../../ux/MotionPrefs'

/** Layout configuration for the reels grid */
export interface ReelsLayoutConfig {
  gridWidth: number
  gridHeight: number
  symbolWidth: number
  symbolHeight: number
  offsetX: number
  offsetY: number
  gap: number
}

/** Highlight style for win lines */
const HIGHLIGHT_COLOR = 0xffd700
const HIGHLIGHT_BORDER_WIDTH = 3
const WILD_GLOW_COLOR = 0xffd700
const WILD_GLOW_ALPHA = 0.5

let reelDebugLogged = false

/**
 * PixiReelsRenderer - Main reels rendering coordinator
 */
export class PixiReelsRenderer {
  public readonly container: Container
  private reelStrips: ReelStrip[] = []
  private highlightGraphics: Graphics
  private wildGlowGraphics: Graphics
  private layout: ReelsLayoutConfig | null = null

  // Grid state
  private currentGrid: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ]

  // Highlight state
  private highlightedPositions: Set<number> = new Set()
  private wildPositions: Set<number> = new Set()
  private dimmedSymbols = false

  constructor(parentContainer: Container) {
    // Create main container for reels
    this.container = new Container()
    this.container.label = 'PixiReelsRenderer'
    this.container.eventMode = 'none'
    parentContainer.addChild(this.container)

    console.log(`[PixiReelsRenderer] constructor - parentContainer label: ${parentContainer.label}, children: ${parentContainer.children.length}`)
    console.log(`[PixiReelsRenderer] this.container position: (${this.container.x}, ${this.container.y})`)

    // Create overlay graphics layers
    this.highlightGraphics = new Graphics()
    this.highlightGraphics.label = 'HighlightOverlay'

    this.wildGlowGraphics = new Graphics()
    this.wildGlowGraphics.label = 'WildGlowOverlay'
  }

  /**
   * Initialize the reels renderer with layout
   */
  init(layout: ReelsLayoutConfig): void {
    this.layout = layout

    this.createReelStrips()
    this.setupEventHandlers()

    // Add overlay graphics on top of reels
    this.container.addChild(this.highlightGraphics)
    this.container.addChild(this.wildGlowGraphics)
  }

  /** Create the 5 reel strips */
  private createReelStrips(): void {
    if (!this.layout) return

    const { symbolWidth, symbolHeight, offsetX, offsetY, gap } = this.layout

    console.log(`[PixiReelsRenderer] Creating 5 reel strips: offset=(${offsetX}, ${offsetY}), symbolSize=(${symbolWidth}x${symbolHeight})`)

    for (let i = 0; i < 5; i++) {
      const config: ReelStripConfig = {
        x: offsetX + i * symbolWidth,
        y: offsetY,
        symbolWidth,
        symbolHeight,
        visibleRows: 3,
        gap
      }

      console.log(`[PixiReelsRenderer] Reel ${i}: x=${config.x}`)
      const strip = new ReelStrip(config, this.container)
      strip.setSymbols(this.currentGrid[i])
      this.reelStrips.push(strip)

      if (import.meta.env.DEV && !reelDebugLogged) {
        reelDebugLogged = true
        const sprite = strip.getDebugSprite()
        if (sprite) {
          const spriteGlobal = sprite.getGlobalPosition()
          const containerGlobal = this.container.getGlobalPosition()
          console.log(`[ReelStrip Debug] base=(${config.x}, ${config.y}) sprite=(${sprite.x}, ${sprite.y}) spriteGlobal=(${spriteGlobal.x.toFixed(1)}, ${spriteGlobal.y.toFixed(1)}) reelsContainerGlobal=(${containerGlobal.x.toFixed(1)}, ${containerGlobal.y.toFixed(1)})`)
          console.log('[ReelStrip Debug] snapshot', strip.getDebugSnapshot())
        }
      }
    }

    console.log(`[PixiReelsRenderer] Created ${this.reelStrips.length} strips, container has ${this.container.children.length} children`)
  }

  /** Set up event handlers from AnimationLibrary */
  private setupEventHandlers(): void {
    Animations.setEvents({
      onReelSpinStart: (reelIndex) => this.onReelSpinStart(reelIndex),
      onReelStop: (reelIndex, symbols) => this.onReelStop(reelIndex, symbols),
      onRevealComplete: () => this.onRevealComplete(),
      onWinLineHighlight: (lineId, positions) => this.onWinLineHighlight(lineId, positions),
      onSpotlightWilds: (positions) => this.onSpotlightWilds(positions)
    })
  }

  /** Handle reel spin start event */
  private onReelSpinStart(reelIndex: number): void {
    if (reelIndex >= 0 && reelIndex < this.reelStrips.length) {
      this.reelStrips[reelIndex].startSpin()
    }
  }

  /** Handle reel stop event */
  private onReelStop(reelIndex: number, symbols: number[]): void {
    if (reelIndex >= 0 && reelIndex < this.reelStrips.length) {
      this.currentGrid[reelIndex] = [...symbols]
      this.reelStrips[reelIndex].stopSpin(symbols)
    }
  }

  /** Handle reveal complete */
  private onRevealComplete(): void {
    for (let i = 0; i < 5; i++) {
      this.reelStrips[i].setSymbols(this.currentGrid[i])
    }
  }

  /** Handle win line highlight event */
  private onWinLineHighlight(_lineId: number, positions: GridPosition[]): void {
    this.dimmedSymbols = true

    positions.forEach(pos => {
      const flatIndex = pos.reel * 3 + pos.row
      this.highlightedPositions.add(flatIndex)
    })

    this.updateDimming()
    this.drawHighlights()
  }

  /** Handle spotlight wilds event */
  private onSpotlightWilds(positions: number[]): void {
    positions.forEach(pos => {
      this.wildPositions.add(pos)
      const gridPos = flatToGrid(pos)
      this.currentGrid[gridPos.reel][gridPos.row] = 8
      this.reelStrips[gridPos.reel].setSymbols(this.currentGrid[gridPos.reel])
    })

    this.drawWildGlow()
  }

  /** Update symbol dimming based on current state */
  private updateDimming(): void {
    for (let reel = 0; reel < 5; reel++) {
      for (let row = 0; row < 3; row++) {
        const flatIndex = reel * 3 + row
        const shouldDim = this.dimmedSymbols && !this.highlightedPositions.has(flatIndex)
        this.reelStrips[reel].setDimmed(row, shouldDim)
      }
    }
  }

  /** Draw highlight borders around winning positions */
  private drawHighlights(): void {
    if (!this.layout) return

    this.highlightGraphics.clear()

    const { symbolWidth, symbolHeight, offsetX, offsetY, gap } = this.layout

    for (const flatIndex of this.highlightedPositions) {
      const reel = Math.floor(flatIndex / 3)
      const row = flatIndex % 3

      const x = offsetX + reel * symbolWidth + gap / 2
      const y = offsetY + row * symbolHeight + gap / 2
      const w = symbolWidth - gap
      const h = symbolHeight - gap

      this.highlightGraphics.rect(x, y, w, h)
      this.highlightGraphics.stroke({
        color: HIGHLIGHT_COLOR,
        width: HIGHLIGHT_BORDER_WIDTH
      })
    }
  }

  /** Draw glow effect for wild symbols */
  private drawWildGlow(): void {
    if (!this.layout) return

    this.wildGlowGraphics.clear()

    const { symbolWidth, symbolHeight, offsetX, offsetY, gap } = this.layout

    for (const flatIndex of this.wildPositions) {
      const reel = Math.floor(flatIndex / 3)
      const row = flatIndex % 3

      const x = offsetX + reel * symbolWidth + gap / 2
      const y = offsetY + row * symbolHeight + gap / 2
      const w = symbolWidth - gap
      const h = symbolHeight - gap

      for (let i = 3; i >= 1; i--) {
        const expand = i * 4
        this.wildGlowGraphics.rect(
          x - expand,
          y - expand,
          w + expand * 2,
          h + expand * 2
        )
        this.wildGlowGraphics.fill({
          color: WILD_GLOW_COLOR,
          alpha: WILD_GLOW_ALPHA / (i * 2)
        })
      }
    }
  }

  /**
   * Reset all highlights and restore normal state
   */
  resetHighlights(): void {
    this.highlightedPositions.clear()
    this.wildPositions.clear()
    this.dimmedSymbols = false

    this.highlightGraphics.clear()
    this.wildGlowGraphics.clear()

    for (const strip of this.reelStrips) {
      strip.clearDimming()
    }
  }

  /**
   * Start all reels spinning
   */
  startAllSpins(): void {
    for (const strip of this.reelStrips) {
      strip.startSpin()
    }
  }

  /**
   * Stop all reels with stagger L->R
   */
  async stopAllReels(finalGrid: number[][]): Promise<void> {
    const stagger = MotionPrefs.turboEnabled
      ? TIMING.REEL_STOP_STAGGER_MS / 2
      : TIMING.REEL_STOP_STAGGER_MS

    for (let i = 0; i < 5; i++) {
      this.currentGrid[i] = [...finalGrid[i]]
      await this.reelStrips[i].stopSpin(finalGrid[i])

      if (i < 4) {
        await this.delay(stagger)
      }
    }
  }

  /**
   * Set grid state directly (for restore/init)
   */
  setGrid(grid: number[][]): void {
    this.currentGrid = grid.map(col => [...col])
    for (let i = 0; i < 5; i++) {
      this.reelStrips[i].setSymbols(this.currentGrid[i])
    }
  }

  /**
   * Update layout configuration
   */
  updateLayout(layout: ReelsLayoutConfig): void {
    this.layout = layout

    const { symbolWidth, symbolHeight, offsetX, offsetY, gap } = layout

    for (let i = 0; i < this.reelStrips.length; i++) {
      this.reelStrips[i].updateLayout({
        x: offsetX + i * symbolWidth,
        y: offsetY,
        symbolWidth,
        symbolHeight,
        gap
      })
    }

    this.drawHighlights()
    this.drawWildGlow()
  }

  /** Utility delay function */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /** Clean up resources */
  destroy(): void {
    for (const strip of this.reelStrips) {
      strip.destroy()
    }
    this.reelStrips = []
    this.highlightGraphics.destroy()
    this.wildGlowGraphics.destroy()
    this.container.destroy({ children: true })
  }
}
