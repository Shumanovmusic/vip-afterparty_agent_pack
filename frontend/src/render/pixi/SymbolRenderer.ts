/**
 * SymbolRenderer - Generates VIP-themed symbol textures programmatically
 * Follows FallbackSprite.ts pattern for RenderTexture generation
 */

import { Graphics, Container, Text, TextStyle, RenderTexture, Texture, type Application } from 'pixi.js'
import { type SymbolKey, ATLAS_CONFIG } from '../assets/AssetManifest'
import { MotionPrefs } from '../../ux/MotionPrefs'

export interface SymbolRenderOptions {
  reduceMotion: boolean
  turbo: boolean
}

type CacheKey = `${string}|${boolean}|${boolean}`

// VIP color palette
const VIP_GOLD = 0xf6c85f
const VIP_GOLD_DARK = 0xd4a84b
const VIP_PURPLE_DARK = 0x2a0b3f
const VIP_MAGENTA = 0xff2daa

// Additional colors for VIP Symbol Pack v1
const NEON_BLUE = 0x00d4ff      // Card ranks accent
const NEON_GREEN = 0x00ff88     // Card ranks accent
const DIAMOND_CYAN = 0x00e5ff   // Diamond gem
const CHAMPAGNE_GOLD = 0xffe89f // Champagne bubbles

class SymbolRendererImpl {
  private textureCache: Map<CacheKey, Texture> = new Map()
  private pixiApp: Application | null = null
  private _textureHits = 0

  get isReady(): boolean {
    return this.pixiApp !== null
  }

  get textureHits(): number {
    return this._textureHits
  }

  setPixiApp(app: Application): void {
    this.pixiApp = app
  }

  getTexture(symbolKey: SymbolKey, opts?: SymbolRenderOptions): Texture {
    const options = opts ?? {
      reduceMotion: MotionPrefs.reduceMotion,
      turbo: MotionPrefs.turboEnabled
    }

    const cacheKey: CacheKey = `${symbolKey}|${options.reduceMotion}|${options.turbo}`

    const cached = this.textureCache.get(cacheKey)
    if (cached) {
      this._textureHits++
      return cached
    }

    if (!this.pixiApp) {
      return Texture.WHITE
    }

    const texture = this.generateTexture(symbolKey, options)
    this.textureCache.set(cacheKey, texture)
    this._textureHits++
    return texture
  }

  private generateTexture(key: SymbolKey, opts: SymbolRenderOptions): Texture {
    const id = parseInt(key.replace('sym_', ''), 10)

    if (id <= 4) return this.generateLowSymbol(id, key, opts)
    if (id <= 7) return this.generateHighSymbol(id, key, opts)
    if (id === 8) return this.generateWild(opts)
    return this.generateScatter(opts)
  }

  // ==========================================================================
  // VIP Symbol Pack v1 - Helper Drawing Functions
  // ==========================================================================

  /** Draw a crown silhouette (VIP premium symbol) */
  private drawCrown(g: Graphics, size: number, shouldGlow: boolean): void {
    const cx = size / 2
    const baseY = size * 0.7      // Crown bottom
    const topY = size * 0.2       // Crown top (spikes)
    const bandH = size * 0.15     // Base band height

    // Glow
    if (shouldGlow) {
      g.roundRect(8, 8, size - 16, size - 16, 16)
      g.fill({ color: VIP_GOLD, alpha: 0.25 })
    }

    // Base band (rounded rect)
    g.roundRect(size * 0.15, baseY, size * 0.7, bandH, 4)
    g.fill({ color: VIP_GOLD })

    // Three spikes
    const spikeW = size * 0.15
    const spikePositions = [0.25, 0.5, 0.75] // Left, center, right
    for (const xPos of spikePositions) {
      const sx = size * xPos
      g.moveTo(sx - spikeW / 2, baseY)
      g.lineTo(sx, topY + (xPos === 0.5 ? 0 : size * 0.05))
      g.lineTo(sx + spikeW / 2, baseY)
      g.closePath()
      g.fill({ color: VIP_GOLD })

      // Tip circle
      g.circle(sx, topY + (xPos === 0.5 ? 0 : size * 0.05), 5)
      g.fill({ color: 0xffffff })
    }

    // Center gem
    const gemY = baseY - size * 0.08
    g.moveTo(cx, gemY - 12)
    g.lineTo(cx + 10, gemY)
    g.lineTo(cx, gemY + 8)
    g.lineTo(cx - 10, gemY)
    g.closePath()
    g.fill({ color: VIP_MAGENTA })

    // Gold stroke outline on base band
    g.roundRect(size * 0.15, baseY, size * 0.7, bandH, 4)
    g.stroke({ width: 2, color: VIP_GOLD_DARK })
  }

