/**
 * Asset Manifest - defines all asset keys and atlas configuration
 * Source of truth for symbol and UI texture keys
 * See ASSET_SPEC_V1.md for full documentation
 */

/** Symbol IDs (0-9) as used by game engine */
export type SymbolId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/** Human-readable symbol aliases for code clarity */
export type SymbolAlias = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'H1' | 'H2' | 'H3' | 'WD' | 'SC'

/** Symbol texture keys (sym_0 through sym_9) */
export const SYMBOL_KEYS = [
  'sym_0',  // L1: Deep purple chip
  'sym_1',  // L2: Teal chip
  'sym_2',  // L3: Indigo chip
  'sym_3',  // L4: Violet chip
  'sym_4',  // L5: Cyan-teal chip
  'sym_5',  // H1: Gold VIP chip
  'sym_6',  // H2: Champagne chip
  'sym_7',  // H3: Neon magenta chip
  'sym_8',  // WD: WILD gold
  'sym_9',  // SC: SCATTER magenta
] as const

export type SymbolKey = typeof SYMBOL_KEYS[number]

/** Alias to SymbolId mapping */
export const SYMBOL_ALIAS_TO_ID: Record<SymbolAlias, SymbolId> = {
  L1: 0, L2: 1, L3: 2, L4: 3, L5: 4,
  H1: 5, H2: 6, H3: 7,
  WD: 8, SC: 9,
}

/** SymbolId to Alias mapping */
export const SYMBOL_ID_TO_ALIAS: Record<SymbolId, SymbolAlias> = {
  0: 'L1', 1: 'L2', 2: 'L3', 3: 'L4', 4: 'L5',
  5: 'H1', 6: 'H2', 7: 'H3',
  8: 'WD', 9: 'SC',
}

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
 * Get symbol texture key from symbol ID (0-9)
 * Single source of truth for ID -> texture key mapping
 */
export function getSymbolKey(symbolId: number): SymbolKey {
  const clampedId = Math.max(0, Math.min(9, Math.floor(symbolId)))
  return SYMBOL_KEYS[clampedId]
}

/** Alias for getSymbolKey - explicit name for API clarity */
export const getSymbolTextureKey = getSymbolKey

/**
 * Get fallback color for a symbol ID (0-9)
 * Returns hex color number for fallback texture generation
 */
export function getSymbolFallbackColor(symbolId: number): number {
  const key = getSymbolKey(symbolId)
  return SYMBOL_FALLBACK_COLORS[key]
}

/**
 * Get symbol alias from ID (for display/debugging)
 */
export function getSymbolAlias(symbolId: number): SymbolAlias {
  const clampedId = Math.max(0, Math.min(9, Math.floor(symbolId))) as SymbolId
  return SYMBOL_ID_TO_ALIAS[clampedId]
}

/**
 * Get symbol ID from alias
 */
export function getSymbolIdFromAlias(alias: SymbolAlias): SymbolId {
  return SYMBOL_ALIAS_TO_ID[alias]
}

/**
 * Check if a key is a valid texture key
 */
export function isValidTextureKey(key: string): key is TextureKey {
  return (SYMBOL_KEYS as readonly string[]).includes(key) ||
         (UI_KEYS as readonly string[]).includes(key)
}

/**
 * VIP Theme Fallback Colors (used when texture missing)
 * Low symbols (0-4): purple/teal tones
 * High symbols (5-7): gold/champagne/magenta
 * Wild (8): gold, Scatter (9): magenta
 */
export const SYMBOL_FALLBACK_COLORS: Record<SymbolKey, number> = {
  sym_0: 0x6b3fa0, // L1 deep purple
  sym_1: 0x4a90a4, // L2 teal
  sym_2: 0x5c6bc0, // L3 indigo
  sym_3: 0x7e57c2, // L4 violet
  sym_4: 0x26a69a, // L5 cyan-teal
  sym_5: 0xf6c85f, // H1 gold
  sym_6: 0xffe6b0, // H2 champagne
  sym_7: 0xff2daa, // H3 neon magenta
  sym_8: 0xf6c85f, // WILD gold
  sym_9: 0xff2daa, // SCATTER magenta
}

/**
 * VIP Theme UI Fallback Colors
 */
export const UI_FALLBACK_COLORS: Record<UIKey, number> = {
  ui_spin: 0xff2daa,   // neon magenta
  ui_spin_pressed: 0xc4238a, // darker magenta
  ui_turbo: 0x25d7ff,  // cyan accent
  ui_turbo_active: 0xf6c85f, // gold
  ui_bet_minus: 0x2a0b3f, // bg violet
  ui_bet_plus: 0x2a0b3f,  // bg violet
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
