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

// Velocity envelope constants (Batch 5 spin physics overhaul)
const SPIN_VELOCITY_MAX = 40

// Acceleration phase (power2In easing)
const ACCEL_DURATION_MS = 120

// Deceleration uses backOut easing with this overshoot parameter
const BACK_OUT_S = 1.7

// Minimum velocity before snapping to stop
const STOP_MIN_VELOCITY = 6

// Bounce/settle animation - pronounced landing effect
const BOUNCE_DURATION_MS = 400       // Target ~400ms landing phase
const BOUNCE_OVERSHOOT_PX = 50       // Overshoot distance (px) before bounce back
const BOUNCE_OVERSHOOT_TURBO_PX = 25 // Turbo mode fallback (if enabled later)

/** Easing: power2In (t^2) for acceleration */
function power2In(t: number): number {
  return t * t
}

/** Easing: backOut with configurable overshoot for deceleration */
function backOut(t: number, s: number = BACK_OUT_S): number {
  const u = t - 1
  return 1 + u * u * ((s + 1) * u + s)
}

// Symbol stream for deterministic spinning (cycles through all symbols)
const SPIN_SYMBOL_STREAM = [0, 5, 1, 6, 2, 7, 3, 8, 4, 9]

/** Debug flag for first texture log */
let textureDebugLogged = false

/**
 * Get texture for a symbol ID
 *
 * Priority order (to ensure proper graphics, not debug squares):
 * 1. Atlas texture (if loaded and available for this key)
 * 2. SymbolRenderer (procedural VIP graphics: crown, watch, champagne, etc.)
 * 3. AssetLoader fallback (colored squares - last resort)
 */
