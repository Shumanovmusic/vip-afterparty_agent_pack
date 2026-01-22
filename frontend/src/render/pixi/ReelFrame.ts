/**
 * ReelFrame - VIP decorative frame around the reels grid
 * Deep purple outer bevel with gold inner stroke
 * Sits behind reels, above background
 */

import { Container, Graphics } from 'pixi.js'
import { MotionPrefs } from '../../ux/MotionPrefs'
import { DEBUG_FLAGS } from './DebugFlags'

export interface ReelFrameConfig {
  gridWidth: number
  gridHeight: number
  offsetX: number
  offsetY: number
}

// VIP color palette
const VIP_PURPLE_OUTER = 0x3a1a5e  // Brightened from 0x1a0a2e
const VIP_PURPLE_INNER = 0x4a2b6f  // Brightened from 0x2a0b3f
const VIP_GOLD = 0xf6c85f
const VIP_RAGE_RED = 0xe74c3c

export const REEL_FRAME_PADDING = 12
const GOLD_STROKE_WIDTH = 3
const CORNER_CIRCLE_RADIUS = 6

export class ReelFrame {
  public readonly container: Container
  private frameGraphics: Graphics
  private glowGraphics: Graphics | null = null
  private glowAlpha = 0
  private pulseAnimationId: number | null = null
  private config: ReelFrameConfig | null = null
  private rageModeActive = false
  private motionPrefsUnsubscribe: (() => void) | null = null

  constructor() {
    this.container = new Container()
    this.container.label = 'ReelFrame'
    this.container.eventMode = 'none' // No hit testing

    // Create separate glow layer (drawn once, alpha animated)
    this.glowGraphics = new Graphics()
    this.glowGraphics.label = 'FrameGlow'
    this.glowGraphics.alpha = 0
    this.container.addChild(this.glowGraphics)  // Behind frame

    this.frameGraphics = new Graphics()
    this.frameGraphics.label = 'FrameGraphics'
    this.container.addChild(this.frameGraphics)

    // Subscribe to MotionPrefs changes to redraw frame
    this.motionPrefsUnsubscribe = MotionPrefs.onChange(() => {
      this.draw()
    })
  }

  resize(config: ReelFrameConfig): void {
    this.config = config
    this.draw()
  }

  setRageMode(active: boolean): void {
    if (this.rageModeActive !== active) {
      this.rageModeActive = active
      this.draw()
    }
  }

  private draw(): void {
    if (!this.config) return

    const { gridWidth, gridHeight, offsetX, offsetY } = this.config
    const g = this.frameGraphics

    if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout) {
      console.log('[ReelFrame] draw called:', {
        gridWidth,
        gridHeight,
        offsetX,
        offsetY,
        containerParent: this.container.parent?.label,
      })
    }

    g.clear()

    const accentColor = this.rageModeActive ? VIP_RAGE_RED : VIP_GOLD
    const shouldGlow = !MotionPrefs.turboEnabled && !MotionPrefs.reduceMotion

    // Frame bounds (expanded from grid)
    const frameX = offsetX - REEL_FRAME_PADDING
    const frameY = offsetY - REEL_FRAME_PADDING
    const frameW = gridWidth + REEL_FRAME_PADDING * 2
    const frameH = gridHeight + REEL_FRAME_PADDING * 2

    // Outer glow (only if motion allowed)
    if (shouldGlow) {
      g.roundRect(frameX - 4, frameY - 4, frameW + 8, frameH + 8, 12)
      g.fill({ color: accentColor, alpha: 0.15 })
    }

    // Outer bevel (deep purple)
    g.roundRect(frameX, frameY, frameW, frameH, 8)
    g.fill({ color: VIP_PURPLE_OUTER })

    // Inner area (slightly lighter purple)
    g.roundRect(frameX + 4, frameY + 4, frameW - 8, frameH - 8, 6)
    g.fill({ color: VIP_PURPLE_INNER })

    // Inner shadow (top edge darkening for depth)
    g.rect(frameX + 4, frameY + 4, frameW - 8, 8)
    g.fill({ color: 0x000000, alpha: 0.2 })

