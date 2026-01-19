/**
 * Telemetry client (console-based stub)
 * Source of truth: /TELEMETRY.md
 */

import type { WinTier } from '../types/events'

/** spin_start fields from TELEMETRY.md */
export interface SpinStartData {
  mode: 'normal' | 'turbo'
  reduce_motion: boolean
  config_hash: string
}

/** spin_result fields from TELEMETRY.md */
export interface SpinResultData {
  win_x: number
  is_bonus: boolean
  anticipation_used: boolean
  spotlight_used: boolean
  spotlight_count: number
  teaser_used: boolean
  teaser_type: 'none' | 'velvet_rope'
  hype_mode_enabled: boolean
  mode: 'normal' | 'turbo'
  reduce_motion: boolean
  config_hash: string
  // Rage mode fields
  afterparty_meter_before?: number
  afterparty_meter_after?: number
  rage_active?: boolean
  rage_spins_left?: number
  rage_multiplier?: number | null
  // Win tier
  win_tier?: WinTier
}

/** setting_changed fields from TELEMETRY.md */
export interface SettingChangedData {
  reduce_motion: boolean
  turbo_spin: boolean
  post_spin_bounce: boolean
}

/** animation_skipped fields from TELEMETRY.md */
export interface AnimationSkippedData {
  type: 'celebration' | 'highlight' | 'other'
  mode: 'normal' | 'turbo'
  reduce_motion: boolean
}

/** event_start fields from TELEMETRY.md */
export interface EventStartData {
  type: 'boost' | 'rage' | 'explosive' | 'bonus' | 'finale'
  reason: string
  mode: 'normal' | 'turbo'
  reduce_motion: boolean
  config_hash: string
}

/** event_end fields from TELEMETRY.md */
export interface EventEndData {
  type: 'boost' | 'rage' | 'explosive' | 'bonus' | 'finale'
  mode: 'normal' | 'turbo'
  reduce_motion: boolean
  config_hash: string
}

/** bonus_triggered fields from TELEMETRY.md */
export interface BonusTriggeredData {
  bonus_type: 'freespins' | 'pick' | 'wheel' | 'other'
  bonus_is_bought: boolean
  bonus_variant: 'standard' | 'vip_buy'
  bonus_multiplier_applied: number
  config_hash: string
}

/** bonus_end fields from TELEMETRY.md */
export interface BonusEndData {
  bonus_type: 'freespins' | 'pick' | 'wheel' | 'other'
  bonus_is_bought: boolean
  bonus_variant: 'standard' | 'vip_buy'
  bonus_multiplier_applied: number
  bonus_total_win_x_pre_multiplier: number
  bonus_total_win_x_post_multiplier: number
  total_win_x: number
  finale_path: 'upgrade' | 'multiplier' | 'standard'
  config_hash: string
}

/** session_summary fields from TELEMETRY.md */
export interface SessionSummaryData {
  spins_count: number
  turbo_ratio: number
  reduce_motion_ratio: number
  avg_spin_loop_ms: number
}

/** audio_setting_changed fields */
export interface AudioSettingChangedData {
  setting: 'sound_enabled' | 'master_volume'
  value: boolean | number
}

/** asset_load_error fields */
export interface AssetLoadErrorData {
  asset_type: 'audio' | 'image' | 'other'
  asset_name: string
  error_message: string
}

/**
 * Console-based telemetry client
 * In production, this would send to analytics backend
 */
export class TelemetryClient {
  private configHash: string = ''
  private spinsCount = 0
  private turboSpins = 0
  private reduceMotionSpins = 0
  private spinLoopTimes: number[] = []

  /** Set config hash after /init */
  setConfigHash(hash: string): void {
    this.configHash = hash
  }

