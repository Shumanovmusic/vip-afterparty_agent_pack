/**
 * Audio type definitions
 * Type-safe sound names and priorities
 */

/** All available sound names */
export type SoundName =
  | 'ui_click'
  | 'reel_spin_loop'
  | 'reel_stop_tick'
  | 'win_small'
  | 'win_big'
  | 'win_mega'
  | 'win_epic'
  | 'bonus_enter'
  | 'bonus_end'
  | 'coin_roll_loop'

/** Sound categories for priority and policy */
export type SoundCategory = 'ui' | 'loop' | 'feedback' | 'stinger'

/** Sound priority levels (higher = more important) */
export const SoundPriority = {
  ui_click: 1,
  reel_stop_tick: 2,
  reel_spin_loop: 3,  // Loop has mid priority
  coin_roll_loop: 3,  // Loop has mid priority (same as reel spin)
  win_small: 4,
  win_big: 5,
  win_mega: 6,
  win_epic: 7,
  bonus_enter: 8,
  bonus_end: 8
} as const satisfies Record<SoundName, number>

/** Map sound name to category */
export const SoundCategories: Record<SoundName, SoundCategory> = {
  ui_click: 'ui',
  reel_spin_loop: 'loop',
  coin_roll_loop: 'loop',
  reel_stop_tick: 'feedback',
  win_small: 'feedback',
  win_big: 'stinger',
  win_mega: 'stinger',
  win_epic: 'stinger',
  bonus_enter: 'stinger',
  bonus_end: 'stinger'
}

/** Check if sound is a stinger */
export function isStinger(name: SoundName): boolean {
  return SoundCategories[name] === 'stinger'
}

/** Check if sound is a loop */
export function isLoop(name: SoundName): boolean {
  return SoundCategories[name] === 'loop'
}

/** Check if sound is decorative (can be dropped in turbo/reduce motion) */
export function isDecorative(name: SoundName): boolean {
  return name === 'ui_click' || name === 'reel_stop_tick'
}

/** Win tier to sound mapping */
export function winTierToSound(tier: 'big' | 'mega' | 'epic'): SoundName {
  switch (tier) {
    case 'big': return 'win_big'
    case 'mega': return 'win_mega'
    case 'epic': return 'win_epic'
  }
}
