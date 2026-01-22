/**
 * PixiReelsRenderer - Coordinates 5 reel strips for the slot grid
 * Handles spin/stop animations and win highlighting
 * Integrates with AnimationLibrary event system
 */

import { Container, Graphics } from 'pixi.js'
import { ReelStrip, type ReelStripConfig } from './ReelStrip'
import { ReelFrame, REEL_FRAME_PADDING } from './ReelFrame'
import { SymbolRenderer } from './SymbolRenderer'
import { DEBUG_FLAGS } from './DebugFlags'
import { SparkleOverlay } from './fx/SparkleOverlay'
import { Animations, type GridPosition, flatToGrid } from '../../ux/animations/AnimationLibrary'
import { MotionPrefs, TIMING } from '../../ux/MotionPrefs'
import { WinPresenter, type WinPosition } from './win/WinPresenter'
import { WinCadenceV2 } from './win/WinCadenceV2'
import { BigWinPresenter, WinTier, computeWinTier } from './win/BigWinPresenter'
import type { CellPosition } from '../../game/paylines/PAYLINES_TABLE'
import { audioService } from '../../audio/AudioService'

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

const REEL_COUNT = 5
const VISIBLE_ROWS = 3

let reelDebugLogged = false
let reelsRootDebugLogged = false

/**
 * Spin correctness check result for a single reel
 * Row order: row=0 is TOP, row=1 is MIDDLE, row=2 is BOTTOM
 */
export interface SpinCorrectnessFailure {
  reelIndex: number
  expected: number[]  // [row0, row1, row2] from backend
  visible: number[]   // [row0, row1, row2] from renderer
  isReversed: boolean // hint: expected == visible.reversed
}

/**
 * PixiReelsRenderer - Main reels rendering coordinator
 */
export class PixiReelsRenderer {
  public readonly container: Container
  private reelsRoot: Container
  private reelsViewport: Container
  private reelsMask: Graphics
  private reelsContainer: Container
  private reelStrips: ReelStrip[] = []
  private reelFrame: ReelFrame | null = null
  private highlightGraphics: Graphics
  private wildGlowGraphics: Graphics
  private debugGrid: Graphics | null = null
  private winPresenter: WinPresenter | null = null
  private winCadence: WinCadenceV2 | null = null
  private layoutConfig: ReelsLayoutConfig | null = null
  private motionPrefsUnsubscribe: (() => void) | null = null
  private layoutInProgress = false

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

  // Spin state
  private _isSpinning = false
  private pendingResult: number[][] | null = null
  private quickStopRequested = false

  // Correctness check state (DEV only)
  private lastCorrectnessResult: { passed: boolean; failures: SpinCorrectnessFailure[] } | null = null

  // Spin test state (DEV only)
  private spinTestRunning = false

  // Pending win presentation data (accumulated from winLine events)
  private pendingWinPositions: WinPosition[] = []
  private pendingWinAmount = 0

  // Sparkle overlay system
  private sparkleLayer: Container | null = null
  private sparkleOverlays: SparkleOverlay[] = []

  // Big Win celebration system
  private uiOverlay: Container | null = null
  private bigWinPresenter: BigWinPresenter | null = null
  private celebrationActive = false
  private betAmount = 0

  // Presentation lock - waiting resolvers
  private presentationUnlockResolvers: Array<() => void> = []

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
    this.applyPositionGuard(this.reelsRoot, 'reelsRoot')

    this.reelsViewport = new Container()
    this.reelsViewport.label = 'reelsViewport'
    this.reelsViewport.eventMode = 'none'
    this.reelsRoot.addChild(this.reelsViewport)
    this.applyPositionGuard(this.reelsViewport, 'reelsViewport')

    this.reelsMask = new Graphics()
    this.reelsMask.label = 'reelsMask'
    this.reelsViewport.addChild(this.reelsMask)
    this.reelsViewport.mask = this.reelsMask

    this.reelsContainer = new Container()
    this.reelsContainer.label = 'reelsContainer'
    this.reelsContainer.eventMode = 'none'
    this.reelsViewport.addChild(this.reelsContainer)
    this.applyPositionGuard(this.reelsContainer, 'reelsContainer')

