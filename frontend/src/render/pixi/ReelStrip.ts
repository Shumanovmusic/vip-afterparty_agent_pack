/**
 * ReelStrip - Single reel column with Graphics-based rendering
 * Uses pure Graphics (like ParticleEmitter) which works in Pixi v8
 * Respects UX_ANIMATION_SPEC.md for bounce/timing rules
 *
 * Pixi v8 NOTE: Graphics positioning works, Sprites don't.
 */

import { Container, Graphics, Ticker } from 'pixi.js'
import { MotionPrefs } from '../../ux/MotionPrefs'
import { SYMBOL_FALLBACK_COLORS, getSymbolKey } from '../assets/AssetManifest'

/** Configuration for a reel strip */
export interface ReelStripConfig {
  x: number
  y: number
  symbolWidth: number
  symbolHeight: number
  visibleRows: number
  gap: number
}

/** Animation state */
type SpinState = 'idle' | 'spinning' | 'stopping' | 'bouncing'

/** Symbol data with Graphics and position tracking */
interface SymbolSlot {
  graphic: Graphics
  symbolId: number
  baseX: number
  currentY: number
}

/** Animation constants */
const BUFFER_SYMBOLS = 5
const SPIN_VELOCITY_INITIAL = 30
const SPIN_VELOCITY_MAX = 50
const SPIN_DECELERATION = 2
const BOUNCE_DURATION_MS = 150
const BOUNCE_OVERSHOOT_PX = 10

/**
 * ReelStrip class - manages a single reel column
 * Uses Graphics (which positions correctly in Pixi v8)
 */
export class ReelStrip {
  public readonly container: Container
  private slots: SymbolSlot[] = []
  private config: ReelStripConfig

  // Animation state
  private state: SpinState = 'idle'
  private velocity = 0
  private targetSymbols: number[] = []
  private stopResolver: (() => void) | null = null

  // Dimmed state per row
  private dimmedRows: Set<number> = new Set()

  // Base Y for bounce animation
  private baseY: number = 0

  constructor(config: ReelStripConfig) {
    this.config = config
    this.baseY = config.y

    // Create container at (0,0) - children will be at absolute positions
    this.container = new Container()
    this.container.label = `ReelStrip-${config.x}`
    this.container.eventMode = 'none'

    console.log(`[ReelStrip] Creating reel at x=${config.x}`)

    // Create symbol slots with Graphics
    // Note: Software clipping via g.visible is used instead of Pixi masks (Pixi v8 compatibility)
    this.createSymbolSlots()
  }

  /** Create Graphics-based symbol slots */
  private createSymbolSlots(): void {
    const { x, y, symbolWidth, symbolHeight, gap } = this.config
    const slotWidth = symbolWidth - gap
    const slotHeight = symbolHeight - gap

    console.log(`[ReelStrip] Creating ${BUFFER_SYMBOLS} Graphics slots, slotSize=${slotWidth}x${slotHeight}`)

    for (let i = 0; i < BUFFER_SYMBOLS; i++) {
      // ABSOLUTE positions (like ParticleEmitter does)
      const slotX = x + gap / 2
      const slotY = y + (i - 1) * symbolHeight + gap / 2

      // Create Graphics and draw colored rectangle
      const graphic = new Graphics()
      this.drawSymbol(graphic, slotX, slotY, slotWidth, slotHeight, 0)

      console.log(`[ReelStrip] Slot ${i}: ABSOLUTE pos=(${slotX}, ${slotY})`)

      this.slots.push({
        graphic,
        symbolId: 0,
        baseX: slotX,
        currentY: slotY,
      })

      this.container.addChild(graphic)
    }

    console.log(`[ReelStrip] Container children: ${this.container.children.length}`)
  }

