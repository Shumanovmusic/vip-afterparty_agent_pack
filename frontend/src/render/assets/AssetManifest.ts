/**
 * Asset Manifest - defines all asset keys and atlas configuration
 * Source of truth for symbol and UI texture keys
 */

/** Symbol texture keys (sym_0 through sym_9) */
export const SYMBOL_KEYS = [
  'sym_0',  // Low/empty
  'sym_1',  // Red (high)
  'sym_2',  // Blue
  'sym_3',  // Green
  'sym_4',  // Orange
  'sym_5',  // Purple
  'sym_6',  // Teal
  'sym_7',  // Pink (scatter)
  'sym_8',  // Gold (wild)
  'sym_9',  // Cyan
] as const

export type SymbolKey = typeof SYMBOL_KEYS[number]

/** UI texture keys */
export const UI_KEYS = [
  'ui_spin',
  'ui_spin_pressed',
  'ui_turbo',
  'ui_turbo_active',
  'ui_bet_minus',
  'ui_bet_plus',
] as const

export type UIKey = typeof UI_KEYS[number]

/** All texture keys */
export type TextureKey = SymbolKey | UIKey

/** Atlas configuration */
export const ATLAS_CONFIG = {
  /** Atlas JSON manifest path */
  jsonPath: '/assets/atlas/game.atlas.json',
  /** Atlas PNG image path */
  imagePath: '/assets/atlas/game.atlas.png',
  /** Cache version for busting */
  version: '1.0.0',
  /** Frame size in atlas */
  frameSize: 128,
  /** Total atlas size */
  atlasSize: 512,
} as const

/**
 * Get symbol key from symbol ID (0-9)
 */
export function getSymbolKey(symbolId: number): SymbolKey {
  const clampedId = Math.max(0, Math.min(9, Math.floor(symbolId)))
  return SYMBOL_KEYS[clampedId]
}

/**
 * Check if a key is a valid texture key
 */
export function isValidTextureKey(key: string): key is TextureKey {
  return (SYMBOL_KEYS as readonly string[]).includes(key) ||
         (UI_KEYS as readonly string[]).includes(key)
}

/**
 * Fallback colors for symbols (used when texture missing)
 * Matches SYMBOL_COLORS in ReelsView.vue
 */
export const SYMBOL_FALLBACK_COLORS: Record<SymbolKey, number> = {
  sym_0: 0x666666,
  sym_1: 0xe74c3c,
  sym_2: 0x3498db,
  sym_3: 0x2ecc71,
  sym_4: 0xf39c12,
  sym_5: 0x9b59b6,
  sym_6: 0x1abc9c,
  sym_7: 0xe91e63,
  sym_8: 0xffd700,
  sym_9: 0x00bcd4,
}

/**
 * Fallback colors for UI elements
 */
export const UI_FALLBACK_COLORS: Record<UIKey, number> = {
  ui_spin: 0x4CAF50,
  ui_spin_pressed: 0x388E3C,
  ui_turbo: 0x2196F3,
  ui_turbo_active: 0xFFC107,
  ui_bet_minus: 0xF44336,
  ui_bet_plus: 0x4CAF50,
}

/**
 * Get fallback color for any texture key
 */
export function getFallbackColor(key: TextureKey): number {
  if (key.startsWith('sym_')) {
    return SYMBOL_FALLBACK_COLORS[key as SymbolKey] ?? 0x666666
  }
  return UI_FALLBACK_COLORS[key as UIKey] ?? 0x888888
}
