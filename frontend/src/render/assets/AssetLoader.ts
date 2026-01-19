/**
 * Asset Loader - Pixi v8 Assets.load() wrapper with versioned cache
 * Loads atlas and provides textures with fallback support
 */

import { Assets, Texture, Spritesheet, type UnresolvedAsset } from 'pixi.js'
import {
  ATLAS_CONFIG,
  type TextureKey,
  isValidTextureKey,
  getSymbolKey,
} from './AssetManifest'
import { createFallbackTexture } from './FallbackSprite'

/** Asset loading state */
type LoadState = 'idle' | 'loading' | 'loaded' | 'error'

/** Asset loader singleton */
class AssetLoaderImpl {
  private state: LoadState = 'idle'
  private spritesheet: Spritesheet | null = null
  private textureCache: Map<string, Texture> = new Map()
  private loadPromise: Promise<void> | null = null
  private loadError: Error | null = null

  /** Check if assets are loaded */
  get isLoaded(): boolean {
    return this.state === 'loaded'
  }

  /** Check if loading is in progress */
  get isLoading(): boolean {
    return this.state === 'loading'
  }

  /** Get any load error */
  get error(): Error | null {
    return this.loadError
  }

  /**
   * Initialize and load the atlas
   * Returns immediately if already loaded or loading
   */
  async init(): Promise<void> {
    if (this.state === 'loaded') {
      return
    }

    if (this.loadPromise) {
      return this.loadPromise
    }

    this.state = 'loading'
    this.loadPromise = this.loadAtlas()

    try {
      await this.loadPromise
      this.state = 'loaded'
    } catch (error) {
      this.state = 'error'
      this.loadError = error instanceof Error ? error : new Error(String(error))
      console.error('[AssetLoader] Failed to load atlas:', this.loadError)
    }
  }

  /**
   * Load the atlas spritesheet
   */
  private async loadAtlas(): Promise<void> {
    const { jsonPath, version } = ATLAS_CONFIG
    const cacheKey = `game-atlas-v${version}`

    // Check if already in Assets cache
    const cached = Assets.cache.get(cacheKey)
    if (cached && cached instanceof Spritesheet) {
      this.spritesheet = cached
      return
    }

    // Add to Assets resolver
    const assetConfig: UnresolvedAsset = {
      alias: cacheKey,
      src: jsonPath,
    }

    Assets.add(assetConfig)

    // Load the spritesheet
    const sheet = await Assets.load<Spritesheet>(cacheKey)
    this.spritesheet = sheet
  }

  /**
   * Get texture for a key
   * Returns fallback texture if not found
   */
  getTexture(key: TextureKey): Texture {
    // Check local cache first
    const cached = this.textureCache.get(key)
    if (cached) {
      return cached
    }

    // Try to get from spritesheet
    if (this.spritesheet) {
      const texture = this.spritesheet.textures[key]
      if (texture) {
        this.textureCache.set(key, texture)
        return texture
      }
    }

    // Log warning and return fallback
    if (this.state === 'loaded') {
      console.warn(`[AssetLoader] Missing texture: ${key}, using fallback`)
    }

    const fallback = createFallbackTexture(key)
    this.textureCache.set(key, fallback)
    return fallback
  }

  /**
   * Get texture for a symbol ID (0-9)
   * Convenience method that maps ID to key
   */
  getSymbolTexture(symbolId: number): Texture {
    const key = getSymbolKey(symbolId)
    return this.getTexture(key)
  }

  /**
   * Check if a specific texture exists
   */
  hasTexture(key: string): boolean {
    if (!isValidTextureKey(key)) {
      return false
    }

    if (this.spritesheet) {
      return key in this.spritesheet.textures
    }

    return false
  }

  /**
   * Get all loaded texture keys
   */
  getLoadedKeys(): string[] {
    if (!this.spritesheet) {
      return []
    }
    return Object.keys(this.spritesheet.textures)
  }

  /**
   * Clear texture cache (useful for hot reload)
   */
  clearCache(): void {
    this.textureCache.clear()
  }

  /**
   * Reset loader state (for testing)
   */
  reset(): void {
    this.state = 'idle'
    this.spritesheet = null
    this.textureCache.clear()
    this.loadPromise = null
    this.loadError = null
  }
}

/** Singleton instance */
export const AssetLoader = new AssetLoaderImpl()