  /** Draw a symbol as colored rectangle at position */
  private drawSymbol(
    g: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    symbolId: number
  ): void {
    g.clear()

    // Software clipping to visible bounds
    const visibleTop = this.baseY
    const visibleBottom = this.baseY + this.config.symbolHeight * this.config.visibleRows

    // Skip if completely outside visible area
    const isOutside = y + height <= visibleTop || y >= visibleBottom
    if (isOutside) {
      g.visible = false
      return
    }

    g.visible = true

    // Clip to visible bounds
    const clippedY = Math.max(y, visibleTop)
    const clippedBottom = Math.min(y + height, visibleBottom)
    const clippedHeight = clippedBottom - clippedY

    // Don't draw if clipped to nothing
    if (clippedHeight <= 0) {
      g.visible = false
      return
    }

    // Get color for this symbol
    const key = getSymbolKey(symbolId)
    const color = SYMBOL_FALLBACK_COLORS[key]

    // Draw rect at clipped position
    const isFullyVisible = y >= visibleTop && y + height <= visibleBottom
    if (isFullyVisible) {
      g.roundRect(x, y, width, height, 8)
    } else {
      // Partially clipped - draw clipped rect
      g.rect(x, clippedY, width, clippedHeight)
    }
    g.fill({ color })
  }

  /** Update a slot's symbol */
  private updateSlotSymbol(slot: SymbolSlot, symbolId: number): void {
    if (slot.symbolId !== symbolId) {
      const { symbolWidth, symbolHeight, gap } = this.config
      const slotWidth = symbolWidth - gap
      const slotHeight = symbolHeight - gap
      this.drawSymbol(slot.graphic, slot.baseX, slot.currentY, slotWidth, slotHeight, symbolId)
      slot.symbolId = symbolId
    }
  }

  /**
   * Set symbols on this reel (3 visible positions)
   */
  setSymbols(ids: number[]): void {
    // Set visible symbols (indices 1, 2, 3)
    for (let i = 0; i < 3; i++) {
      const slotIndex = i + 1
      const symbolId = ids[i] ?? 0
      this.updateSlotSymbol(this.slots[slotIndex], symbolId)
    }

    // Set buffer symbols
    this.updateSlotSymbol(this.slots[0], ids[0] ?? 0)
    this.updateSlotSymbol(this.slots[4], ids[2] ?? 0)
  }

  /**
   * Start spinning animation
   */
  startSpin(): void {
    if (this.state !== 'idle') return

    this.state = 'spinning'
    this.velocity = SPIN_VELOCITY_INITIAL
    this.clearDimming()

    Ticker.shared.add(this.onTick, this)
  }

  /**
   * Stop spinning with target symbols
   */
  stopSpin(targetSymbols: number[], withBounce?: boolean): Promise<void> {
    if (this.state !== 'spinning') {
      this.setSymbols(targetSymbols)
      return Promise.resolve()
    }

    this.targetSymbols = targetSymbols
    this.state = 'stopping'

    const shouldBounce = withBounce ?? MotionPrefs.shouldShowBounce()

    return new Promise((resolve) => {
      this.stopResolver = () => {
        if (shouldBounce) {
          this.playBounce().then(resolve)
        } else {
          resolve()
        }
      }
    })
  }

  /** Animation tick handler */
  private onTick = (): void => {
    if (this.state === 'idle' || this.state === 'bouncing') {
      return
    }

    const { y, symbolWidth, symbolHeight, gap } = this.config

    if (this.state === 'spinning') {
      if (this.velocity < SPIN_VELOCITY_MAX) {
        this.velocity += 1
      }
    } else if (this.state === 'stopping') {
      this.velocity = Math.max(this.velocity - SPIN_DECELERATION, 5)
    }

    // Move all symbols up and redraw at new positions
    const slotWidth = symbolWidth - gap
    const slotHeight = symbolHeight - gap
    for (const slot of this.slots) {
      slot.currentY -= this.velocity
      this.drawSymbol(slot.graphic, slot.baseX, slot.currentY, slotWidth, slotHeight, slot.symbolId)
    }

    // Check for wrap-around (symbol goes above visible area)
    const wrapThreshold = y - symbolHeight
    for (const slot of this.slots) {
      if (slot.currentY < wrapThreshold) {
        const bottomY = this.getBottomY()
        slot.currentY = bottomY

        if (this.state === 'spinning') {
          const newSymbolId = Math.floor(Math.random() * 8)
          slot.symbolId = newSymbolId
        }
        // Redraw at new position
        this.drawSymbol(slot.graphic, slot.baseX, slot.currentY, slotWidth, slotHeight, slot.symbolId)
      }
    }

    if (this.state === 'stopping') {
      if (this.velocity <= 8) {
        this.finishStop()
      }
    }
  }

