/**
 * PixiReelsRenderer - Coordinates 5 reel strips for the slot grid
 * Handles spin/stop animations and win highlighting
 * Integrates with AnimationLibrary event system
 */

import { Container, Graphics } from 'pixi.js'
import { ReelStrip, type ReelStripConfig } from './ReelStrip'
import { ReelFrame } from './ReelFrame'
import { SymbolRenderer } from './SymbolRenderer'
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
let reelsRootDebugLogged = false

/**
 * PixiReelsRenderer - Main reels rendering coordinator
 */
export class PixiReelsRenderer {
  public readonly container: Container
  private reelsRoot: Container
  private reelsContainer: Container
  private reelStrips: ReelStrip[] = []
  private reelFrame: ReelFrame | null = null
  private highlightGraphics: Graphics
  private wildGlowGraphics: Graphics
  private layout: ReelsLayoutConfig | null = null
  private motionPrefsUnsubscribe: (() => void) | null = null

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

    this.reelsRoot = new Container()
    this.reelsRoot.label = 'reelsRoot'
    this.reelsRoot.eventMode = 'none'
    this.container.addChild(this.reelsRoot)

    if (import.meta.env.DEV) {
      const position = this.reelsRoot.position
      const originalSet = position.set.bind(position)
      position.set = ((x: number | { x: number; y: number }, y?: number) => {
        const nextX = typeof x === 'number' ? x : x?.x ?? 0
        const nextY = typeof x === 'number' ? (y ?? x) : x?.y ?? 0
        const stack = new Error().stack?.split('\n').slice(1, 6).join('\n')
        console.log('[reelsRoot.position.set]', nextX, nextY, stack)
        return originalSet(x as any, y as any)
      }) as typeof position.set
    }

    this.reelsContainer = new Container()
    this.reelsContainer.label = 'reelsContainer'
    this.reelsContainer.eventMode = 'none'
    this.reelsRoot.addChild(this.reelsContainer)

    if (import.meta.env.DEV) {
      console.log(`[PixiReelsRenderer] constructor - parentContainer label: ${parentContainer.label}, children: ${parentContainer.children.length}`)
      console.log(`[PixiReelsRenderer] this.container position: (${this.container.x}, ${this.container.y})`)
      console.log(`[PixiReelsRenderer] this.container.parent: ${this.container.parent?.label ?? 'null'}, inDisplayList: ${this.container.parent !== null}`)
      // Log parent chain
      let p = this.container.parent
      let chain = 'this.container'
      while (p) {
        chain += ` -> ${p.label || p.constructor.name}(${p.x.toFixed(0)},${p.y.toFixed(0)})`
        p = p.parent
      }
      console.log(`[PixiReelsRenderer] Parent chain: ${chain}`)
    }

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

    this.reelsRoot.position.set(layout.offsetX, layout.offsetY)

    if (import.meta.env.DEV) {
      const globalPos = this.reelsRoot.getGlobalPosition()
      const parentTransform = this.container.parent?.worldTransform
      console.log('[PixiReelsRenderer] init() position check:', {
        // Local position
        layoutOffsetX: layout.offsetX,
        layoutOffsetY: layout.offsetY,
        reelsRootLocalX: this.reelsRoot.position.x,
        reelsRootLocalY: this.reelsRoot.position.y,
        // Global position (after all transforms)
        reelsRootGlobalX: globalPos.x,
        reelsRootGlobalY: globalPos.y,
        // Parent (mainContainer) transform
        parentScaleX: parentTransform?.a,
        parentScaleY: parentTransform?.d,
        parentTranslateX: parentTransform?.tx,
        parentTranslateY: parentTransform?.ty,
        // Container positions
        reelsContainerX: this.reelsContainer.position.x,
        reelsContainerY: this.reelsContainer.position.y,
      })
    }