  /** Generate simple config hash from configuration */
  static generateConfigHash(config: Record<string, unknown>): string {
    const str = JSON.stringify(config)
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16)
  }

  /** Log spin_start event */
  logSpinStart(data: SpinStartData): void {
    this.spinsCount++
    if (data.mode === 'turbo') this.turboSpins++
    if (data.reduce_motion) this.reduceMotionSpins++

    console.debug('[TELEMETRY] spin_start', {
      ...data,
      config_hash: this.configHash
    })
  }

  /** Log spin_result event */
  logSpinResult(data: SpinResultData, spinLoopMs: number): void {
    this.spinLoopTimes.push(spinLoopMs)

    console.debug('[TELEMETRY] spin_result', {
      ...data,
      config_hash: this.configHash,
      spin_loop_ms: spinLoopMs
    })
  }

  /** Log setting_changed event */
  logSettingChanged(data: SettingChangedData): void {
    console.debug('[TELEMETRY] setting_changed', data)
  }

  /** Log animation_skipped event */
  logAnimationSkipped(data: AnimationSkippedData): void {
    console.debug('[TELEMETRY] animation_skipped', data)
  }

  /** Log event_start */
  logEventStart(data: EventStartData): void {
    console.debug('[TELEMETRY] event_start', {
      ...data,
      config_hash: this.configHash
    })
  }

  /** Log event_end */
  logEventEnd(data: EventEndData): void {
    console.debug('[TELEMETRY] event_end', {
      ...data,
      config_hash: this.configHash
    })
  }

  /** Log bonus_triggered */
  logBonusTriggered(data: BonusTriggeredData): void {
    console.debug('[TELEMETRY] bonus_triggered', {
      ...data,
      config_hash: this.configHash
    })
  }

  /** Log bonus_end */
  logBonusEnd(data: BonusEndData): void {
    console.debug('[TELEMETRY] bonus_end', {
      ...data,
      config_hash: this.configHash
    })
  }

  /** Log rage mode entry */
  logRageEnter(playerId: string, roundId: string, rageSpinsCount: number, rageMultiplier: number): void {
    console.debug('[TELEMETRY] RAGE_ENTER', {
      playerId,
      roundId,
      rage_spins_count: rageSpinsCount,
      rage_multiplier: rageMultiplier
    })
  }

  /** Log rage mode exit */
  logRageExit(playerId: string, roundId: string): void {
    console.debug('[TELEMETRY] RAGE_EXIT', { playerId, roundId })
  }

  /** Log afterparty meter update */
  logMeterUpdate(playerId: string, roundId: string, value: number): void {
    console.debug('[TELEMETRY] METER_UPDATE', {
      playerId,
      roundId,
      meter: 'afterparty',
      value
    })
  }

  /** Log spotlight applied */
  logSpotlightApplied(roundId: string, positionsCount: number, positions: number[]): void {
    console.debug('[TELEMETRY] SPOTLIGHT_APPLIED', {
      roundId,
      positions_count: positionsCount,
      positions
    })
  }

  /** Log hype mode toggle */
  logHypeModeToggled(sessionId: string, enabled: boolean): void {
    console.debug('[TELEMETRY] HYPE_MODE_TOGGLED', { sessionId, enabled })
  }

  /** Log win tier */
  logWinTier(roundId: string, tier: WinTier, winX: number): void {
    console.debug('[TELEMETRY] WIN_TIER', { roundId, tier, win_x: winX })
  }

  /** Get session summary */
  getSessionSummary(): SessionSummaryData {
    const avgSpinLoopMs = this.spinLoopTimes.length > 0
      ? this.spinLoopTimes.reduce((a, b) => a + b, 0) / this.spinLoopTimes.length
      : 0

    return {
      spins_count: this.spinsCount,
      turbo_ratio: this.spinsCount > 0 ? this.turboSpins / this.spinsCount : 0,
      reduce_motion_ratio: this.spinsCount > 0 ? this.reduceMotionSpins / this.spinsCount : 0,
      avg_spin_loop_ms: avgSpinLoopMs
    }
  }

  /** Log session summary (call on session end) */
  logSessionSummary(): void {
    const summary = this.getSessionSummary()
    console.debug('[TELEMETRY] session_summary', summary)
  }

  /** Log audio setting changed */
  logAudioSettingChanged(data: AudioSettingChangedData): void {
    console.debug('[TELEMETRY] audio_setting_changed', data)
  }

  /** Log asset load error (non-fatal) */
  logAssetLoadError(data: AssetLoadErrorData): void {
    console.debug('[TELEMETRY] asset_load_error', data)
  }
}