  /** Draw a diamond gem silhouette */
  private drawDiamond(g: Graphics, size: number, shouldGlow: boolean): void {
    const cx = size / 2, cy = size / 2
    const w = size * 0.55, h = size * 0.7

    // Glow
    if (shouldGlow) {
      g.roundRect(8, 8, size - 16, size - 16, 16)
      g.fill({ color: DIAMOND_CYAN, alpha: 0.2 })
    }

    // Main diamond shape (hexagonal gem)
    g.moveTo(cx, cy - h / 2)           // Top
    g.lineTo(cx + w / 2, cy - h / 4)   // Top-right
    g.lineTo(cx + w / 2, cy + h / 4)   // Bottom-right
    g.lineTo(cx, cy + h / 2)           // Bottom
    g.lineTo(cx - w / 2, cy + h / 4)   // Bottom-left
    g.lineTo(cx - w / 2, cy - h / 4)   // Top-left
    g.closePath()
    g.fill({ color: DIAMOND_CYAN })

    // Facet lines
    g.moveTo(cx - w / 2, cy - h / 4)
    g.lineTo(cx, cy)
    g.lineTo(cx + w / 2, cy - h / 4)
    g.stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 })

    // Top highlight facet
    g.moveTo(cx, cy - h / 2)
    g.lineTo(cx + w / 4, cy - h / 4)
    g.lineTo(cx, cy - h / 6)
    g.lineTo(cx - w / 4, cy - h / 4)
    g.closePath()
    g.fill({ color: 0xffffff, alpha: 0.4 })

    // Cyan stroke outline
    g.moveTo(cx, cy - h / 2)
    g.lineTo(cx + w / 2, cy - h / 4)
    g.lineTo(cx + w / 2, cy + h / 4)
    g.lineTo(cx, cy + h / 2)
    g.lineTo(cx - w / 2, cy + h / 4)
    g.lineTo(cx - w / 2, cy - h / 4)
    g.closePath()
    g.stroke({ width: 2, color: DIAMOND_CYAN })
  }

  /** Draw a champagne glass */
  private drawChampagne(g: Graphics, size: number, shouldGlow: boolean): void {
    const cx = size / 2

    // Glow
    if (shouldGlow) {
      g.roundRect(8, 8, size - 16, size - 16, 16)
      g.fill({ color: CHAMPAGNE_GOLD, alpha: 0.2 })
    }

    // Glass bowl (ellipse top)
    g.ellipse(cx, size * 0.35, size * 0.25, size * 0.18)
    g.fill({ color: CHAMPAGNE_GOLD })

    // Stem
    g.rect(cx - 4, size * 0.5, 8, size * 0.25)
    g.fill({ color: CHAMPAGNE_GOLD })

    // Base
    g.ellipse(cx, size * 0.78, size * 0.18, size * 0.06)
    g.fill({ color: CHAMPAGNE_GOLD })

    // Highlight on bowl
    g.ellipse(cx - 8, size * 0.32, 6, 10)
    g.fill({ color: 0xffffff, alpha: 0.5 })

    // Bubbles (if motion allowed)
    if (shouldGlow) {
      const bubbles: [number, number][] = [[cx - 6, 0.28], [cx + 4, 0.25], [cx, 0.32]]
      for (const [bx, by] of bubbles) {
        g.circle(bx, size * by, 3)
        g.fill({ color: 0xffffff, alpha: 0.7 })
      }
    }

    // Gold stroke on bowl
    g.ellipse(cx, size * 0.35, size * 0.25, size * 0.18)
    g.stroke({ width: 2, color: VIP_GOLD })
  }

  /** Draw a neon card rank (A, K, Q, J, 10) */
  private drawRankCard(
    g: Graphics,
    size: number,
    colors: { primary: number; accent: number },
    shouldGlow: boolean
  ): void {
    const padding = 10

    // Glow
    if (shouldGlow) {
      g.roundRect(4, 4, size - 8, size - 8, 14)
      g.fill({ color: colors.accent, alpha: 0.2 })
    }

    // Card panel
    g.roundRect(padding, padding, size - padding * 2, size - padding * 2, 10)
    g.fill({ color: colors.primary })

    // Inner highlight (top half)
    g.roundRect(padding + 4, padding + 4, size - padding * 2 - 8, (size - padding * 2) / 2 - 4, 6)
    g.fill({ color: 0xffffff, alpha: 0.15 })

    // Neon border
    g.roundRect(padding, padding, size - padding * 2, size - padding * 2, 10)
    g.stroke({ width: 3, color: colors.accent })

    // Corner sparkles (small stars)
    const sparkleOffset = 22
    const sparklePositions: [number, number][] = [
      [padding + sparkleOffset, padding + sparkleOffset],
      [size - padding - sparkleOffset, size - padding - sparkleOffset]
    ]
    for (const [sx, sy] of sparklePositions) {
      g.star(sx, sy, 4, 5, 2.5)
      g.fill({ color: colors.accent, alpha: 0.8 })
    }
  }

  // ==========================================================================
  // Symbol Generation Methods
  // ==========================================================================

  /**
   * Generate card rank symbols (A, K, Q, J, 10) - neon card style
   */
  private generateLowSymbol(id: number, _key: SymbolKey, opts: SymbolRenderOptions): Texture {
    const size = ATLAS_CONFIG.frameSize
    const container = new Container()
    const shouldGlow = !opts.turbo && !opts.reduceMotion
    const g = new Graphics()

    // Card rank mapping
    const RANKS = ['A', 'K', 'Q', 'J', '10']
    const RANK_COLORS: { primary: number; accent: number }[] = [
      { primary: 0x1a1a2e, accent: NEON_BLUE },     // A - cyan
      { primary: 0x1a1a2e, accent: VIP_MAGENTA },   // K - magenta
      { primary: 0x1a1a2e, accent: NEON_GREEN },    // Q - green
      { primary: 0x1a1a2e, accent: VIP_GOLD },      // J - gold
      { primary: 0x1a1a2e, accent: 0xff6b6b },      // 10 - coral
    ]

    const rank = RANKS[id] ?? 'X'
    const colors = RANK_COLORS[id] ?? RANK_COLORS[0]

    this.drawRankCard(g, size, colors, shouldGlow)
    container.addChild(g)

    // Large rank letter
    const text = this.createLabel(rank, size, colors.accent, true, 36)
    container.addChild(text)

    return this.renderToTexture(container, size)
  }

  /**
   * Generate VIP high symbols: Crown (H1=5), Diamond (H2=6), Champagne (H3=7)
   */
  private generateHighSymbol(id: number, _key: SymbolKey, opts: SymbolRenderOptions): Texture {
    const size = ATLAS_CONFIG.frameSize
    const container = new Container()
    const shouldGlow = !opts.turbo && !opts.reduceMotion
    const g = new Graphics()

    // H1=5: Crown, H2=6: Diamond, H3=7: Champagne
    if (id === 5) {
      this.drawCrown(g, size, shouldGlow)
    } else if (id === 6) {
      this.drawDiamond(g, size, shouldGlow)
    } else {
      this.drawChampagne(g, size, shouldGlow)
    }

    container.addChild(g)
    return this.renderToTexture(container, size)
  }

  /**
   * Generate Wild symbol - enhanced gold ticket with "WILD" text
   */
  private generateWild(opts: SymbolRenderOptions): Texture {
    const size = ATLAS_CONFIG.frameSize
    const container = new Container()
    const shouldGlow = !opts.turbo && !opts.reduceMotion

    const g = new Graphics()

    // Outer glow
    if (shouldGlow) {
      g.roundRect(2, 2, size - 4, size - 4, 18)
      g.fill({ color: VIP_GOLD, alpha: 0.35 })
    }

    // Ticket shape with notched sides
    g.roundRect(8, 12, size - 16, size - 24, 10)
    g.fill({ color: VIP_GOLD })

    // Inner gradient highlight
    g.roundRect(12, 16, size - 24, (size - 32) / 2, 6)
    g.fill({ color: 0xffeebb, alpha: 0.6 })

    // Side notches (ticket style)
    g.circle(8, size / 2, 6)
    g.fill({ color: VIP_PURPLE_DARK })
    g.circle(size - 8, size / 2, 6)
    g.fill({ color: VIP_PURPLE_DARK })

    // Gold border
    g.roundRect(8, 12, size - 16, size - 24, 10)
    g.stroke({ width: 3, color: VIP_GOLD_DARK })

    // Sparkle dots at corners (if motion allowed)
    if (shouldGlow) {
      g.star(24, 28, 4, 5, 2.5)
      g.fill({ color: 0xffffff })
      g.star(size - 24, 28, 4, 5, 2.5)
      g.fill({ color: 0xffffff })
      g.star(24, size - 28, 4, 5, 2.5)
      g.fill({ color: 0xffffff })
      g.star(size - 24, size - 28, 4, 5, 2.5)
      g.fill({ color: 0xffffff })
    }

    container.addChild(g)

    // "WILD" text
    const text = this.createLabel('WILD', size, VIP_PURPLE_DARK, true, 26)
    container.addChild(text)

    return this.renderToTexture(container, size)
  }

  /**
   * Generate Scatter symbol - enhanced starburst with "FREE" text
   */
  private generateScatter(opts: SymbolRenderOptions): Texture {
    const size = ATLAS_CONFIG.frameSize
    const container = new Container()
    const shouldSparkle = !opts.turbo && !opts.reduceMotion
    const g = new Graphics()

    const cx = size / 2, cy = size / 2

    // Outer glow
    if (shouldSparkle) {
      g.roundRect(2, 2, size - 4, size - 4, 18)
      g.fill({ color: VIP_MAGENTA, alpha: 0.35 })
    }

    // Starburst background (8-pointed star)
    g.star(cx, cy, 8, size * 0.42, size * 0.25)
    g.fill({ color: VIP_MAGENTA })

    // Inner highlight (smaller 8-pointed star)
    g.star(cx, cy - 4, 8, size * 0.28, size * 0.16)
    g.fill({ color: 0xff6dca, alpha: 0.5 })

    // White sparkle border
    g.star(cx, cy, 8, size * 0.42, size * 0.25)
    g.stroke({ width: 2, color: 0xffffff, alpha: 0.9 })

    // Corner sparkles (if motion allowed)
    if (shouldSparkle) {
      const sparkles: [number, number][] = [[20, 20], [size - 20, 20], [20, size - 20], [size - 20, size - 20]]
      for (const [sx, sy] of sparkles) {
        g.star(sx, sy, 4, 6, 3)
        g.fill({ color: 0xffffff, alpha: 0.9 })
      }
    }

    container.addChild(g)

    // "FREE" text (scatter triggers free spins)
    const text = this.createLabel('FREE', size, 0xffffff, true, 22)
    container.addChild(text)

    return this.renderToTexture(container, size)
  }

  /**
   * Create centered label text with customizable font size
   */
  private createLabel(
    label: string,
    size: number,
    color: number,
    bold = false,
    fontSize = 24
  ): Text {
    const style = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: fontSize,
      fontWeight: bold ? 'bold' : 'normal',
      fill: color,
      stroke: { color: 0x000000, width: 3 },
      dropShadow: {
        color: 0x000000,
        blur: 4,
        distance: 2,
        alpha: 0.6,
      },
    })

    const text = new Text({ text: label, style })
    text.anchor.set(0.5)
    text.x = size / 2
    text.y = size / 2
    return text
  }

  /**
   * Render container to RenderTexture
   */
  private renderToTexture(container: Container, size: number): Texture {
    if (!this.pixiApp) {
      container.destroy({ children: true })
      return Texture.WHITE
    }

    const renderTexture = RenderTexture.create({
      width: size,
      height: size,
      resolution: 1,
    })

    this.pixiApp.renderer.render({
      container,
      target: renderTexture,
    })

    container.destroy({ children: true })
    return renderTexture
  }

  clearCache(): void {
    for (const texture of this.textureCache.values()) {
      texture.destroy(true)
    }
    this.textureCache.clear()
    this._textureHits = 0
  }
}

export const SymbolRenderer = new SymbolRendererImpl()