    if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout) {
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
    this.reelsViewport.addChild(this.highlightGraphics)

    this.wildGlowGraphics = new Graphics()
    this.wildGlowGraphics.label = 'WildGlowOverlay'
    this.reelsViewport.addChild(this.wildGlowGraphics)

    if (DEBUG_FLAGS.reelsGrid) {
      this.debugGrid = new Graphics()
      this.debugGrid.label = 'DEBUG_REELS_GRID'
      this.reelsViewport.addChild(this.debugGrid)
    }
  }

  /**
   * Initialize the reels renderer with layout
   */
  init(layout: ReelsLayoutConfig): void {
    this.layoutConfig = layout

    // Create frame FIRST (renders behind reels)
    this.reelFrame = new ReelFrame()
    this.reelsRoot.addChildAt(this.reelFrame.container, 0)

    this.createReelStrips()
    this.createWinPresenter(layout)
    this.initSparklePool()
    this.setupEventHandlers()
    this.initCelebrationOverlay()

    this.layout(layout)

    // Subscribe to MotionPrefs changes for texture refresh and sparkle gating
    this.motionPrefsUnsubscribe = MotionPrefs.onChange(() => {
      // Clear SymbolRenderer cache so new textures are generated with updated prefs
      SymbolRenderer.clearCache()
      // Refresh textures on all reel strips
      for (const strip of this.reelStrips) {
        strip.refreshTextures()
      }
      // Refresh sparkle visibility based on new juice settings
      this.refreshSparkles()
    })

    if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout) {
      console.log('[PixiReelsRenderer] init() complete', {
        reelsRoot: { x: this.reelsRoot.position.x, y: this.reelsRoot.position.y },
        reelsViewport: { x: this.reelsViewport.position.x, y: this.reelsViewport.position.y },
        reelsContainer: { x: this.reelsContainer.position.x, y: this.reelsContainer.position.y },
      })
    }
  }

  /**
   * Apply layout contract (single source of truth)
   */
  layout(layout: ReelsLayoutConfig): void {
    if (this.layoutInProgress) {
      if (import.meta.env.DEV) {
        console.warn('[LAYOUT] Re-entrant layout call ignored', layout)
      }
      return
    }

    this.layoutInProgress = true
    const reelsWidth = REEL_COUNT * layout.symbolWidth
    const reelsHeight = VISIBLE_ROWS * layout.symbolHeight

    try {
      this.layoutConfig = layout

      this.reelsRoot.position.set(layout.offsetX, layout.offsetY)
      this.reelsViewport.position.set(REEL_FRAME_PADDING, REEL_FRAME_PADDING)
      this.reelsContainer.position.set(0, 0)

      this.reelFrame?.resize({
        gridWidth: reelsWidth,
        gridHeight: reelsHeight,
        offsetX: REEL_FRAME_PADDING,
        offsetY: REEL_FRAME_PADDING
      })

      this.reelsMask.clear()
      this.reelsMask.rect(0, 0, reelsWidth, reelsHeight)
      this.reelsMask.fill({ color: 0xffffff, alpha: 1 })

      this.updateDebugGrid(reelsHeight, layout.symbolWidth)

      for (let i = 0; i < this.reelStrips.length; i++) {
        this.reelStrips[i].updateLayout({
          x: i * layout.symbolWidth,
          y: 0,
          symbolWidth: layout.symbolWidth,
          symbolHeight: layout.symbolHeight,
          gap: layout.gap
        })
      }

      this.drawHighlights()
      this.drawWildGlow()

      // Update WinPresenter config
      this.winPresenter?.updateConfig({
        symbolWidth: layout.symbolWidth,
        symbolHeight: layout.symbolHeight,
        gap: layout.gap
      })

      // Update sparkle positions and refresh visibility
      this.updateSparklePositions()
      this.refreshSparkles()
    } finally {
      this.layoutInProgress = false
    }

    this.assertLayout(layout, reelsWidth, reelsHeight)
  }

  private applyPositionGuard(container: Container, label: string): void {
    if (!import.meta.env.DEV) return

    const position = container.position
    const originalSet = position.set.bind(position)
    position.set = ((x: number | { x: number; y: number }, y?: number) => {
      if (!this.layoutInProgress) {
        const nextX = typeof x === 'number' ? x : x?.x ?? 0
        const nextY = typeof x === 'number' ? (y ?? x) : x?.y ?? 0
        const stack = new Error().stack?.split('\n').slice(1, 6).join('\n')
        console.warn('[LAYOUT GUARD]', `${label}.position.set`, {
          x: nextX,
          y: nextY,
          stack,
        })
      }
      return originalSet(x as any, y as any)
    }) as typeof position.set
  }

  private updateDebugGrid(reelsHeight: number, symbolWidth: number): void {
    if (!this.debugGrid) return

    this.debugGrid.clear()

    for (let i = 0; i <= REEL_COUNT; i++) {
      const x = i * symbolWidth
      this.debugGrid.moveTo(x, 0).lineTo(x, reelsHeight).stroke({
        width: 1,
        color: 0x00ffff,
        alpha: 0.4,
      })
    }

    this.debugGrid.moveTo(-6, 0).lineTo(6, 0).stroke({ width: 2, color: 0xff0000 })
    this.debugGrid.moveTo(0, -6).lineTo(0, 6).stroke({ width: 2, color: 0xff0000 })
  }

  private assertLayout(layout: ReelsLayoutConfig, reelsWidth: number, reelsHeight: number): void {
    if (!import.meta.env.DEV) return

    const failures: string[] = []

    if (this.reelsRoot.position.x !== layout.offsetX || this.reelsRoot.position.y !== layout.offsetY) {
      failures.push('reelsRoot')
    }

    if (
      this.reelsViewport.position.x !== REEL_FRAME_PADDING ||
      this.reelsViewport.position.y !== REEL_FRAME_PADDING
    ) {
      failures.push('reelsViewport')
    }

    if (this.reelsContainer.position.x !== 0 || this.reelsContainer.position.y !== 0) {
      failures.push('reelsContainer')
    }

    for (let i = 0; i < this.reelStrips.length; i++) {
      const base = this.reelStrips[i].getBase()
      if (base.x !== i * layout.symbolWidth || base.y !== 0) {
        failures.push(`reelStrip[${i}]`)
      }
    }

    if (failures.length > 0) {
      console.error('[LAYOUT ASSERT FAILED]', {
        failures,
        reelsRoot: { x: this.reelsRoot.position.x, y: this.reelsRoot.position.y },
        reelsViewport: { x: this.reelsViewport.position.x, y: this.reelsViewport.position.y },
        reelsContainer: { x: this.reelsContainer.position.x, y: this.reelsContainer.position.y },
        reelsMask: { width: reelsWidth, height: reelsHeight },
      })
    }
  }

  /** Create reel strips */
  private createReelStrips(): void {
    if (!this.layoutConfig) return

    const { symbolWidth, symbolHeight, offsetX, offsetY, gap } = this.layoutConfig

    if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout) {
      console.log(`[PixiReelsRenderer] Creating ${REEL_COUNT} reel strips: offset=(${offsetX}, ${offsetY}), symbolSize=(${symbolWidth}x${symbolHeight})`)
    }

    for (let i = 0; i < REEL_COUNT; i++) {
      const config: ReelStripConfig = {
        x: i * symbolWidth,
        y: 0,
        symbolWidth,
        symbolHeight,
        visibleRows: VISIBLE_ROWS,
        gap
      }

      if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout) {
        console.log(`[PixiReelsRenderer] Reel ${i}: x=${config.x}`)
      }
      const strip = new ReelStrip(config, this.reelsContainer)
      strip.setSymbols(this.currentGrid[i])
      this.reelStrips.push(strip)

      if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout && !reelsRootDebugLogged) {
        reelsRootDebugLogged = true
        console.log('[DBG] frame parent', this.reelFrame?.container?.parent?.label ?? this.reelFrame?.container?.parent)
        console.log('[DBG] reels parent', this.reelsRoot?.parent?.label ?? this.reelsRoot?.parent)
        console.log('[DBG] reelsRoot pos', this.reelsRoot?.position)
        console.log('[DBG] container pos', this.container?.position)
      }

      if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout && !reelDebugLogged) {
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

    if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout) {
      console.log(`[PixiReelsRenderer] Created ${this.reelStrips.length} strips, reelsContainer has ${this.reelsContainer.children.length} children`)
      console.log('[PixiReelsRenderer] After createReelStrips:', {
        reelsRootX: this.reelsRoot.position.x,
        reelsRootY: this.reelsRoot.position.y,
        reelsContainerChildren: this.reelsContainer.children.length,
        gridWidth: this.layoutConfig?.gridWidth,
        symbolWidth: this.layoutConfig?.symbolWidth,
      })
    }
  }

  /** Create WinPresenter for win display */
  private createWinPresenter(layout: ReelsLayoutConfig): void {
    this.winPresenter = new WinPresenter(
      this.reelsViewport,
      {
        symbolWidth: layout.symbolWidth,
        symbolHeight: layout.symbolHeight,
        gap: layout.gap
      },
      this.reelStrips
    )

    // Connect ReelFrame for pulse effects
    if (this.reelFrame) {
      this.winPresenter.setReelFrame(this.reelFrame)
    }

    // Create cadence controller
    this.winCadence = new WinCadenceV2()
    this.winCadence.setCallbacks({
      presentLine: (positions: CellPosition[], amount: number, lineId: number) => {
        this.winPresenter?.presentLine(positions, amount, lineId)
      },
      clearLine: () => {
        this.winPresenter?.clearLine()
      },
      onCadenceComplete: () => {
        // Show total win label after cadence
        if (this.pendingWinAmount > 0) {
          this.winPresenter?.presentWin(this.pendingWinAmount, this.pendingWinPositions, '$')
        }
      }
    })
  }

  /**
   * Unified juice/effects enabled check
   * OFF if turbo, reduceMotion, or sparklesEnabled debug flag is false
   */
  get juiceEnabled(): boolean {
    return !MotionPrefs.turboEnabled && !MotionPrefs.reduceMotion && DEBUG_FLAGS.sparklesEnabled
  }

  /**
   * Initialize sparkle overlay pool (15 overlays for 5x3 grid)
   * Call after createWinPresenter in init()
   */
  private initSparklePool(): void {
    if (!this.layoutConfig) return

    // Create sparkle layer inside reelsViewport (reels-local coordinates)
    this.sparkleLayer = new Container()
    this.sparkleLayer.label = 'SparkleLayer'
    this.sparkleLayer.eventMode = 'none'

    // Insert after reelsContainer, before highlightGraphics
    const insertIndex = this.reelsViewport.getChildIndex(this.highlightGraphics)
    this.reelsViewport.addChildAt(this.sparkleLayer, insertIndex)

    const { symbolWidth, symbolHeight } = this.layoutConfig

    // Create 15 overlays (5 reels x 3 rows)
    for (let i = 0; i < REEL_COUNT * VISIBLE_ROWS; i++) {
      const overlay = new SparkleOverlay({
        width: symbolWidth,
        height: symbolHeight,
        pointCount: 6,
        color: 0xffd700,  // VIP Gold
        maxRadius: 5
      })

      this.sparkleOverlays.push(overlay)
      this.sparkleLayer.addChild(overlay.container)
    }

    // Position overlays
    this.updateSparklePositions()
  }

  /**
   * Update sparkle overlay positions based on current layout
   */
  private updateSparklePositions(): void {
    if (!this.layoutConfig || !this.sparkleLayer) return

    const { symbolWidth, symbolHeight } = this.layoutConfig

    for (let reel = 0; reel < REEL_COUNT; reel++) {
      for (let row = 0; row < VISIBLE_ROWS; row++) {
        const index = reel * VISIBLE_ROWS + row
        const overlay = this.sparkleOverlays[index]
        if (overlay) {
          overlay.container.position.set(reel * symbolWidth, row * symbolHeight)
          overlay.updateConfig({ width: symbolWidth, height: symbolHeight })
        }
      }
    }
  }

  /**
   * Refresh sparkle visibility based on current grid state
   * Enables sparkles only for WILD (id=8) and DIAMOND (id=6)
   */
  refreshSparkles(): void {
    // Gate: hide all if juice disabled or spinning
    if (!this.juiceEnabled || this._isSpinning) {
      this.deactivateAllSparkles()
      return
    }

    for (let reel = 0; reel < REEL_COUNT; reel++) {
      const visibleSymbols = this.reelStrips[reel]?.getVisibleSymbols() ?? this.currentGrid[reel]
      for (let row = 0; row < VISIBLE_ROWS; row++) {
        const index = reel * VISIBLE_ROWS + row
        const overlay = this.sparkleOverlays[index]
        if (!overlay) continue

        const symbolId = visibleSymbols[row]
        // Enable for WILD (id=8) or DIAMOND (id=6)
        if (symbolId === 8 || symbolId === 6) {
          overlay.activate()
        } else {
          overlay.deactivate()
        }
      }
    }
  }

  /**
   * Deactivate all sparkle overlays
   */
  private deactivateAllSparkles(): void {
    for (const overlay of this.sparkleOverlays) {
      overlay.deactivate()
    }
  }

  /**
   * Initialize the UI overlay for celebrations
   * Creates uiOverlay container and BigWinPresenter
   */
  private initCelebrationOverlay(): void {
    // Create UI overlay container (renders above reelsRoot)
    this.uiOverlay = new Container()
    this.uiOverlay.label = 'uiOverlay'
    this.uiOverlay.eventMode = 'auto'
    this.container.addChild(this.uiOverlay)

    // Create BigWinPresenter inside the overlay
    this.bigWinPresenter = new BigWinPresenter()
    this.uiOverlay.addChild(this.bigWinPresenter.container)
  }

  /**
   * Set bet amount for tier calculation
   */
  setBetAmount(bet: number): void {
    this.betAmount = bet
  }

  /**
   * Check if celebration is currently active
   */
  isCelebrationActive(): boolean {
    return this.celebrationActive
  }

  /**
   * Wait until presentation lock is released
   * Returns immediately if not locked
   */
  waitPresentationUnlocked(): Promise<void> {
    if (!this.celebrationActive) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      this.presentationUnlockResolvers.push(resolve)
    })
  }

  /**
   * Release presentation lock and notify all waiters
   */
  private releasePresentationLock(): void {
    this.celebrationActive = false

    // Resolve all waiting promises
    const resolvers = this.presentationUnlockResolvers
    this.presentationUnlockResolvers = []
    resolvers.forEach(resolve => resolve())
  }

  /**
   * Skip the current celebration (for external calls like Space key)
   */
  requestCelebrationSkip(): void {
    if (this.celebrationActive && this.bigWinPresenter?.active) {
      this.bigWinPresenter.skip()
    }
  }

  /**
   * Trigger celebration (called after cadence/win)
   */
  private async presentCelebration(totalWin: number, currencySymbol: string): Promise<void> {
    const tier = computeWinTier(totalWin, this.betAmount)

    if (tier === WinTier.NONE || !this.bigWinPresenter) {
      return
    }

    this.celebrationActive = true

    // Update viewport for BigWinPresenter
    if (this.layoutConfig) {
      const viewportWidth = this.layoutConfig.gridWidth + this.layoutConfig.offsetX * 2
      const viewportHeight = this.layoutConfig.gridHeight + this.layoutConfig.offsetY * 2
      this.bigWinPresenter.setViewport(viewportWidth, viewportHeight)
    }

    // Play audio sting for tier
    audioService.onWinTier(tier as 'big' | 'mega' | 'epic')

    if (DEBUG_FLAGS.bigWinVerbose) {
      console.log(`[PixiReelsRenderer] Presenting ${tier} celebration for ${totalWin} (${totalWin / this.betAmount}x)`)
    }

    await this.bigWinPresenter.present({
      totalWin,
      tier,
      currencySymbol,
      onComplete: () => {
        this.releasePresentationLock()
      }
    })

    // Ensure lock is released even if callback wasn't invoked
    this.releasePresentationLock()
  }

  /** Set up event handlers from AnimationLibrary */
  private setupEventHandlers(): void {
    Animations.setEvents({
      onReelSpinStart: (reelIndex) => this.onReelSpinStart(reelIndex),
      onReelStop: (reelIndex, symbols) => this.onReelStop(reelIndex, symbols),
      onRevealComplete: () => this.onRevealComplete(),
      onWinLineHighlight: (lineId, positions, amount) => this.onWinLineHighlight(lineId, positions, amount),
      onSpotlightWilds: (positions) => this.onSpotlightWilds(positions),
      onWinResult: (totalWin, winPositions, currencySymbol) => this.onWinResult(totalWin, winPositions, currencySymbol)
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
  private onWinLineHighlight(lineId: number, positions: GridPosition[], amount: number): void {
    this.dimmedSymbols = true

    // Accumulate positions for this win line
    positions.forEach(pos => {
      const flatIndex = pos.reel * VISIBLE_ROWS + pos.row
      this.highlightedPositions.add(flatIndex)
      // Also add to pending win positions for WinPresenter
      this.pendingWinPositions.push(pos)
    })

    // Accumulate amount
    this.pendingWinAmount += amount

    // Also add to cadence for cycling
    this.winCadence?.addWinLine(lineId, amount, 0)

    this.updateDimming()
    this.drawHighlights()
  }

  /** Handle win result event (final presentation) */
  private async onWinResult(totalWin: number, winPositions: GridPosition[], currencySymbol: string): Promise<void> {
    if (!this.winPresenter) return

    // Store the total win amount and currency for cadence completion
    this.pendingWinAmount = totalWin

    // Use provided positions or fall back to accumulated positions
    const positions = winPositions.length > 0 ? winPositions : this.pendingWinPositions

    // Compute tier for celebration decision
    const tier = computeWinTier(totalWin, this.betAmount)

    if (tier === WinTier.NONE) {
      // No celebration - run normal cadence + win label
      if (this.winCadence && this.winCadence.lineCount > 0) {
        this.winCadence.setCallbacks({
          presentLine: (cellPositions: CellPosition[], amount: number, lineId: number) => {
            this.winPresenter?.presentLine(cellPositions, amount, lineId)
          },
          clearLine: () => {
            this.winPresenter?.clearLine()
          },
          onCadenceComplete: () => {
            if (this.pendingWinAmount > 0) {
              this.winPresenter?.presentWin(this.pendingWinAmount, positions, currencySymbol)
            }
          }
        })
        this.winCadence.run()
      } else {
        this.winPresenter.presentWin(totalWin, positions, currencySymbol)
      }
      return
    }

    // For Epic tier: cancel cadence immediately, then celebrate
    if (tier === WinTier.EPIC) {
      this.winCadence?.cancel()
      await this.presentCelebration(totalWin, currencySymbol)
      return
    }

    // For Big/Mega tier: cap cadence at 1200ms, then celebrate
    if (this.winCadence && this.winCadence.lineCount > 0) {
      this.winCadence.setCallbacks({
        presentLine: (cellPositions: CellPosition[], amount: number, lineId: number) => {
          this.winPresenter?.presentLine(cellPositions, amount, lineId)
        },
        clearLine: () => {
          this.winPresenter?.clearLine()
        },
        onCadenceComplete: () => {
          // Don't show win label - celebration will handle it
        }
      })
      await this.winCadence.run({ maxDurationMs: 1200 })
    }

    await this.presentCelebration(totalWin, currencySymbol)
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
    for (let reel = 0; reel < REEL_COUNT; reel++) {
      for (let row = 0; row < VISIBLE_ROWS; row++) {
        const flatIndex = reel * VISIBLE_ROWS + row
        const shouldDim = this.dimmedSymbols && !this.highlightedPositions.has(flatIndex)
        this.reelStrips[reel].setDimmed(row, shouldDim)
      }
    }
  }

  /** Draw highlight borders around winning positions */
  private drawHighlights(): void {
    if (!this.layoutConfig) return

    this.highlightGraphics.clear()

    const { symbolWidth, symbolHeight, gap } = this.layoutConfig

    for (const flatIndex of this.highlightedPositions) {
      const reel = Math.floor(flatIndex / VISIBLE_ROWS)
      const row = flatIndex % VISIBLE_ROWS

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
    if (!this.layoutConfig) return

    this.wildGlowGraphics.clear()

    const { symbolWidth, symbolHeight, gap } = this.layoutConfig

    for (const flatIndex of this.wildPositions) {
      const reel = Math.floor(flatIndex / VISIBLE_ROWS)
      const row = flatIndex % VISIBLE_ROWS

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

    // Clear win presentation and reset pending data
    this.winPresenter?.clear()
    this.winPresenter?.resetAllScales()
    this.pendingWinPositions = []
    this.pendingWinAmount = 0

    // Cancel and clear cadence
    this.winCadence?.cancel()
    this.winCadence?.clear()

    // Deactivate sparkles (will be refreshed after spin stops)
    this.deactivateAllSparkles()
  }

  /**
   * Run the win cadence cycle
   * Call after all winLine events have been processed
   * @returns Promise that resolves when cadence completes
   */
  async runWinCadence(): Promise<void> {
    if (!this.winCadence || this.winCadence.lineCount === 0) {
      // No lines - show total win directly
      if (this.pendingWinAmount > 0) {
        this.winPresenter?.presentWin(this.pendingWinAmount, this.pendingWinPositions, '$')
      }
      return
    }

    await this.winCadence.run()
  }

  /**
   * Request skip on current cadence
   */
  requestCadenceSkip(): void {
    this.winCadence?.requestSkip()
  }

  /**
   * Check if any reels are currently spinning
   */
  isSpinning(): boolean {
    return this._isSpinning || this.reelStrips.some(strip => strip.isAnimating())
  }

  /**
   * Check if quick stop was requested
   */
  isQuickStopRequested(): boolean {
    return this.quickStopRequested
  }

  /**
   * Start all reels spinning
   */
  startAllSpins(): void {
    this._isSpinning = true
    this.pendingResult = null
    this.quickStopRequested = false

    // Reset all sprite scales before starting (ensure no symbol remains scaled)
    this.winPresenter?.resetAllScales()

    // Deactivate sparkles during spin
    this.deactivateAllSparkles()

    for (const strip of this.reelStrips) {
      strip.startSpin()
    }
  }

  /**
   * Request quick stop on all spinning reels
   * If result is pending, stops immediately; otherwise waits for result
   */
  requestQuickStop(): void {
    if (!this._isSpinning) return

    this.quickStopRequested = true

    // Propagate to all reel strips
    for (const strip of this.reelStrips) {
      strip.requestQuickStop()
    }

    // If we have a pending result, trigger stop now
    if (this.pendingResult) {
      this.stopAllReels(this.pendingResult)
    }
  }

  /**
   * Check spin correctness (DEV only)
   * Compares expected backend result with actual visible symbols
   * Row order: row=0 is TOP, row=1 is MIDDLE, row=2 is BOTTOM
   * @param resultGrid - Expected grid from backend [reel][row]
   * @returns Object with passed status and any failures
   */
  private checkSpinCorrectness(resultGrid: number[][]): { passed: boolean; failures: SpinCorrectnessFailure[] } {
    if (!import.meta.env.DEV) {
      return { passed: true, failures: [] }
    }

    const failures: SpinCorrectnessFailure[] = []

    for (let reelIndex = 0; reelIndex < REEL_COUNT; reelIndex++) {
      const expected = resultGrid[reelIndex]
      const visible = this.reelStrips[reelIndex].getVisibleSymbols()

      // Check for exact match
      let mismatch = false
      for (let row = 0; row < VISIBLE_ROWS; row++) {
        if (expected[row] !== visible[row]) {
          mismatch = true
          break
        }
      }

      if (mismatch) {
        // Check if it's a reversed order issue
        const reversed = [...visible].reverse()
        const isReversed = expected.every((v, i) => v === reversed[i])

        failures.push({
          reelIndex,
          expected: [...expected],
          visible: [...visible],
          isReversed
        })
      }
    }

    const passed = failures.length === 0

    // Always log errors
    if (!passed) {
      console.error('[SPIN CORRECTNESS FAILED]', {
        totalFailures: failures.length,
        failures: failures.map(f => ({
          reel: f.reelIndex,
          expected: f.expected,
          visible: f.visible,
          hint: f.isReversed ? 'REVERSED ORDER - expected == visible.reverse()' : 'VALUES MISMATCH'
        }))
      })
    } else if (DEBUG_FLAGS.spinCorrectnessVerbose) {
      console.log('[SPIN CORRECTNESS PASSED]', {
        grid: resultGrid.map((col, i) => ({ reel: i, symbols: col }))
      })
    }

    this.lastCorrectnessResult = { passed, failures }
    return { passed, failures }
  }

  /**
   * Get the last correctness check result (DEV only)
   */
  getLastCorrectnessResult(): { passed: boolean; failures: SpinCorrectnessFailure[] } | null {
    return this.lastCorrectnessResult
  }

  /**
   * Check if spin test is currently running
   */
  isSpinTestRunning(): boolean {
    return this.spinTestRunning
  }

  /**
   * Set spin test running state (called by ReelsView during automated tests)
   */
  setSpinTestRunning(running: boolean): void {
    this.spinTestRunning = running
  }

  /**
   * Stop all reels with stagger L->R
   * @param finalGrid - Final 5x3 symbol grid (column-major: finalGrid[reel][row])
   */
  async stopAllReels(finalGrid: number[][]): Promise<void> {
    // Store result in case quick stop is requested later
    this.pendingResult = finalGrid

    // Calculate stagger based on turbo mode and quick stop
    let stagger = TIMING.REEL_STOP_STAGGER_MS
    if (MotionPrefs.turboEnabled) {
      stagger = stagger / 2
    }
    if (this.quickStopRequested) {
      stagger = stagger / 3
    }

    for (let i = 0; i < REEL_COUNT; i++) {
      this.currentGrid[i] = [...finalGrid[i]]
      await this.reelStrips[i].stopSpin(finalGrid[i])

      if (i < REEL_COUNT - 1) {
        await this.delay(stagger)
      }
    }

    // Run correctness check (DEV only) after all reels have stopped
    if (import.meta.env.DEV) {
      this.checkSpinCorrectness(finalGrid)
    }

    // Clear spin state
    this._isSpinning = false
    this.pendingResult = null
    this.quickStopRequested = false

    // Refresh sparkles after stop (will show on WILD/DIAMOND)
    this.refreshSparkles()
  }

  /**
   * Set grid state directly (for restore/init)
   */
  setGrid(grid: number[][]): void {
    this.currentGrid = grid.map(col => [...col])
    for (let i = 0; i < REEL_COUNT; i++) {
      this.reelStrips[i].setSymbols(this.currentGrid[i])
    }
  }

  /**
   * Update layout configuration
   */
  updateLayout(layout: ReelsLayoutConfig): void {
    this.layout(layout)
  }

  /**
   * Present win with highlight, pop animation, and label
   * @param totalWin - Total win amount
   * @param positions - Array of winning positions (flat indices or grid positions)
   * @param currencySymbol - Currency symbol for formatting
   */
  presentWin(totalWin: number, positions: (number | WinPosition)[] = [], currencySymbol = '$'): void {
    if (!this.winPresenter) return

    // Convert flat indices to grid positions
    const winPositions: WinPosition[] = positions.map(p => {
      if (typeof p === 'number') {
        return { reel: Math.floor(p / VISIBLE_ROWS), row: p % VISIBLE_ROWS }
      }
      return p
    })

    this.winPresenter.presentWin(totalWin, winPositions, currencySymbol)
  }

  /**
   * Accumulate win positions from a winLine event
   * Call finalizeWinPresentation() after all winLine events to show the combined result
   */
  accumulateWinLine(amount: number, positions: WinPosition[]): void {
    this.pendingWinAmount += amount
    this.pendingWinPositions.push(...positions)
  }

  /**
   * Finalize and show accumulated win presentation
   * @param currencySymbol - Currency symbol for formatting
   */
  finalizeWinPresentation(currencySymbol = '$'): void {
    if (this.pendingWinAmount > 0 && this.winPresenter) {
      this.winPresenter.presentWin(
        this.pendingWinAmount,
        this.pendingWinPositions,
        currencySymbol
      )
    }
  }

  /** Utility delay function */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * DEV ONLY: Force a win presentation for testing
   * @param args.amount - Win amount to display
   * @param args.positions - Optional positions (defaults to middle row)
   */
  debugPresentWin(args: { amount: number; positions?: WinPosition[] }): void {
    if (!import.meta.env.DEV) return
    if (!this.winPresenter) return

    // Default to middle row if no positions provided
    const positions = args.positions ?? Array.from({ length: REEL_COUNT }, (_, reel) => ({ reel, row: 1 }))

    this.winPresenter.presentWin(args.amount, positions, '$')
  }

  /**
   * DEV ONLY: Test win cadence with simulated lines
   * Simulates 3 win lines cycling through different patterns
   */
  debugTestCadence(): void {
    if (!import.meta.env.DEV) return
    if (!this.winCadence) return

    // Clear any existing state
    this.resetHighlights()

    // Simulate 3 win lines
    this.winCadence.addWinLine(0, 0.20, 2)   // middle row
    this.winCadence.addWinLine(3, 0.40, 4)   // V shape
    this.winCadence.addWinLine(7, 1.00, 10)  // top curve

    this.pendingWinAmount = 1.60
    this.runWinCadence()
  }

  /**
   * DEV ONLY: Trigger celebration for testing
   * @param tier - 'big', 'mega', or 'epic'
   * @param winX - Multiplier (e.g., 25 for 25x)
   */
  debugTriggerCelebration(tier: 'big' | 'mega' | 'epic', winX: number): void {
    if (!import.meta.env.DEV) return

    // Use a base bet of 1.0 for testing
    const baseBet = 1.0
    const totalWin = baseBet * winX

    // Temporarily set bet amount for tier calculation
    const originalBet = this.betAmount
    this.betAmount = baseBet

    console.log(`[PixiReelsRenderer] DEBUG: Triggering ${tier} celebration at ${winX}x (totalWin: ${totalWin})`)

    this.presentCelebration(totalWin, '$').finally(() => {
      // Restore original bet
      this.betAmount = originalBet
    })
  }

  /** Clean up resources */
  destroy(): void {
    // Unsubscribe from MotionPrefs
    this.motionPrefsUnsubscribe?.()
    this.motionPrefsUnsubscribe = null

    // Destroy frame
    this.reelFrame?.destroy()
    this.reelFrame = null

    // Destroy win presenter
    this.winPresenter?.destroy()
    this.winPresenter = null

    // Destroy sparkle overlays
    for (const overlay of this.sparkleOverlays) {
      overlay.destroy()
    }
    this.sparkleOverlays = []
    this.sparkleLayer?.destroy({ children: true })
    this.sparkleLayer = null

    // Destroy big win presenter and UI overlay
    this.bigWinPresenter?.destroy()
    this.bigWinPresenter = null
    this.uiOverlay?.destroy({ children: true })
    this.uiOverlay = null

    for (const strip of this.reelStrips) {
      strip.destroy()
    }
    this.reelStrips = []
    this.highlightGraphics.destroy()
    this.wildGlowGraphics.destroy()
    this.container.destroy({ children: true })
  }
}

