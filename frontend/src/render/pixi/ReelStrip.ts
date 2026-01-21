/**
 * ReelStrip - Single reel column with Sprite-based rendering
 * Uses Sprites with textures from AssetLoader (atlas or fallback)
 * Respects UX_ANIMATION_SPEC.md for bounce/timing rules
 *
 * Pixi v8 NOTE: Uses software clipping via sprite.visible for per-symbol culling
 */

import { Container, Sprite, Ticker, Texture } from 'pixi.js'
import { MotionPrefs } from '../../ux/MotionPrefs'
import { AssetLoader } from '../assets/AssetLoader'
import { getSymbolKey } from '../assets/AssetManifest'
import { SymbolRenderer } from './SymbolRenderer'

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

/** Symbol data with Sprite and position tracking */
interface SymbolSlot {
  sprite: Sprite
  symbolId: number
  currentY: number
}

/** Animation constants */
const BUFFER_SYMBOLS = 5
const SPIN_VELOCITY_INITIAL = 30
const SPIN_VELOCITY_MAX = 50
const SPIN_DECELERATION = 2
const BOUNCE_DURATION_MS = 150
const BOUNCE_OVERSHOOT_PX = 10

/** Debug flag for first texture log */
let textureDebugLogged = false

/**
 * Get texture for a symbol ID with debug logging (once)
 * Maps symbol IDs (0-9) to texture keys (sym_0 through sym_9)
 * See ASSET_SPEC_V1.md for full mapping:
 *   0-4 → L1-L5, 5-7 → H1-H3, 8 → WD, 9 → SC
 */
function getTextureForSymbol(symbolId: number): Texture {
  const key = getSymbolKey(symbolId)

  if (import.meta.env.DEV && !textureDebugLogged) {
    console.log(`[ReelStrip] getTextureForSymbol called: SymbolRenderer.isReady=${SymbolRenderer.isReady}`)
  }

  // Use SymbolRenderer for VIP chip textures (programmatic)
  if (SymbolRenderer.isReady) {
    const texture = SymbolRenderer.getTexture(key)

    if (import.meta.env.DEV && !textureDebugLogged) {
      textureDebugLogged = true
      console.log(`[ReelStrip] SymbolRenderer texture: key=${key}, size=${texture.width}x${texture.height}`)
    }

    return texture
  }

  // Fallback to AssetLoader (atlas or fallback)
  const texture = AssetLoader.getSymbolTexture(symbolId)

  if (import.meta.env.DEV && !textureDebugLogged) {
    textureDebugLogged = true
    console.log(`[ReelStrip] AssetLoader FALLBACK texture: key=${key}, size=${texture.width}x${texture.height}`)
  }

  return texture
}

/**
 * ReelStrip class - manages a single reel column
 * Uses Sprites with software visibility clipping
 */
export class ReelStrip {
  private slots: SymbolSlot[] = []
  private config: ReelStripConfig
  private parent: Container
  private baseX: number
  private baseY: number

  // Animation state
  private state: SpinState = 'idle'
  private velocity = 0
  private targetSymbols: number[] = []
  private stopResolver: (() => void) | null = null

  // Dimmed state per row
  private dimmedRows: Set<number> = new Set()

  constructor(config: ReelStripConfig, parent: Container) {
    this.config = config
    this.parent = parent
    this.baseX = config.x
    this.baseY = config.y

    if (import.meta.env.DEV) {
      console.log(`[ReelStrip] Creating reel: config=(${config.x}, ${config.y})`)
    }

    // Create symbol slots with Sprites
    this.createSymbolSlots()
  }

  /** Software clipping: update sprite visibility based on LOCAL coords */
  private updateSpriteClipping(slot: SymbolSlot): void {
    const { symbolHeight, visibleRows, gap } = this.config
    // LOCAL coords - visible area is 0 to (symbolHeight * visibleRows)
    // baseY is the x-offset for this reel column, not relevant for vertical clipping
    const visibleTop = 0
    const visibleBottom = symbolHeight * visibleRows
    const spriteTop = slot.currentY
    const spriteBottom = slot.currentY + (symbolHeight - gap)
    slot.sprite.visible = !(spriteBottom <= visibleTop || spriteTop >= visibleBottom)
  }

  /** Create Sprite-based symbol slots */
  private createSymbolSlots(): void {
    const { symbolHeight, symbolWidth, gap, visibleRows } = this.config
    const slotBaseX = this.baseX + gap / 2

    if (import.meta.env.DEV) {
      console.log(`[ReelStrip] createSymbolSlots: baseX=${this.baseX}, baseY=${this.baseY}, slotBaseX=${slotBaseX}, rows=${visibleRows}, symbolWidth=${symbolWidth}`)
    }

    for (let i = 0; i < BUFFER_SYMBOLS; i++) {
      const slotY = this.baseY + (i - 1) * symbolHeight + gap / 2

      const texture = getTextureForSymbol(0)
      const sprite = new Sprite(texture)
      this.parent.addChild(sprite)
      this.applySpriteScale(sprite)
      sprite.position.set(slotBaseX, slotY)

      if (import.meta.env.DEV && i === 0) {
        console.log(`[ReelStrip] Sprite ${i} created:`, {
          reelBaseX: this.baseX,
          gap: gap,
          symbolWidth: symbolWidth,
          slotBaseX: slotBaseX,
          slotY: slotY,
          spriteX: sprite.position.x,
          spriteY: sprite.position.y,
          spriteWidth: sprite.width,
          spriteHeight: sprite.height,
          parentLabel: this.parent.label,
        })
      }

      const slot: SymbolSlot = {
        sprite,
        symbolId: 0,
        currentY: slotY,
      }

      this.slots.push(slot)
      this.updateSpriteClipping(slot)
    }
  }

