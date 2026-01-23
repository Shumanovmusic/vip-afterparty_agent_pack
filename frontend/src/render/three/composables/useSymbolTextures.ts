/**
 * useSymbolTextures - Composable for loading and caching symbol textures for 3D reels
 * Converts existing Pixi atlas textures to Three.js compatible textures
 */
import { ref } from 'vue'
import * as THREE from 'three'

// Symbol IDs (matches existing game)
export const SYMBOL_IDS = [
  'low_1', 'low_2', 'low_3', 'low_4',     // 0-3: Low pay symbols
  'mid_1', 'mid_2',                        // 4-5: Mid pay symbols
  'diamond', 'seven',                      // 6-7: High pay symbols
  'wild', 'scatter',                       // 8-9: Special symbols
  'bonus', 'multiplier'                    // 10-11: Feature symbols
]

// Symbol colors for fallback/procedural generation
const SYMBOL_COLORS: Record<string, number> = {
  low_1: 0x4a90d9,    // Blue
  low_2: 0x7ed321,    // Green
  low_3: 0xf5a623,    // Orange
  low_4: 0xbd10e0,    // Purple
  mid_1: 0x50e3c2,    // Teal
  mid_2: 0xff6b9d,    // Pink
  diamond: 0x00d4ff,  // Cyan
  seven: 0xff4136,    // Red
  wild: 0xffd700,     // Gold
  scatter: 0x9d4edd,  // Purple
  bonus: 0xff851b,    // Orange
  multiplier: 0x2ecc40 // Green
}

export interface SymbolTextureMap {
  [key: number]: THREE.Texture
}

// Singleton texture cache - shared across all instances
let cachedTextures: SymbolTextureMap | null = null

export function useSymbolTextures() {
  const textures = ref<SymbolTextureMap>({})
  const isLoaded = ref(false)
  const loadError = ref<string | null>(null)

  /**
   * Generate a procedural symbol texture (fallback)
   * Creates a canvas-based texture with symbol identifier
   */
  function generateProceduralTexture(symbolId: number): THREE.Texture {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size

    const ctx = canvas.getContext('2d')!

    // Background gradient
    const symbolName = SYMBOL_IDS[symbolId] || `sym_${symbolId}`
    const color = SYMBOL_COLORS[symbolName] || 0x888888

    // Convert hex to RGB
    const r = (color >> 16) & 0xff
    const g = (color >> 8) & 0xff
    const b = color & 0xff

    // Create gradient background
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2
    )
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`)
    gradient.addColorStop(0.7, `rgba(${Math.floor(r * 0.6)}, ${Math.floor(g * 0.6)}, ${Math.floor(b * 0.6)}, 1)`)
    gradient.addColorStop(1, `rgba(${Math.floor(r * 0.3)}, ${Math.floor(g * 0.3)}, ${Math.floor(b * 0.3)}, 1)`)

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)

    // Add border
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.8)`
    ctx.lineWidth = 8
    ctx.strokeRect(8, 8, size - 16, size - 16)

    // Add symbol label
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 48px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Add text shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 2

    // Draw symbol name or number
    const label = symbolName.toUpperCase().replace('_', '\n')
    const lines = label.split('\n')
    const lineHeight = 52
    const startY = size / 2 - (lines.length - 1) * lineHeight / 2

    lines.forEach((line, i) => {
      ctx.fillText(line, size / 2, startY + i * lineHeight)
    })

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    texture.colorSpace = THREE.SRGBColorSpace

    return texture
  }

  /**
   * Load all symbol textures (synchronous since procedural generation is sync)
   */
  function loadAllTextures(): void {
    // Use cached textures if available
    if (cachedTextures) {
      textures.value = cachedTextures
      isLoaded.value = true
      return
    }

    try {
      const newTextures: SymbolTextureMap = {}

      for (let i = 0; i < SYMBOL_IDS.length; i++) {
        newTextures[i] = generateProceduralTexture(i)
      }

      cachedTextures = newTextures
      textures.value = newTextures
      isLoaded.value = true

      if (import.meta.env.DEV) {
        console.log(`[useSymbolTextures] Loaded ${Object.keys(textures.value).length} textures`)
      }
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : 'Failed to load textures'
      console.error('[useSymbolTextures] Load error:', error)
    }
  }

  /**
   * Get texture for a symbol ID
   */
  function getTexture(symbolId: number): THREE.Texture | undefined {
    return textures.value[symbolId]
  }

  /**
   * Dispose all textures
   */
  function dispose(): void {
    for (const texture of Object.values(textures.value)) {
      texture.dispose()
    }
    textures.value = {}
    isLoaded.value = false
    cachedTextures = null
  }

  // Load textures immediately (synchronous)
  loadAllTextures()

  return {
    textures,
    isLoaded,
    loadError,
    getTexture,
    loadAllTextures,
    dispose
  }
}
