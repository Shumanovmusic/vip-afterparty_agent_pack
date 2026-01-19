/**
 * FallbackSprite - Creates fallback textures for missing assets
 * Graphics rect + text label on missing texture
 */

import { Graphics, Container, Text, TextStyle, RenderTexture, Texture, type Application } from 'pixi.js'
import {
  type TextureKey,
  getFallbackColor,
  ATLAS_CONFIG,
} from './AssetManifest'

/** Reference to Pixi app for texture generation */
let pixiApp: Application | null = null

/** Cache for generated fallback textures */
const fallbackTextureCache: Map<string, Texture> = new Map()

/**
 * Set the Pixi application reference
 * Required for generating RenderTextures
 */
export function setPixiApp(app: Application): void {
  pixiApp = app
}

/**
 * Create a fallback texture for a missing asset
 * Returns a colored rect with the key label
 */
export function createFallbackTexture(key: TextureKey): Texture {
  // Check cache first
  const cached = fallbackTextureCache.get(key)
  if (cached) {
    return cached
  }

  // If no app available, create a simple texture
  if (!pixiApp) {
    console.warn('[FallbackSprite] No Pixi app set, using white texture')
    return Texture.WHITE
  }

  const size = ATLAS_CONFIG.frameSize
  const color = getFallbackColor(key)

  // Create container with graphics and text
  const container = new Container()

  // Background rect
  const bg = new Graphics()
  bg.roundRect(2, 2, size - 4, size - 4, 8)
  bg.fill({ color })
  bg.stroke({ width: 2, color: 0xffffff, alpha: 0.3 })
  container.addChild(bg)

  // Label text
  const label = key.replace('sym_', '').replace('ui_', '')
  const style = new TextStyle({
    fontFamily: 'Arial',
    fontSize: 24,
    fontWeight: 'bold',
    fill: 0xffffff,
    dropShadow: {
      color: 0x000000,
      blur: 2,
      distance: 1,
    },
  })

  const text = new Text({ text: label, style })
  text.anchor.set(0.5)
  text.x = size / 2
  text.y = size / 2
  container.addChild(text)

  // Render to texture
  const renderTexture = RenderTexture.create({
    width: size,
    height: size,
    resolution: 1,
  })

  pixiApp.renderer.render({
    container,
    target: renderTexture,
  })

  // Clean up container (texture is now independent)
  container.destroy({ children: true })

  // Cache and return
  fallbackTextureCache.set(key, renderTexture)
  return renderTexture
}

/**
 * Create a fallback container (for direct use, not as texture)
 * Useful for Vue components that need a displayable fallback
 */
export function createFallbackContainer(
  key: TextureKey,
  width: number = ATLAS_CONFIG.frameSize,
  height: number = ATLAS_CONFIG.frameSize
): Container {
  const color = getFallbackColor(key)

  const container = new Container()

  // Background rect
  const bg = new Graphics()
  bg.roundRect(2, 2, width - 4, height - 4, 8)
  bg.fill({ color })
  bg.stroke({ width: 2, color: 0xffffff, alpha: 0.3 })
  container.addChild(bg)

  // Label text
  const label = key.replace('sym_', '').replace('ui_', '')
  const fontSize = Math.min(width, height) / 4

  const style = new TextStyle({
    fontFamily: 'Arial',
    fontSize,
    fontWeight: 'bold',
    fill: 0xffffff,
    dropShadow: {
      color: 0x000000,
      blur: 2,
      distance: 1,
    },
  })

  const text = new Text({ text: label, style })
  text.anchor.set(0.5)
  text.x = width / 2
  text.y = height / 2
  container.addChild(text)

  return container
}

/**
 * Clear the fallback texture cache
 */
export function clearFallbackCache(): void {
  for (const texture of fallbackTextureCache.values()) {
    texture.destroy(true)
  }
  fallbackTextureCache.clear()
}

/**
 * Get the hex color string for a texture key
 * Useful for CSS fallbacks
 */
export function getFallbackColorHex(key: TextureKey): string {
  const color = getFallbackColor(key)
  return '#' + color.toString(16).padStart(6, '0')
}
