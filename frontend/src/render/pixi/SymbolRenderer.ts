/**
 * SymbolRenderer - Generates VIP-themed symbol textures programmatically
 * Follows FallbackSprite.ts pattern for RenderTexture generation
 */

import { Graphics, Container, Text, TextStyle, RenderTexture, Texture, type Application } from 'pixi.js'
import { type SymbolKey, SYMBOL_FALLBACK_COLORS, ATLAS_CONFIG } from '../assets/AssetManifest'
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
const VIP_PURPLE_LIGHT = 0x4a1b5f
const VIP_MAGENTA = 0xff2daa

// Low symbol color palette (purple/teal family)
const LOW_SYMBOL_COLORS: Record<number, { primary: number; secondary: number }> = {
  0: { primary: 0x6b3fa0, secondary: 0x8b5fc0 }, // L1 deep purple
  1: { primary: 0x4a90a4, secondary: 0x6ab0c4 }, // L2 teal
  2: { primary: 0x5c6bc0, secondary: 0x7c8be0 }, // L3 indigo
  3: { primary: 0x7e57c2, secondary: 0x9e77e2 }, // L4 violet
  4: { primary: 0x26a69a, secondary: 0x46c6ba }, // L5 cyan-teal
}

// High symbol color palette (warmer tones)
const HIGH_SYMBOL_COLORS: Record<number, { primary: number; secondary: number }> = {
  5: { primary: 0xf6c85f, secondary: 0xffe89f }, // H1 gold
  6: { primary: 0xffe6b0, secondary: 0xfff6d0 }, // H2 champagne
  7: { primary: 0xff2daa, secondary: 0xff6dca }, // H3 neon magenta
}

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

  /**
   * Generate L1-L5 low symbols (VIP chip style, purple family)
   */
  private generateLowSymbol(id: number, key: SymbolKey, opts: SymbolRenderOptions): Texture {
    const size = ATLAS_CONFIG.frameSize
    const container = new Container()

    const colors = LOW_SYMBOL_COLORS[id] ?? { primary: SYMBOL_FALLBACK_COLORS[key], secondary: 0xaaaaaa }
    const shouldGlow = !opts.turbo && !opts.reduceMotion

    const g = new Graphics()

    // Outer glow (only if motion allowed)
    if (shouldGlow) {
      g.roundRect(4, 4, size - 8, size - 8, 16)
      g.fill({ color: colors.primary, alpha: 0.3 })
    }

    // Main chip body - rounded rect with gradient effect
    g.roundRect(8, 8, size - 16, size - 16, 12)
    g.fill({ color: colors.primary })

    // Inner highlight (top half for 3D effect)
    g.roundRect(12, 12, size - 24, (size - 24) / 2, 8)
    g.fill({ color: colors.secondary, alpha: 0.4 })

    // Thin neon border (purple family)
    g.roundRect(8, 8, size - 16, size - 16, 12)
    g.stroke({ width: 2, color: VIP_PURPLE_LIGHT })

    container.addChild(g)

    // Label
    const label = `L${id + 1}`
    const text = this.createLabel(label, size, 0xffffff)
    container.addChild(text)

    return this.renderToTexture(container, size)
  }

  /**
   * Generate H1-H3 high symbols (warmer fill, gold stroke)
   */
  private generateHighSymbol(id: number, key: SymbolKey, opts: SymbolRenderOptions): Texture {
    const size = ATLAS_CONFIG.frameSize
    const container = new Container()

    const colors = HIGH_SYMBOL_COLORS[id] ?? { primary: SYMBOL_FALLBACK_COLORS[key], secondary: 0xffffff }
    const shouldGlow = !opts.turbo && !opts.reduceMotion

    const g = new Graphics()

    // Outer glow (only if motion allowed)
    if (shouldGlow) {
      g.roundRect(2, 2, size - 4, size - 4, 18)
      g.fill({ color: VIP_GOLD, alpha: 0.2 })
    }

    // Main chip body
    g.roundRect(8, 8, size - 16, size - 16, 12)
    g.fill({ color: colors.primary })

    // Brighter center highlight
    g.ellipse(size / 2, size / 2 - 8, (size - 32) / 2, (size - 48) / 3)
    g.fill({ color: colors.secondary, alpha: 0.5 })

    // Gold stroke (3px as per spec)
    g.roundRect(8, 8, size - 16, size - 16, 12)
    g.stroke({ width: 3, color: VIP_GOLD })

    container.addChild(g)

    // Label
    const labelNum = id - 4 // H1=5 -> 1, H2=6 -> 2, H3=7 -> 3
    const label = `H${labelNum}`
    const textColor = id === 7 ? 0xffffff : VIP_PURPLE_DARK // White on magenta, dark on gold/champagne
    const text = this.createLabel(label, size, textColor)
    container.addChild(text)

    return this.renderToTexture(container, size)
  }

  /**
   * Generate Wild symbol (gold ticket/badge shape with "WD" label)
   */
  private generateWild(opts: SymbolRenderOptions): Texture {
    const size = ATLAS_CONFIG.frameSize
    const container = new Container()
    const shouldGlow = !opts.turbo && !opts.reduceMotion

    const g = new Graphics()

    // Outer glow
    if (shouldGlow) {
      g.roundRect(2, 2, size - 4, size - 4, 18)
      g.fill({ color: VIP_GOLD, alpha: 0.3 })
    }

    // Ticket/badge shape - main body
    g.roundRect(6, 10, size - 12, size - 20, 8)
    g.fill({ color: VIP_GOLD })

    // Inner gradient highlight
    g.roundRect(10, 14, size - 20, (size - 28) / 2, 6)
    g.fill({ color: 0xffe89f, alpha: 0.6 })

    // Gold border with slight bevel effect
    g.roundRect(6, 10, size - 12, size - 20, 8)
    g.stroke({ width: 3, color: VIP_GOLD_DARK })

    // Decorative notches on sides (ticket style)
    const notchY = size / 2
    g.circle(6, notchY, 4)
    g.fill({ color: VIP_PURPLE_DARK })
    g.circle(size - 6, notchY, 4)
    g.fill({ color: VIP_PURPLE_DARK })

    container.addChild(g)

    // "WD" label
    const text = this.createLabel('WD', size, VIP_PURPLE_DARK, true)
    container.addChild(text)

    return this.renderToTexture(container, size)
  }

  /**
   * Generate Scatter symbol (magenta/pink with sparkles, "SC" label)
   */
  private generateScatter(opts: SymbolRenderOptions): Texture {
    const size = ATLAS_CONFIG.frameSize
    const container = new Container()
    const shouldSparkle = !opts.turbo && !opts.reduceMotion

    const g = new Graphics()

    // Outer glow
    if (shouldSparkle) {
      g.roundRect(2, 2, size - 4, size - 4, 18)
      g.fill({ color: VIP_MAGENTA, alpha: 0.3 })
    }

    // Main body - star/gem shape approximation with rounded rect
    g.roundRect(8, 8, size - 16, size - 16, 14)
    g.fill({ color: VIP_MAGENTA })

    // Inner highlight
    g.ellipse(size / 2, size / 2 - 6, (size - 32) / 2, (size - 44) / 3)
    g.fill({ color: 0xff6dca, alpha: 0.5 })

    // White sparkle border
    g.roundRect(8, 8, size - 16, size - 16, 14)
    g.stroke({ width: 2, color: 0xffffff, alpha: 0.8 })

    // Sparkle decorations (only if motion allowed)
    if (shouldSparkle) {
      const sparklePositions = [
        { x: 20, y: 20 },
        { x: size - 20, y: 20 },
        { x: 20, y: size - 20 },
        { x: size - 20, y: size - 20 },
      ]
      for (const pos of sparklePositions) {
        // Small diamond/star sparkle
        g.star(pos.x, pos.y, 4, 5, 2.5)
        g.fill({ color: 0xffffff, alpha: 0.9 })
      }
    }

    container.addChild(g)

    // "SC" label
    const text = this.createLabel('SC', size, 0xffffff, true)
    container.addChild(text)

    return this.renderToTexture(container, size)
  }

  /**
   * Create centered label text
   */
  private createLabel(label: string, size: number, color: number, bold = false): Text {
    const style = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: bold ? 28 : 24,
      fontWeight: bold ? 'bold' : 'normal',
      fill: color,
      dropShadow: {
        color: 0x000000,
        blur: 3,
        distance: 1,
        alpha: 0.5,
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