  /** Update a slot's symbol and texture */
  private updateSlotSymbol(slot: SymbolSlot, symbolId: number): void {
    if (slot.symbolId !== symbolId) {
      slot.symbolId = symbolId
      slot.sprite.texture = getTextureForSymbol(symbolId)
      this.applySpriteScale(slot.sprite)
    }
  }

  /** Ensure sprite scale matches current symbol dimensions */
  private applySpriteScale(sprite: Sprite): void {
    const { symbolWidth, symbolHeight, gap } = this.config
    const slotWidth = symbolWidth - gap
    const slotHeight = symbolHeight - gap
    const textureWidth = Math.max(sprite.texture.width, 1)
    const textureHeight = Math.max(sprite.texture.height, 1)

    if (import.meta.env.DEV && (sprite.texture.width === 0 || sprite.texture.height === 0)) {
      console.warn('[ReelStrip] Texture size is zero, using fallback scale', {
        textureWidth: sprite.texture.width,
        textureHeight: sprite.texture.height,
      })
    }

    sprite.scale.set(slotWidth / textureWidth, slotHeight / textureHeight)
  }

  /** Update slot position (used during animation) */
  private updateSlotPosition(slot: SymbolSlot): void {
    const slotX = this.baseX + this.config.gap / 2
    slot.sprite.position.set(slotX, slot.currentY)
    this.updateSpriteClipping(slot)
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

    const { symbolHeight } = this.config

    if (this.state === 'spinning') {
      if (this.velocity < SPIN_VELOCITY_MAX) {
        this.velocity += 1
      }
    } else if (this.state === 'stopping') {
      this.velocity = Math.max(this.velocity - SPIN_DECELERATION, 5)
    }

    // Move all symbols up - just update Y positions
    for (const slot of this.slots) {
      slot.currentY -= this.velocity
      this.updateSlotPosition(slot)
    }

    // Check for wrap-around (symbol goes above visible area) - ABS coords
    const wrapThreshold = this.baseY - symbolHeight
    for (const slot of this.slots) {
      if (slot.currentY < wrapThreshold) {
        const bottomY = this.getBottomY()
        slot.currentY = bottomY
        this.updateSlotPosition(slot)

        if (this.state === 'spinning') {
          const newSymbolId = Math.floor(Math.random() * 10)
          this.updateSlotSymbol(slot, newSymbolId)
        }
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

  /** Reset slot positions to default layout (ABS coords) */
  private resetSlotPositions(): void {
    const { symbolHeight, gap } = this.config

    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].currentY = this.baseY + (i - 1) * symbolHeight + gap / 2
      this.updateSlotPosition(this.slots[i])
    }
  }

  /** Play bounce animation by updating positions */
  private playBounce(): Promise<void> {
    return new Promise((resolve) => {
      this.state = 'bouncing'
      const startTime = performance.now()

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

        // Update positions - just move sprites
        for (let i = 0; i < this.slots.length; i++) {
          this.slots[i].currentY = startYs[i] + offsetY
          this.updateSlotPosition(this.slots[i])
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

  /** Update sprite alpha based on dimmed state */
  private updateDimming(): void {
    for (let row = 0; row < 3; row++) {
      const slotIndex = row + 1
      this.slots[slotIndex].sprite.alpha = this.dimmedRows.has(row) ? 0.3 : 1
    }
  }

  /**
   * Set highlight on a specific row
   */
  setHighlight(row: number, highlighted: boolean): void {
    const slotIndex = row + 1
    if (highlighted) {
      this.slots[slotIndex].sprite.alpha = 1
    }
  }

  /**
   * Refresh all textures (called when MotionPrefs change)
   * Forces re-fetch of textures which may have different visual styles
   */
  refreshTextures(): void {
    for (const slot of this.slots) {
      slot.sprite.texture = getTextureForSymbol(slot.symbolId)
      this.applySpriteScale(slot.sprite)
    }
  }

  setBase(x: number, y: number): void {
    this.updateLayout({ x, y })
  }

  getBase(): { x: number; y: number } {
    return { x: this.baseX, y: this.baseY }
  }

  /**
   * Update layout configuration
   */
  updateLayout(update: Partial<ReelStripConfig>): void {
    Object.assign(this.config, update)
    this.baseX = this.config.x
    this.baseY = this.config.y

    // Update sprite scales if dimensions changed
    if (update.symbolWidth !== undefined || update.symbolHeight !== undefined || update.gap !== undefined) {
      for (const slot of this.slots) {
        this.applySpriteScale(slot.sprite)
      }
    }

    this.resetSlotPositions()
  }

  /** Debug helper for position validation */
  getDebugSprite(): Sprite | null {
    return this.slots[0]?.sprite ?? null
  }

  /** Debug snapshot for slot positions */
  getDebugSnapshot(): {
    baseX: number
    baseY: number
    slots: Array<{
      x: number
      y: number
      width: number
      height: number
      visible: boolean
      alpha: number
    }>
  } {
    return {
      baseX: this.baseX,
      baseY: this.baseY,
      slots: this.slots.map(slot => ({
        x: slot.sprite.x,
        y: slot.sprite.y,
        width: slot.sprite.width,
        height: slot.sprite.height,
        visible: slot.sprite.visible,
        alpha: slot.sprite.alpha,
      }))
    }
  }

  /** Clean up resources */
  destroy(): void {
    Ticker.shared.remove(this.onTick, this)

    for (const slot of this.slots) {
      this.parent.removeChild(slot.sprite)
      slot.sprite.destroy()
    }
    this.slots = []

  }
}
