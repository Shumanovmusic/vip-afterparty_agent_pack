/**
 * ReelStrip - Single reel column with Sprite-based rendering
 * Implements smooth vertical scrolling with symbol wrap-around
 * Deterministic stop ensures final grid matches backend result exactly
 *
 * Coordinate system:
 * - All Y positions are local to reelsContainer (0 = top of visible area)
 * - Visible window: [0, VISIBLE_ROWS * symbolHeight)
 * - Symbols wrap from bottom to top during spin
 */

import { Container, Sprite, Ticker, Texture } from 'pixi.js'
import { MotionPrefs } from '../../ux/MotionPrefs'
import { AssetLoader } from '../assets/AssetLoader'
import { getSymbolKey } from '../assets/AssetManifest'
import { SymbolRenderer } from './SymbolRenderer'
import { DEBUG_FLAGS } from './DebugFlags'

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

/** Symbol slot with Sprite and position tracking */
interface SymbolSlot {
  sprite: Sprite
  symbolId: number
  /** Logical row index in the slot array (0 = buffer above, 1-3 = visible, 4 = buffer below) */
  slotIndex: number
}

/** Animation constants */
const BUFFER_SYMBOLS = 5  // 1 above + 3 visible + 1 below
const VISIBLE_ROWS = 3

// Velocity in pixels per frame (~60fps)
const SPIN_VELOCITY_INITIAL = 20
const SPIN_VELOCITY_MAX = 40
const SPIN_ACCELERATION = 1.5
const SPIN_DECELERATION = 2
const STOP_MIN_VELOCITY = 6

// Bounce animation
const BOUNCE_DURATION_MS = 150
const BOUNCE_OVERSHOOT_PX = 8

// Symbol stream for deterministic spinning (cycles through all symbols)
const SPIN_SYMBOL_STREAM = [0, 5, 1, 6, 2, 7, 3, 8, 4, 9]

/** Debug flag for first texture log */
let textureDebugLogged = false

/**
 * Get texture for a symbol ID
 */
function getTextureForSymbol(symbolId: number): Texture {
  const key = getSymbolKey(symbolId)

  if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout && !textureDebugLogged) {
    console.log(`[ReelStrip] getTextureForSymbol called: SymbolRenderer.isReady=${SymbolRenderer.isReady}`)
  }

  if (SymbolRenderer.isReady) {
    const texture = SymbolRenderer.getTexture(key)

    if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout && !textureDebugLogged) {
      textureDebugLogged = true
      console.log(`[ReelStrip] SymbolRenderer texture: key=${key}, size=${texture.width}x${texture.height}`)
    }

    return texture
  }

  const texture = AssetLoader.getSymbolTexture(symbolId)

  if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout && !textureDebugLogged) {
    textureDebugLogged = true
    console.log(`[ReelStrip] AssetLoader FALLBACK texture: key=${key}, size=${texture.width}x${texture.height}`)
  }

  return texture
}