  /** Finish the stop animation */
  private finishStop(): void {
    Ticker.shared.remove(this.onTick, this)

    this.setSymbols(this.targetSymbols)
    this.resetSlotPositions()

    this.state = 'idle'
    this.velocity = 0

    if (this.stopResolver) {
      this.stopResolver()
      this.stopResolver = null
    }
  }

  /** Get the Y position for placing a symbol at the bottom */
  private getBottomY(): number {
    let maxY = -Infinity
    for (const slot of this.slots) {
      if (slot.currentY > maxY) maxY = slot.currentY
    }
    return maxY + this.config.symbolHeight
  }

  /** Reset slot positions to default layout */
  private resetSlotPositions(): void {
    const { x, symbolWidth, symbolHeight, gap } = this.config
    const y = this.baseY
    const slotWidth = symbolWidth - gap
    const slotHeight = symbolHeight - gap

    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].baseX = x + gap / 2
      this.slots[i].currentY = y + (i - 1) * symbolHeight + gap / 2
      this.drawSymbol(this.slots[i].graphic, this.slots[i].baseX, this.slots[i].currentY, slotWidth, slotHeight, this.slots[i].symbolId)
    }
  }

  /** Play bounce animation by updating positions */
  private playBounce(): Promise<void> {
    return new Promise((resolve) => {
      this.state = 'bouncing'
      const startTime = performance.now()
      const { symbolWidth, symbolHeight, gap } = this.config
      const slotWidth = symbolWidth - gap
      const slotHeight = symbolHeight - gap

      // Store initial Y positions
      const startYs = this.slots.map(s => s.currentY)

      const animate = (): void => {
        const elapsed = performance.now() - startTime
        const progress = Math.min(elapsed / BOUNCE_DURATION_MS, 1)

        let offsetY = 0
        if (progress < 0.4) {
          offsetY = BOUNCE_OVERSHOOT_PX * (progress / 0.4)
        } else {
          const settleProgress = (progress - 0.4) / 0.6
          const easeOut = 1 - Math.pow(1 - settleProgress, 2)
          offsetY = BOUNCE_OVERSHOOT_PX * (1 - easeOut)
        }

        // Redraw at new positions
        for (let i = 0; i < this.slots.length; i++) {
          this.slots[i].currentY = startYs[i] + offsetY
          this.drawSymbol(this.slots[i].graphic, this.slots[i].baseX, this.slots[i].currentY, slotWidth, slotHeight, this.slots[i].symbolId)
        }

        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          this.resetSlotPositions()
          this.state = 'idle'
          resolve()
        }
      }

      requestAnimationFrame(animate)
    })
  }

  /**
   * Set dimmed state for non-winning rows
   */
  setDimmed(row: number, dimmed: boolean): void {
    if (dimmed) {
      this.dimmedRows.add(row)
    } else {
      this.dimmedRows.delete(row)
    }
    this.updateDimming()
  }

  /**
   * Clear all dimming
   */
  clearDimming(): void {
    this.dimmedRows.clear()
    this.updateDimming()
  }

  /** Update graphic alpha based on dimmed state */
  private updateDimming(): void {
    for (let row = 0; row < 3; row++) {
      const slotIndex = row + 1
      this.slots[slotIndex].graphic.alpha = this.dimmedRows.has(row) ? 0.3 : 1
    }
  }

  /**
   * Set highlight on a specific row
   */
  setHighlight(row: number, highlighted: boolean): void {
    const slotIndex = row + 1
    if (highlighted) {
      this.slots[slotIndex].graphic.alpha = 1
    }
  }

  /**
   * Update layout configuration
   */
  updateLayout(update: Partial<ReelStripConfig>): void {
    Object.assign(this.config, update)
    this.baseY = this.config.y
    this.resetSlotPositions()
  }

  /** Clean up resources */
  destroy(): void {
    Ticker.shared.remove(this.onTick, this)
    this.container.destroy({ children: true })
  }
}