    // Create frame FIRST (renders behind reels)
    this.reelFrame = new ReelFrame()
    this.reelsRoot.addChildAt(this.reelFrame.container, 0)
    this.reelFrame.resize({
      gridWidth: layout.gridWidth,
      gridHeight: layout.gridHeight,
      offsetX: 0,
      offsetY: 0
    })

    this.createReelStrips()
    this.setupEventHandlers()

    // Subscribe to MotionPrefs changes for texture refresh
    this.motionPrefsUnsubscribe = MotionPrefs.onChange(() => {
      // Clear SymbolRenderer cache so new textures are generated with updated prefs
      SymbolRenderer.clearCache()
      // Refresh textures on all reel strips
      for (const strip of this.reelStrips) {
        strip.refreshTextures()
      }
    })

    // Add overlay graphics on top of reels
    this.reelsRoot.addChild(this.highlightGraphics)
    this.reelsRoot.addChild(this.wildGlowGraphics)

    // DEBUG: Verify position persists after frame added
    if (import.meta.env.DEV) {
      console.log('[PixiReelsRenderer] init() END - Container scales:', {
        containerScaleX: this.container.scale.x,
        containerScaleY: this.container.scale.y,
        reelsRootScaleX: this.reelsRoot.scale.x,
        reelsRootScaleY: this.reelsRoot.scale.y,
        reelsContainerScaleX: this.reelsContainer.scale.x,
        reelsContainerScaleY: this.reelsContainer.scale.y,
      })

      // Verify position on next frame (after any potential resets)
      requestAnimationFrame(() => {
        const globalPos = this.reelsRoot.getGlobalPosition()
        const wt = this.reelsRoot.worldTransform
        console.log('[PixiReelsRenderer] AFTER FIRST FRAME - position check:', {
          reelsRootLocalX: this.reelsRoot.position.x,
          reelsRootLocalY: this.reelsRoot.position.y,
          reelsRootGlobalX: globalPos.x,
          reelsRootGlobalY: globalPos.y,
          worldTransform: wt ? `a=${wt.a.toFixed(2)}, b=${wt.b.toFixed(2)}, c=${wt.c.toFixed(2)}, d=${wt.d.toFixed(2)}, tx=${wt.tx.toFixed(2)}, ty=${wt.ty.toFixed(2)}` : 'null',
        })
      })

      // DEBUG: Add visual crosshair marker at reelsRoot origin (should appear at center)
      const debugMarker = new Graphics()
      debugMarker.label = 'DEBUG_CROSSHAIR'
      // Red cross at (0,0) of reelsRoot - should appear at offset position
      debugMarker.moveTo(-50, 0).lineTo(50, 0).stroke({ width: 4, color: 0xff0000 })
      debugMarker.moveTo(0, -50).lineTo(0, 50).stroke({ width: 4, color: 0xff0000 })
      // Add circle at center
      debugMarker.circle(0, 0, 10).fill({ color: 0xff0000 })
      this.reelsRoot.addChild(debugMarker)

      // Also add GREEN marker at ABSOLUTE (100, 100) on mainContainer/stage to verify coordinate system
      const absMarker = new Graphics()
      absMarker.label = 'DEBUG_ABS_MARKER'
      absMarker.circle(0, 0, 15).fill({ color: 0x00ff00 })
      absMarker.position.set(100, 100)
      this.container.parent?.addChild(absMarker)
      console.log('[DEBUG] Added markers: RED at reelsRoot(0,0), GREEN at mainContainer(100,100)')
    }
  }

  /** Create the 5 reel strips */
  private createReelStrips(): void {
    if (!this.layout) return

    const { symbolWidth, symbolHeight, offsetX, offsetY, gap } = this.layout

    if (import.meta.env.DEV) {
      console.log(`[PixiReelsRenderer] Creating 5 reel strips: offset=(${offsetX}, ${offsetY}), symbolSize=(${symbolWidth}x${symbolHeight})`)
    }

    for (let i = 0; i < 5; i++) {
      const config: ReelStripConfig = {
        x: i * symbolWidth,
        y: 0,
        symbolWidth,
        symbolHeight,
        visibleRows: 3,
        gap
      }

      if (import.meta.env.DEV) {
        console.log(`[PixiReelsRenderer] Reel ${i}: x=${config.x}`)
      }
      const strip = new ReelStrip(config, this.reelsContainer)
      strip.setSymbols(this.currentGrid[i])
      this.reelStrips.push(strip)

      if (import.meta.env.DEV && !reelsRootDebugLogged) {
        reelsRootDebugLogged = true
        console.log('[DBG] frame parent', this.reelFrame?.container?.parent?.label ?? this.reelFrame?.container?.parent)
        console.log('[DBG] reels parent', this.reelsRoot?.parent?.label ?? this.reelsRoot?.parent)
        console.log('[DBG] reelsRoot pos', this.reelsRoot?.position)
        console.log('[DBG] container pos', this.container?.position)
      }

      if (import.meta.env.DEV && !reelDebugLogged) {
        reelDebugLogged = true
        const sprite = strip.getDebugSprite()
        if (sprite) {
          const spriteGlobal = sprite.getGlobalPosition()
          const containerGlobal = this.reelsContainer.getGlobalPosition()
          console.log(`[ReelStrip Debug] base=(${config.x}, ${config.y}) sprite=(${sprite.x}, ${sprite.y}) spriteGlobal=(${spriteGlobal.x.toFixed(1)}, ${spriteGlobal.y.toFixed(1)}) reelsContainerGlobal=(${containerGlobal.x.toFixed(1)}, ${containerGlobal.y.toFixed(1)})`)
          console.log('[ReelStrip Debug] snapshot', strip.getDebugSnapshot())
        }
      }
    }

    if (import.meta.env.DEV) {
      console.log(`[PixiReelsRenderer] Created ${this.reelStrips.length} strips, reelsContainer has ${this.reelsContainer.children.length} children`)
      console.log('[PixiReelsRenderer] After createReelStrips:', {
        reelsRootX: this.reelsRoot.position.x,
        reelsRootY: this.reelsRoot.position.y,
        reelsContainerChildren: this.reelsContainer.children.length,
        gridWidth: this.layout?.gridWidth,
        symbolWidth: this.layout?.symbolWidth,
      })
    }
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

    const { symbolWidth, symbolHeight, gap } = this.layout

    for (const flatIndex of this.highlightedPositions) {
      const reel = Math.floor(flatIndex / 3)
      const row = flatIndex % 3

      const x = reel * symbolWidth + gap / 2
      const y = row * symbolHeight + gap / 2
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

    const { symbolWidth, symbolHeight, gap } = this.layout

    for (const flatIndex of this.wildPositions) {
      const reel = Math.floor(flatIndex / 3)
      const row = flatIndex % 3

      const x = reel * symbolWidth + gap / 2
      const y = row * symbolHeight + gap / 2
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

    const { symbolWidth, symbolHeight, gap } = layout

    this.reelsRoot.position.set(layout.offsetX, layout.offsetY)

    // Update frame
    this.reelFrame?.resize({
      gridWidth: layout.gridWidth,
      gridHeight: layout.gridHeight,
      offsetX: 0,
      offsetY: 0
    })

    for (let i = 0; i < this.reelStrips.length; i++) {
      this.reelStrips[i].updateLayout({
        x: i * symbolWidth,
        y: 0,
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
    // Unsubscribe from MotionPrefs
    this.motionPrefsUnsubscribe?.()
    this.motionPrefsUnsubscribe = null

    // Destroy frame
    this.reelFrame?.destroy()
    this.reelFrame = null

    for (const strip of this.reelStrips) {
      strip.destroy()
    }
    this.reelStrips = []
    this.highlightGraphics.destroy()
    this.wildGlowGraphics.destroy()
    this.container.destroy({ children: true })
  }
}