/**
 * ReelStrip - Manages a single reel column with smooth scrolling
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
  private scrollOffset = 0  // Current scroll offset (0 = aligned to grid)
  private targetSymbols: number[] = []
  private stopResolver: (() => void) | null = null
  private quickStopRequested = false

  // Symbol stream state for spinning
  private streamIndex = 0
  private wrapCount = 0  // Number of symbols wrapped during stop

  // Dimmed state per row
  private dimmedRows: Set<number> = new Set()

  constructor(config: ReelStripConfig, parent: Container) {
    this.config = config
    this.parent = parent
    this.baseX = config.x
    this.baseY = config.y

    if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout) {
      console.log(`[ReelStrip] Creating reel: config=(${config.x}, ${config.y})`)
    }

    this.createSymbolSlots()
  }

  /** Get current spin state */
  getState(): SpinState {
    return this.state
  }

  /** Check if this reel is currently animating */
  isAnimating(): boolean {
    return this.state !== 'idle'
  }

  /** Software clipping: update sprite visibility based on LOCAL coords */
  private updateSpriteClipping(slot: SymbolSlot, y: number): void {
    const { symbolHeight, gap } = this.config
    const visibleTop = -symbolHeight * 0.5  // Allow partial visibility at top
    const visibleBottom = VISIBLE_ROWS * symbolHeight + symbolHeight * 0.5
    const spriteTop = y
    const spriteBottom = y + (symbolHeight - gap)
    slot.sprite.visible = !(spriteBottom <= visibleTop || spriteTop >= visibleBottom)
  }

  /** Create Sprite-based symbol slots */
  private createSymbolSlots(): void {
    const { symbolHeight, gap } = this.config
    const slotBaseX = this.baseX + gap / 2

    if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout) {
      console.log(`[ReelStrip] createSymbolSlots: baseX=${this.baseX}, slotBaseX=${slotBaseX}`)
    }

    for (let i = 0; i < BUFFER_SYMBOLS; i++) {
      // Position: slot 0 is above visible, slots 1-3 are visible, slot 4 is below
      const slotY = (i - 1) * symbolHeight + gap / 2

      const texture = getTextureForSymbol(0)
      const sprite = new Sprite(texture)
      this.parent.addChild(sprite)
      this.applySpriteScale(sprite)
      sprite.position.set(slotBaseX, slotY)

      if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout && i === 0) {
        console.log(`[ReelStrip] Sprite ${i} created:`, {
          slotY,
          spriteX: sprite.position.x,
          spriteY: sprite.position.y,
        })
      }

      const slot: SymbolSlot = {
        sprite,
        symbolId: 0,
        slotIndex: i,
      }

      this.slots.push(slot)
      this.updateSpriteClipping(slot, slotY)
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

    sprite.scale.set(slotWidth / textureWidth, slotHeight / textureHeight)
  }

  /** Update all slot positions based on current scroll offset */
  private updateSlotPositions(): void {
    const { symbolHeight, gap } = this.config
    const slotBaseX = this.baseX + gap / 2

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      // Base Y + scroll offset
      const y = (i - 1) * symbolHeight + gap / 2 + this.scrollOffset
      slot.sprite.position.set(slotBaseX, y)
      this.updateSpriteClipping(slot, y)
    }
  }

  /**
   * Set symbols on this reel (3 visible positions)
   * Immediate update, no animation
   */
  setSymbols(ids: number[]): void {
    // Set visible symbols (indices 1, 2, 3 in slot array)
    for (let i = 0; i < VISIBLE_ROWS; i++) {
      const slotIndex = i + 1
      const symbolId = ids[i] ?? 0
      this.updateSlotSymbol(this.slots[slotIndex], symbolId)
    }

    // Set buffer symbols to match edges
    this.updateSlotSymbol(this.slots[0], ids[0] ?? 0)  // Above = same as top
    this.updateSlotSymbol(this.slots[4], ids[2] ?? 0)  // Below = same as bottom

    // Reset scroll offset to aligned state
    this.scrollOffset = 0
    this.updateSlotPositions()
  }

  /**
   * Start spinning animation
   */
  startSpin(): void {
    if (this.state !== 'idle') return

    this.state = 'spinning'
    this.velocity = SPIN_VELOCITY_INITIAL
    this.scrollOffset = 0
    this.quickStopRequested = false
    this.wrapCount = 0
    this.streamIndex = Math.floor(Math.random() * SPIN_SYMBOL_STREAM.length)
    this.clearDimming()

    Ticker.shared.add(this.onTick, this)
  }

  /**
   * Stop spinning with target symbols
   * @param targetSymbols - Final 3 symbols (top to bottom)
   * @param withBounce - Optional override for bounce animation
   */
  stopSpin(targetSymbols: number[], withBounce?: boolean): Promise<void> {
    if (this.state !== 'spinning' && this.state !== 'stopping') {
      // Not spinning - just set symbols directly
      this.setSymbols(targetSymbols)
      return Promise.resolve()
    }

    this.targetSymbols = targetSymbols
    this.state = 'stopping'
    this.wrapCount = 0

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

  /**
   * Request quick stop (faster deceleration)
   */
  requestQuickStop(): void {
    if (this.state === 'spinning' || this.state === 'stopping') {
      this.quickStopRequested = true
    }
  }

  /** Animation tick handler */
  private onTick = (): void => {
    if (this.state === 'idle' || this.state === 'bouncing') {
      return
    }

    const { symbolHeight } = this.config
    const decel = this.quickStopRequested ? SPIN_DECELERATION * 3 : SPIN_DECELERATION

    // Update velocity
    if (this.state === 'spinning') {
      if (this.velocity < SPIN_VELOCITY_MAX) {
        this.velocity = Math.min(this.velocity + SPIN_ACCELERATION, SPIN_VELOCITY_MAX)
      }
    } else if (this.state === 'stopping') {
      // During stopping, ensure we've wrapped enough symbols before slowing down
      const minWraps = this.quickStopRequested ? 2 : 4
      if (this.wrapCount >= minWraps) {
        this.velocity = Math.max(this.velocity - decel, STOP_MIN_VELOCITY)
      }
    }

    // Move symbols down (positive scroll = symbols move down visually)
    this.scrollOffset += this.velocity

    // Check for wrap-around (when scroll exceeds one symbol height)
    if (this.scrollOffset >= symbolHeight) {
      this.scrollOffset -= symbolHeight
      this.onSymbolWrap()
    }

    this.updateSlotPositions()

    // Check for stop condition
    if (this.state === 'stopping' && this.velocity <= STOP_MIN_VELOCITY) {
      // Check if we're close enough to aligned position
      if (this.scrollOffset < this.velocity * 2) {
        this.finishStop()
      }
    }
  }

  /** Handle symbol wrap-around during spin */
  private onSymbolWrap(): void {
    // Rotate slot array: move first slot to end
    const topSlot = this.slots.shift()!
    this.slots.push(topSlot)

    // Update slot indices
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].slotIndex = i
    }

    // Assign new symbol to the bottom slot
    const bottomSlot = this.slots[this.slots.length - 1]

    if (this.state === 'stopping') {
      this.wrapCount++
      // Inject target symbols as we approach stop
      // wrapCount 1: inject target[2] (bottom)
      // wrapCount 2: inject target[1] (middle)
      // wrapCount 3: inject target[0] (top)
      // After that, keep injecting from top to maintain buffer
      const targetIndex = 3 - this.wrapCount
      if (targetIndex >= 0 && targetIndex < this.targetSymbols.length) {
        this.updateSlotSymbol(bottomSlot, this.targetSymbols[targetIndex])
      } else if (this.wrapCount === 4) {
        // Inject buffer above (same as top visible)
        this.updateSlotSymbol(bottomSlot, this.targetSymbols[0])
      }
    } else {
      // During spin: use deterministic symbol stream
      const newSymbolId = SPIN_SYMBOL_STREAM[this.streamIndex]
      this.streamIndex = (this.streamIndex + 1) % SPIN_SYMBOL_STREAM.length
      this.updateSlotSymbol(bottomSlot, newSymbolId)
    }
  }

  /** Finish the stop animation */
  private finishStop(): void {
    Ticker.shared.remove(this.onTick, this)

    // Snap to aligned position
    this.scrollOffset = 0

    // Ensure final symbols match target exactly
    this.setSymbols(this.targetSymbols)

    this.state = 'idle'
    this.velocity = 0
    this.quickStopRequested = false

    if (this.stopResolver) {
      this.stopResolver()
      this.stopResolver = null
    }
  }

  /** Play bounce animation */
  private playBounce(): Promise<void> {
    return new Promise((resolve) => {
      this.state = 'bouncing'
      const startTime = performance.now()
      const startOffset = this.scrollOffset

      const animate = (): void => {
        const elapsed = performance.now() - startTime
        const progress = Math.min(elapsed / BOUNCE_DURATION_MS, 1)

        // Bounce: overshoot down, then settle back
        let bounceOffset = 0
        if (progress < 0.4) {
          bounceOffset = BOUNCE_OVERSHOOT_PX * (progress / 0.4)
        } else {
          const settleProgress = (progress - 0.4) / 0.6
          const easeOut = 1 - Math.pow(1 - settleProgress, 2)
          bounceOffset = BOUNCE_OVERSHOOT_PX * (1 - easeOut)
        }

        this.scrollOffset = startOffset + bounceOffset
        this.updateSlotPositions()

        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          this.scrollOffset = 0
          this.updateSlotPositions()
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
    for (let row = 0; row < VISIBLE_ROWS; row++) {
      const slotIndex = row + 1
      if (slotIndex < this.slots.length) {
        this.slots[slotIndex].sprite.alpha = this.dimmedRows.has(row) ? 0.3 : 1
      }
    }
  }

  /**
   * Set highlight on a specific row
   */
  setHighlight(row: number, highlighted: boolean): void {
    const slotIndex = row + 1
    if (highlighted && slotIndex < this.slots.length) {
      this.slots[slotIndex].sprite.alpha = 1
    }
  }

  /**
   * Refresh all textures (called when MotionPrefs change)
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

    // Reset positions
    this.scrollOffset = 0
    this.updateSlotPositions()
  }

  /** Debug helper for position validation */
  getDebugSprite(): Sprite | null {
    return this.slots[0]?.sprite ?? null
  }

  /** Debug snapshot for slot positions */
  getDebugSnapshot(): {
    baseX: number
    baseY: number
    state: SpinState
    scrollOffset: number
    slots: Array<{
      x: number
      y: number
      width: number
      height: number
      visible: boolean
      alpha: number
      symbolId: number
    }>
  } {
    return {
      baseX: this.baseX,
      baseY: this.baseY,
      state: this.state,
      scrollOffset: this.scrollOffset,
      slots: this.slots.map(slot => ({
        x: slot.sprite.x,
        y: slot.sprite.y,
        width: slot.sprite.width,
        height: slot.sprite.height,
        visible: slot.sprite.visible,
        alpha: slot.sprite.alpha,
        symbolId: slot.symbolId,
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