function getTextureForSymbol(symbolId: number): Texture {
  const key = getSymbolKey(symbolId)

  if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout && !textureDebugLogged) {
    console.log(`[ReelStrip] getTextureForSymbol: symbolId=${symbolId}, key=${key}`)
    console.log(`[ReelStrip]   AssetLoader.isLoaded=${AssetLoader.isLoaded}, hasTexture=${AssetLoader.hasTexture(key)}`)
    console.log(`[ReelStrip]   SymbolRenderer.isReady=${SymbolRenderer.isReady}`)
  }

  // 1. Prefer atlas texture if available (best quality)
  if (AssetLoader.isLoaded && AssetLoader.hasTexture(key)) {
    const texture = AssetLoader.getTexture(key)

    if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout && !textureDebugLogged) {
      textureDebugLogged = true
      console.log(`[ReelStrip] Using ATLAS texture: key=${key}, size=${texture.width}x${texture.height}`)
    }

    return texture
  }

  // 2. Use SymbolRenderer for procedural VIP graphics (crown, watch, champagne, etc.)
  if (SymbolRenderer.isReady) {
    const texture = SymbolRenderer.getTexture(key)

    if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout && !textureDebugLogged) {
      textureDebugLogged = true
      console.log(`[ReelStrip] Using SymbolRenderer texture: key=${key}, size=${texture.width}x${texture.height}`)
    }

    return texture
  }

  // 3. Last resort: AssetLoader fallback (colored squares)
  const texture = AssetLoader.getSymbolTexture(symbolId)

  if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout && !textureDebugLogged) {
    textureDebugLogged = true
    console.log(`[ReelStrip] Using FALLBACK texture: key=${key}, size=${texture.width}x${texture.height}`)
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

  // Velocity envelope timing (Batch 5)
  private spinStartTime = 0       // For acceleration phase timing
  private stopStartTime = 0       // For deceleration phase timing
  private decelStartVelocity = 0  // Velocity when stopping began

  // Symbol stream state for spinning
  private streamIndex = 0
  private wrapCount = 0  // Number of symbols wrapped during stop

  // Dimmed state per row
  private dimmedRows: Set<number> = new Set()

  // Pre-bounce offset captured before setSymbols resets it
  private preBounceOffset = 0

  /** Callback fired at start of bounce for audio coordination */
  public onImpactCallback?: () => void

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
   * Uses velocity envelope: ACCEL (120ms) → STEADY → DECEL → SETTLE
   */
  startSpin(): void {
    if (this.state !== 'idle') return

    this.state = 'spinning'
    this.velocity = 0  // Start from 0, will ramp up during accel phase
    this.scrollOffset = 0
    this.quickStopRequested = false
    this.wrapCount = 0
    this.streamIndex = Math.floor(Math.random() * SPIN_SYMBOL_STREAM.length)
    this.spinStartTime = performance.now()
    this.stopStartTime = 0
    this.decelStartVelocity = 0
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
          // No bounce: snap to 0 here since finishStop no longer does it
          this.scrollOffset = 0
          this.updateSlotPositions()
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

  /**
   * Get current velocity based on spin state and elapsed time
   * Velocity envelope: ACCEL (power2In) → STEADY → DECEL (backOut)
   */
  private computeVelocity(): number {
    const now = performance.now()

    if (this.state === 'spinning') {
      // Acceleration phase: 0 → SPIN_VELOCITY_MAX over ACCEL_DURATION_MS
      const elapsed = now - this.spinStartTime
      if (elapsed < ACCEL_DURATION_MS) {
        const t = elapsed / ACCEL_DURATION_MS
        return SPIN_VELOCITY_MAX * power2In(t)
      }
      // Steady state: full velocity
      return SPIN_VELOCITY_MAX
    }

    if (this.state === 'stopping') {
      // Initialize deceleration timing on first call
      if (this.stopStartTime === 0) {
        this.stopStartTime = now
        this.decelStartVelocity = this.velocity
      }

      // Wait for minimum symbol wraps before decelerating
      // Always require 4 wraps for complete symbol injection (prevents black void)
      const minWraps = 4
      if (this.wrapCount < minWraps) {
        return this.velocity  // Keep current velocity
      }

      // Deceleration phase: use backOut easing from current velocity to STOP_MIN_VELOCITY
      const decelDuration = this.quickStopRequested ? 150 : 300
      const elapsed = now - this.stopStartTime
      const t = Math.min(elapsed / decelDuration, 1)

      // backOut gives 0→1, we want decelStartVelocity→STOP_MIN_VELOCITY
      const eased = backOut(t)
      const velocityRange = this.decelStartVelocity - STOP_MIN_VELOCITY
      return this.decelStartVelocity - velocityRange * eased
    }

    return 0
  }

  /** Animation tick handler */
  private onTick = (): void => {
    if (this.state === 'idle' || this.state === 'bouncing') {
      return
    }

    const { symbolHeight } = this.config

    // Update velocity using envelope computation
    this.velocity = Math.max(this.computeVelocity(), 0)

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
      // CRITICAL: Must have completed at least 4 wraps for all symbols to be injected
      const allSymbolsInjected = this.wrapCount >= 4
      // Check if we're close enough to aligned position AND all symbols are ready
      if (allSymbolsInjected && this.scrollOffset < this.velocity * 2) {
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

    // CRITICAL: Capture offset BEFORE setSymbols resets it to 0
    // This allows playBounce() to animate from the actual stopping position
    this.preBounceOffset = this.scrollOffset

    if (import.meta.env.DEV) {
      console.log(`[ReelStrip] finishStop captured preBounceOffset=${this.preBounceOffset.toFixed(2)}, wrapCount=${this.wrapCount}`)
    }

    // Ensure final symbols match target exactly (this resets scrollOffset to 0)
    this.setSymbols(this.targetSymbols)

    this.state = 'idle'
    this.velocity = 0
    this.quickStopRequested = false

    if (this.stopResolver) {
      this.stopResolver()
      this.stopResolver = null
    }
  }

  /**
   * Play bounce/settle animation with 2 phases (GSAP-style timeline):
   * Phase 1: OVERSHOOT - move down to +50px
   * Phase 2: BOUNCE BACK - return to 0 using Back.out(1.5)
   */
  private playBounce(): Promise<void> {
    return new Promise((resolve) => {
      this.state = 'bouncing'
      const startTime = performance.now()

      const overshoot = MotionPrefs.turboEnabled ? BOUNCE_OVERSHOOT_TURBO_PX : BOUNCE_OVERSHOOT_PX
      const duration = MotionPrefs.turboEnabled ? BOUNCE_DURATION_MS * 0.6 : BOUNCE_DURATION_MS
      const downDuration = duration * 0.4
      const upDuration = duration - downDuration

      if (import.meta.env.DEV) {
        console.log(`[ReelStrip] playBounce overshoot=${overshoot}, duration=${duration}ms`)
      }

      let impactFired = false

      const animate = (): void => {
        const elapsed = performance.now() - startTime

        if (elapsed < downDuration) {
          const t = elapsed / downDuration
          const eased = t * t
          this.scrollOffset = overshoot * eased
        } else {
          if (!impactFired) {
            impactFired = true
            if (this.onImpactCallback) {
              this.onImpactCallback()
            }
          }

          const t = Math.min((elapsed - downDuration) / upDuration, 1)
          const eased = backOut(t, 1.5)
          this.scrollOffset = overshoot * (1 - eased)
        }

        this.updateSlotPositions()

        if (elapsed < duration) {
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
   * Get current velocity (for blur calculation)
   */
  getVelocity(): number {
    return this.velocity
  }

  /**
   * Get current spin phase for blur/effects coordination
   * @returns Phase identifier: 'idle' | 'accel' | 'steady' | 'decel' | 'settle'
   */
  getSpinPhase(): 'idle' | 'accel' | 'steady' | 'decel' | 'settle' {
    if (this.state === 'idle') return 'idle'
    if (this.state === 'bouncing') return 'settle'

    // During spinning state
    if (this.state === 'spinning') {
      const elapsed = performance.now() - this.spinStartTime
      if (elapsed < ACCEL_DURATION_MS) return 'accel'
      return 'steady'
    }

    // During stopping state
    if (this.state === 'stopping') {
      // Check if we've started decelerating (past min wraps)
      const minWraps = this.quickStopRequested ? 2 : 4
      if (this.wrapCount < minWraps) return 'steady'
      return 'decel'
    }

    return 'idle'
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

  /**
   * Get currently visible symbol IDs (3 rows, top to bottom)
   * Row order: row=0 is TOP, row=1 is MIDDLE, row=2 is BOTTOM
   * @returns Array of 3 symbolIds [top, middle, bottom]
   */
  getVisibleSymbols(): number[] {
    // Visible symbols are at slot indices 1, 2, 3 (slot 0 is buffer above, slot 4 is buffer below)
    // After wraps during spin, the slots array is rotated, but indices 1-3 always hold visible rows
    const visible: number[] = []
    for (let row = 0; row < VISIBLE_ROWS; row++) {
      const slotIndex = row + 1  // Slots 1, 2, 3 are visible
      visible.push(this.slots[slotIndex]?.symbolId ?? -1)
    }
    return visible
  }

  /**
   * Get the Sprite for a visible row (for win animations)
   * Row order: row=0 is TOP, row=1 is MIDDLE, row=2 is BOTTOM
   * @returns Sprite or null if row is out of bounds
   */
  getSpriteForRow(row: number): Sprite | null {
    if (row < 0 || row >= VISIBLE_ROWS) return null
    const slotIndex = row + 1  // Slots 1, 2, 3 are visible
    return this.slots[slotIndex]?.sprite ?? null
  }

  /**
   * Reset sprite scale to 1 (used after win animations)
   */
  resetSpriteScale(row: number): void {
    const sprite = this.getSpriteForRow(row)
    if (sprite) {
      this.applySpriteScale(sprite)
    }
  }

  /**
   * Reset all visible sprites to normal scale
   */
  resetAllSpriteScales(): void {
    for (let row = 0; row < VISIBLE_ROWS; row++) {
      this.resetSpriteScale(row)
    }
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