    // Gold inner stroke
    g.roundRect(frameX + 4, frameY + 4, frameW - 8, frameH - 8, 6)
    g.stroke({ width: GOLD_STROKE_WIDTH, color: accentColor })

    // Velvet rope corner hints (small circles at corners)
    const corners = [
      { x: frameX + 8, y: frameY + 8 },
      { x: frameX + frameW - 8, y: frameY + 8 },
      { x: frameX + 8, y: frameY + frameH - 8 },
      { x: frameX + frameW - 8, y: frameY + frameH - 8 }
    ]

    for (const corner of corners) {
      g.circle(corner.x, corner.y, CORNER_CIRCLE_RADIUS)
      g.fill({ color: accentColor })
      g.circle(corner.x, corner.y, CORNER_CIRCLE_RADIUS - 2)
      g.fill({ color: VIP_PURPLE_INNER })
    }

    // Redraw glow graphics with updated config
    this.drawGlow()
  }

  /**
   * Pulse the frame glow
   * @param intensity - Peak alpha (0-1), default 0.6
   * @param durationMs - Total duration, default 400ms
   * @param force - If true, bypasses turbo/reduceMotion check (for minimal feedback)
   */
  pulse(intensity = 0.6, durationMs = 400, force = false): void {
    if (!force && (MotionPrefs.turboEnabled || MotionPrefs.reduceMotion)) return
    this.cancelPulse()

    const startTime = performance.now()
    const peakTime = durationMs * 0.25  // Peak at 25%

    const animate = (): void => {
      const elapsed = performance.now() - startTime
      if (elapsed >= durationMs) {
        this.glowAlpha = 0
        this.updateGlowAlpha()
        this.pulseAnimationId = null
        return
      }

      if (elapsed < peakTime) {
        this.glowAlpha = intensity * (elapsed / peakTime)
      } else {
        const decay = (elapsed - peakTime) / (durationMs - peakTime)
        this.glowAlpha = intensity * (1 - decay * decay)  // Ease-out
      }

      this.updateGlowAlpha()
      this.pulseAnimationId = requestAnimationFrame(animate)
    }

    this.pulseAnimationId = requestAnimationFrame(animate)
  }

  private updateGlowAlpha(): void {
    if (this.glowGraphics) {
      this.glowGraphics.alpha = this.glowAlpha
    }
  }

  private cancelPulse(): void {
    if (this.pulseAnimationId !== null) {
      cancelAnimationFrame(this.pulseAnimationId)
      this.pulseAnimationId = null
    }
    this.glowAlpha = 0
    this.updateGlowAlpha()
  }

  /**
   * Draw glow graphics (called when config changes)
   */
  private drawGlow(): void {
    if (!this.config || !this.glowGraphics) return
    const { gridWidth, gridHeight, offsetX, offsetY } = this.config
    const accentColor = this.rageModeActive ? VIP_RAGE_RED : VIP_GOLD

    const frameX = offsetX - REEL_FRAME_PADDING
    const frameY = offsetY - REEL_FRAME_PADDING
    const frameW = gridWidth + REEL_FRAME_PADDING * 2
    const frameH = gridHeight + REEL_FRAME_PADDING * 2

    const g = this.glowGraphics
    g.clear()

    // Multi-layer glow
    g.roundRect(frameX - 8, frameY - 8, frameW + 16, frameH + 16, 16)
    g.fill({ color: accentColor, alpha: 0.25 })

    g.roundRect(frameX - 4, frameY - 4, frameW + 8, frameH + 8, 12)
    g.fill({ color: accentColor, alpha: 0.4 })
  }

  destroy(): void {
    // Cancel any active pulse
    this.cancelPulse()

    // Unsubscribe from MotionPrefs
    if (this.motionPrefsUnsubscribe) {
      this.motionPrefsUnsubscribe()
      this.motionPrefsUnsubscribe = null
    }

    this.glowGraphics?.destroy()
    this.glowGraphics = null
    this.frameGraphics.destroy()
    this.container.destroy({ children: true })
  }
}

