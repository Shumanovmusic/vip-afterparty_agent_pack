/**
 * Event types derived from protocol_v1.md Section 4
 * Source of truth: /protocol_v1.md
 */

/** Grid reveal event - shows final reel positions */
export interface RevealEvent {
  type: 'reveal'
  /** 5x3 grid as [reel][row], values are symbol IDs */
  grid: number[][]
}

/** Win line event - single winning payline */
export interface WinLineEvent {
  type: 'winLine'
  lineId: number
  amount: number
  /** winX = amount / betAmount (base bet) */
  winX: number
}

/** Enter free spins event */
export interface EnterFreeSpinsEvent {
  type: 'enterFreeSpins'
  count: number
  /** Trigger source */
  reason?: 'scatter' | 'buy_feature'
  /** Present only when reason is buy_feature */
  bonusVariant?: 'standard' | 'vip_buy'
}

/** Heat meter update event */
export interface HeatUpdateEvent {
  type: 'heatUpdate'
  level: number
}

/** Event types for eventStart/eventEnd */
export type EventType = 'boost' | 'rage' | 'explosive' | 'bonus' | 'finale'

/** Event start - marks beginning of a special event */
export interface EventStartEvent {
  type: 'eventStart'
  eventType: EventType
  reason: 'deadspins' | 'smallwins' | 'win_threshold' | 'scatter' | 'buy_feature' | 'manual'
  durationSpins: number
  /** Multiplier applied during this event (e.g., rage x2) */
  multiplier?: number
}

/** Event end - marks end of a special event */
export interface EventEndEvent {
  type: 'eventEnd'
  eventType: EventType
  reason?: string
}

/** Spotlight wilds - random wild positions */
export interface SpotlightWildsEvent {
  type: 'spotlightWilds'
  /** 0-based flattened indices: index = reelIndex * 3 + rowIndex */
  positions: number[]
  count: number
}

/** Win tier for celebrations */
export type WinTier = 'none' | 'big' | 'mega' | 'epic'

/** Win tier event - triggers celebration */
export interface WinTierEvent {
  type: 'winTier'
  tier: WinTier
  winX: number
}

/** Finale path types */
export type FinalePath = 'upgrade' | 'multiplier' | 'standard'

/** Bonus end event - marks completion of bonus round */
export interface BonusEndEvent {
  type: 'bonusEnd'
  bonusType: 'freespins' | 'pick' | 'wheel' | 'other'
  finalePath: FinalePath
  totalWinX: number
  /** Present for VIP Buy bonuses */
  bonusVariant?: 'standard' | 'vip_buy'
  /** Multiplier applied (e.g., 11) - present for VIP Buy */
  bonusMultiplierApplied?: number
  /** Win multiplier before VIP multiplier - present for VIP Buy */
  totalWinXPreMultiplier?: number
}

/** Afterparty meter update (from EVENT_SYSTEM.md) */
export interface AfterpartyMeterUpdateEvent {
  type: 'afterpartyMeterUpdate'
  level: number
  triggered: boolean
}

/** Union of all game events */
export type GameEvent =
  | RevealEvent
  | WinLineEvent
  | EnterFreeSpinsEvent
  | HeatUpdateEvent
  | EventStartEvent
  | EventEndEvent
  | SpotlightWildsEvent
  | WinTierEvent
  | BonusEndEvent
  | AfterpartyMeterUpdateEvent

/** Type guard helpers */
export function isRevealEvent(event: GameEvent): event is RevealEvent {
  return event.type === 'reveal'
}

export function isWinLineEvent(event: GameEvent): event is WinLineEvent {
  return event.type === 'winLine'
}

export function isEnterFreeSpinsEvent(event: GameEvent): event is EnterFreeSpinsEvent {
  return event.type === 'enterFreeSpins'
}

export function isHeatUpdateEvent(event: GameEvent): event is HeatUpdateEvent {
  return event.type === 'heatUpdate'
}

export function isEventStartEvent(event: GameEvent): event is EventStartEvent {
  return event.type === 'eventStart'
}

export function isEventEndEvent(event: GameEvent): event is EventEndEvent {
  return event.type === 'eventEnd'
}

export function isSpotlightWildsEvent(event: GameEvent): event is SpotlightWildsEvent {
  return event.type === 'spotlightWilds'
}

export function isWinTierEvent(event: GameEvent): event is WinTierEvent {
  return event.type === 'winTier'
}

export function isBonusEndEvent(event: GameEvent): event is BonusEndEvent {
  return event.type === 'bonusEnd'
}

export function isAfterpartyMeterUpdateEvent(event: GameEvent): event is AfterpartyMeterUpdateEvent {
  return event.type === 'afterpartyMeterUpdate'
}
