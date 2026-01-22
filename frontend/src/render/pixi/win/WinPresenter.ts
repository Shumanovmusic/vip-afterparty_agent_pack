/**
 * WinPresenter - Coordinates win presentation: highlights, pop animations, win label
 * Respects MotionPrefs for turbo/reduce motion modes
 */

import { Container, Graphics, Text, TextStyle, Ticker, Sprite } from 'pixi.js'
import { MotionPrefs } from '../../../ux/MotionPrefs'
import { formatCurrency } from '../../../i18n/format'
import { GameModeStore } from '../../../state/GameModeStore'
import { DEBUG_FLAGS } from '../DebugFlags'
import type { ReelStrip } from '../ReelStrip'
import type { ReelFrame } from '../ReelFrame'

const REEL_COUNT = 5

/** Grid position (reel, row) */
export interface WinPosition {
  reel: number  // 0-4
  row: number   // 0-2
}

/** Win presentation configuration */
export interface WinPresenterConfig {
  symbolWidth: number
  symbolHeight: number
  gap: number
}

/** Animation timing constants */
const POP_SCALE_UP_DURATION = 140    // ms to scale up
const POP_SCALE_DOWN_DURATION = 160  // ms to scale back
const POP_SCALE_TARGET = 1.08        // 8% larger

const HIGHLIGHT_COLOR = 0xffd700
const HIGHLIGHT_ALPHA = 0.35
const HIGHLIGHT_BORDER_WIDTH = 3
const HIGHLIGHT_BORDER_ALPHA = 0.9

const LABEL_DURATION_BASE = 900       // ms for base game
const LABEL_DURATION_BONUS = 500      // ms for bonus auto
const LABEL_DURATION_TURBO = 400      // ms for turbo mode

/**
 * Sprite pop animation state
 */
interface PopAnimationState {
  sprite: Sprite
  baseScaleX: number
  baseScaleY: number
  phase: 'up' | 'down'
  elapsed: number
  reel: number
  row: number
}

/**
 * WinPresenter - Manages win presentation visuals
 */
export class WinPresenter {
  private container: Container
  private highlightGraphics: Graphics
  private labelText: Text
  private config: WinPresenterConfig
  private reelStrips: ReelStrip[]

  // Animation state
  private popAnimations: PopAnimationState[] = []
  private isAnimating = false
  private labelTimeoutId: ReturnType<typeof setTimeout> | null = null

  // Monotonic presentId for stale timer protection
  private presentId = 0

  // ReelFrame reference for pulse effects
  private reelFrame: ReelFrame | null = null

