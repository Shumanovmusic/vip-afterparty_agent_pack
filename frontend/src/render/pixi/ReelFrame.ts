/**
 * ReelFrame - VIP decorative frame around the reels grid
 * Deep purple outer bevel with gold inner stroke
 * Sits behind reels, above background
 */

import { Container, Graphics } from 'pixi.js'
import { MotionPrefs } from '../../ux/MotionPrefs'

export interface ReelFrameConfig {
  gridWidth: number
  gridHeight: number
  offsetX: number
  offsetY: number
}

// VIP color palette
const VIP_PURPLE_OUTER = 0x1a0a2e
const VIP_PURPLE_INNER = 0x2a0b3f
const VIP_GOLD = 0xf6c85f
const VIP_RAGE_RED = 0xe74c3c

const FRAME_PADDING = 12
const GOLD_STROKE_WIDTH = 3
const CORNER_CIRCLE_RADIUS = 6

export class ReelFrame {
  public readonly container: Container
  private frameGraphics: Graphics
  private config: ReelFrameConfig | null = null
  private rageModeActive = false
  private motionPrefsUnsubscribe: (() => void) | null = null

  constructor() {
    this.container = new Container()
    this.container.label = 'ReelFrame'
    this.container.eventMode = 'none' // No hit testing

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

    g.clear()

    const accentColor = this.rageModeActive ? VIP_RAGE_RED : VIP_GOLD
    const shouldGlow = !MotionPrefs.turboEnabled && !MotionPrefs.reduceMotion

    // Frame bounds (expanded from grid)
    const frameX = offsetX - FRAME_PADDING
    const frameY = offsetY - FRAME_PADDING
    const frameW = gridWidth + FRAME_PADDING * 2
    const frameH = gridHeight + FRAME_PADDING * 2

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
  }

  destroy(): void {
    // Unsubscribe from MotionPrefs
    if (this.motionPrefsUnsubscribe) {
      this.motionPrefsUnsubscribe()
      this.motionPrefsUnsubscribe = null
    }

    this.frameGraphics.destroy()
    this.container.destroy({ children: true })
  }
}