  constructor(
    parent: Container,
    config: WinPresenterConfig,
    reelStrips: ReelStrip[]
  ) {
    this.config = config
    this.reelStrips = reelStrips

    // Create container for win presentation
    this.container = new Container()
    this.container.label = 'WinPresenter'
    this.container.eventMode = 'none'
    parent.addChild(this.container)

    // Create highlight graphics layer
    this.highlightGraphics = new Graphics()
    this.highlightGraphics.label = 'WinHighlights'
    this.container.addChild(this.highlightGraphics)

    // Create win label (initially hidden)
    const labelStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 28,
      fontWeight: 'bold',
      fill: 0xffd700,
      stroke: { color: 0x000000, width: 4 },
      dropShadow: {
        color: 0x000000,
        blur: 4,
        distance: 2,
        angle: Math.PI / 4
      }
    })
    this.labelText = new Text({ text: '', style: labelStyle })
    this.labelText.label = 'WinLabel'
    this.labelText.anchor.set(0.5, 0.5)
    this.labelText.visible = false
    this.container.addChild(this.labelText)
  }

  /**
   * Update configuration (call after layout changes)
   */
  updateConfig(config: WinPresenterConfig): void {
    this.config = config
    // Reposition label to center-top of grid
    this.repositionLabel()
  }

  /**
   * Set ReelFrame reference for pulse effects
   */
  setReelFrame(frame: ReelFrame): void {
    this.reelFrame = frame
  }

  /**
   * Present win with highlights, pop animation, and label
   * @param totalWin - Total win amount
   * @param positions - Array of winning positions (empty = highlight middle row)
   * @param currencySymbol - Currency symbol for formatting
   */
  async presentWin(
    totalWin: number,
    positions: WinPosition[] = [],
    currencySymbol = '$'
  ): Promise<void> {
    // Increment presentId for stale timer protection
    this.presentId++
    const myPresentId = this.presentId

    // Clear any prior presentation
    this.clear()

    // If no win, nothing to show
    if (totalWin <= 0) return

    // Determine positions to highlight
    let winPositions = positions
    if (winPositions.length === 0) {
      // Fallback: highlight ONLY middle row (row=1) across 5 reels
      winPositions = this.getMiddleRowPositions()
      if (DEBUG_FLAGS.winVerbose) {
        console.log('[WinPresenter] Using middle row fallback positions:', winPositions)
      }
    }

    // Draw highlights
    this.drawHighlights(winPositions)

    // Start pop animations (unless turbo or reduce motion)
    if (!MotionPrefs.turboEnabled && !MotionPrefs.reduceMotion) {
      this.startPopAnimations(winPositions)
    }

    // Show win label
    this.showLabel(totalWin, currencySymbol)

    // Trigger frame pulse on total win (stronger pulse)
    this.reelFrame?.pulse(0.22, 280)

    // Schedule automatic cleanup based on mode with presentId guard
    const duration = this.getLabelDuration()
    this.scheduleLabelHide(duration, myPresentId)
  }

  /**
   * Present win using flat indices
   * Flat index = reel * 3 + row
   */
  async presentWinFromFlat(
    totalWin: number,
    flatIndices: number[] = [],
    currencySymbol = '$'
  ): Promise<void> {
    const positions = flatIndices.map(flatIndex => ({
      reel: Math.floor(flatIndex / 3),
      row: flatIndex % 3
    }))
    return this.presentWin(totalWin, positions, currencySymbol)
  }

  /**
   * Clear all win presentation
   */
  clear(): void {
    // Clear highlights
    this.highlightGraphics.clear()

    // Stop pop animations and reset scales
    this.stopPopAnimations()

    // Hide label
    this.hideLabel()

    // Clear timeout
    if (this.labelTimeoutId) {
      clearTimeout(this.labelTimeoutId)
      this.labelTimeoutId = null
    }
  }

  /**
   * Present a single win line (for cadence cycling)
   * @param positions - Cell positions for this line
   * @param amount - Win amount for this line
   * @param _lineId - Line ID (unused, for optional future labeling)
   */
  presentLine(
    positions: WinPosition[],
    amount: number,
    _lineId: number
  ): void {
    // Clear previous line
    this.clearLine()

    // Draw highlights for this line only
    this.drawHighlights(positions)

    // Start pop animations (unless turbo or reduce motion)
    if (!MotionPrefs.turboEnabled && !MotionPrefs.reduceMotion) {
      this.startPopAnimations(positions)
    }

    // Trigger frame pulse on line highlight (subtle pulse)
    this.reelFrame?.pulse(0.12, 180)

    // Note: Total win label shown separately after cadence
    if (DEBUG_FLAGS.winVerbose) {
      console.log(`[WinPresenter] presentLine: lineId=${_lineId}, amount=${amount}, positions=${positions.length}`)
    }
  }

  /**
   * Clear current line highlight (for cadence transition)
   */
  clearLine(): void {
    this.highlightGraphics.clear()
    this.stopPopAnimations()
    // Don't hide label - it shows total win
  }

  /**
   * Force reset all sprite scales (call on new spin start)
   */
  resetAllScales(): void {
    for (const strip of this.reelStrips) {
      strip.resetAllSpriteScales()
    }
  }

  /**
   * Draw highlight rectangles for winning positions
   */
  private drawHighlights(positions: WinPosition[]): void {
    const { symbolWidth, symbolHeight, gap } = this.config

    this.highlightGraphics.clear()

    for (const pos of positions) {
      const x = pos.reel * symbolWidth + gap / 2
      const y = pos.row * symbolHeight + gap / 2
      const w = symbolWidth - gap
      const h = symbolHeight - gap

      // Fill with semi-transparent gold
      this.highlightGraphics.rect(x, y, w, h)
      this.highlightGraphics.fill({ color: HIGHLIGHT_COLOR, alpha: HIGHLIGHT_ALPHA })

      // Border stroke
      this.highlightGraphics.rect(x, y, w, h)
      this.highlightGraphics.stroke({
        color: HIGHLIGHT_COLOR,
        width: HIGHLIGHT_BORDER_WIDTH,
        alpha: HIGHLIGHT_BORDER_ALPHA
      })
    }
  }

  /**
   * Start pop animations for winning symbols
   */
  private startPopAnimations(positions: WinPosition[]): void {
    if (this.isAnimating) return

    // Collect sprites and their base scales
    this.popAnimations = []
    for (const pos of positions) {
      if (pos.reel >= 0 && pos.reel < this.reelStrips.length) {
        const sprite = this.reelStrips[pos.reel].getSpriteForRow(pos.row)
        if (sprite) {
          this.popAnimations.push({
            sprite,
            baseScaleX: sprite.scale.x,
            baseScaleY: sprite.scale.y,
            phase: 'up',
            elapsed: 0,
            reel: pos.reel,
            row: pos.row
          })
        }
      }
    }

    if (this.popAnimations.length === 0) return

    this.isAnimating = true
    Ticker.shared.add(this.onPopTick, this)
  }

  /**
   * Pop animation tick handler
   */
  private onPopTick = (): void => {
    if (!this.isAnimating || this.popAnimations.length === 0) {
      this.stopPopAnimations()
      return
    }

    const deltaMs = Ticker.shared.deltaMS
    let allComplete = true

    for (const anim of this.popAnimations) {
      anim.elapsed += deltaMs

      if (anim.phase === 'up') {
        // Scale up phase
        const progress = Math.min(anim.elapsed / POP_SCALE_UP_DURATION, 1)
        const easeOut = 1 - Math.pow(1 - progress, 2)
        const scale = 1 + (POP_SCALE_TARGET - 1) * easeOut

        anim.sprite.scale.set(
          anim.baseScaleX * scale,
          anim.baseScaleY * scale
        )

        if (progress >= 1) {
          anim.phase = 'down'
          anim.elapsed = 0
        } else {
          allComplete = false
        }
      } else {
        // Scale down phase
        const progress = Math.min(anim.elapsed / POP_SCALE_DOWN_DURATION, 1)
        const easeOut = 1 - Math.pow(1 - progress, 2)
        const scale = POP_SCALE_TARGET - (POP_SCALE_TARGET - 1) * easeOut

        anim.sprite.scale.set(
          anim.baseScaleX * scale,
          anim.baseScaleY * scale
        )

        if (progress < 1) {
          allComplete = false
        }
      }
    }

    // All animations complete - reset scales and stop
    if (allComplete) {
      this.stopPopAnimations()
    }
  }

  /**
   * Stop pop animations and reset sprite scales
   */
  private stopPopAnimations(): void {
    Ticker.shared.remove(this.onPopTick, this)
    this.isAnimating = false

    // Reset all animated sprites to base scale
    for (const anim of this.popAnimations) {
      anim.sprite.scale.set(anim.baseScaleX, anim.baseScaleY)
    }

    this.popAnimations = []
  }

  /**
   * Show win label with amount
   */
  private showLabel(amount: number, currencySymbol: string): void {
    const formattedAmount = formatCurrency(amount, currencySymbol)
    this.labelText.text = `WIN ${formattedAmount}`
    this.repositionLabel()
    this.labelText.visible = true
  }

  /**
   * Hide win label
   */
  private hideLabel(): void {
    this.labelText.visible = false
  }

  /**
   * Reposition label to center-top of grid
   */
  private repositionLabel(): void {
    const { symbolWidth } = this.config
    const gridWidth = symbolWidth * 5

    // Position above the grid, centered
    this.labelText.position.set(
      gridWidth / 2,
      -30  // 30px above the grid
    )
  }

  /**
   * Schedule label hide after duration with presentId guard
   * Stale timers from older presentations are ignored
   */
  private scheduleLabelHide(durationMs: number, forPresentId: number): void {
    if (this.labelTimeoutId) {
      clearTimeout(this.labelTimeoutId)
    }

    this.labelTimeoutId = setTimeout(() => {
      // Guard: only hide if this is still the current presentation
      if (this.presentId !== forPresentId) {
        if (DEBUG_FLAGS.winVerbose) {
          console.log(`[WinPresenter] Stale timer ignored: ${forPresentId} vs current ${this.presentId}`)
        }
        return
      }
      this.hideLabel()
      this.highlightGraphics.clear()
      this.labelTimeoutId = null
    }, durationMs)
  }

  /**
   * Get label duration based on current mode
   */
  private getLabelDuration(): number {
    if (MotionPrefs.turboEnabled) {
      return LABEL_DURATION_TURBO
    }

    // Shorter duration in FREE_SPINS (bonus auto mode)
    if (GameModeStore.mode === 'FREE_SPINS') {
      return LABEL_DURATION_BONUS
    }

    return LABEL_DURATION_BASE
  }

  /**
   * Get middle row positions (fallback when no positions provided)
   * Highlights only row=1 across all 5 reels
   */
  private getMiddleRowPositions(): WinPosition[] {
    return Array.from({ length: REEL_COUNT }, (_, reel) => ({ reel, row: 1 }))
  }

  /**
   * Destroy the presenter and clean up resources
   */
  destroy(): void {
    this.clear()
    Ticker.shared.remove(this.onPopTick, this)
    this.highlightGraphics.destroy()
    this.labelText.destroy()
    this.container.destroy()
  }
}
