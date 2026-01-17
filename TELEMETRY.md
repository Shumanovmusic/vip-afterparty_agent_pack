# TELEMETRY CONTRACT

Цель: измерять раздражение/усталость (анимации) и честность “anticipation”, а также обеспечивать аудит конфигурации.

## События (MUST)

### spin_start
Поля:
- `mode`: `normal|turbo`
- `reduce_motion`: `boolean`
- `config_hash`: `string`

### spin_result
Поля:
- `win_x`: `number` (множитель относительно ставки)
- `is_bonus`: `boolean`
- `anticipation_used`: `boolean`
- `spotlight_used`: `boolean`
- `spotlight_count`: `number` (0..3)
- `teaser_used`: `boolean`
- `teaser_type`: `none|velvet_rope`
- `hype_mode_enabled`: `boolean`
- `mode`: `normal|turbo`
- `reduce_motion`: `boolean`
- `config_hash`: `string`

### setting_changed
Поля:
- `reduce_motion`: `boolean`
- `turbo_spin`: `boolean`
- `post_spin_bounce`: `boolean`

### animation_skipped
Поля:
- `type`: `celebration|highlight|other`
- `mode`: `normal|turbo`
- `reduce_motion`: `boolean`

### session_summary
Поля:
- `spins_count`: `number`
- `turbo_ratio`: `number`
- `reduce_motion_ratio`: `number`
- `avg_spin_loop_ms`: `number`

## Метрики (MUST)
- Spotlight usage rate per 100 spins
- Teaser usage rate per 100 spins
- Hype Mode adoption rate
- 3–6 week cohort retention trend (D7/D14/D21/D28)
- Adoption rate: Reduce Motion
- Adoption rate: Turbo Spin
- Avg spin loop time by mode
- Anticipation rate per 100 spins
- Skip usage rate

## Acceptance Criteria (MUST)
1) Каждый `spin_result` содержит флаги режима и `config_hash`.
2) Частота anticipation не превышает лимит из `CONFIG.md`:
   - `ANTICIPATION_MAX_RATE_PER_100_SPINS`
3) Все события логируются без персональных данных пользователя.


## Rage Mode Telemetry (MUST)

### Per Round Fields
- `afterparty_meter_before` (int)
- `afterparty_meter_after` (int)
- `rage_active` (bool)
- `rage_spins_left` (int)
- `rage_multiplier` (number | null)
- `rage_deferred_due_to_bonus` (bool)

### Events
- `RAGE_ENTER` (playerId, roundId, rage_spins_count, rage_multiplier)
- `RAGE_EXIT` (playerId, roundId)
- `METER_UPDATE` (playerId, roundId, meter='afterparty', value)


## Events (MUST) — Variety & Climax

### event_start
Поля:
- `type`: `boost|rage|explosive|bonus|finale`
- `reason`: `deadspins|smallwins|win_threshold|scatter|buy_feature|manual`
- `mode`: `normal|turbo`
- `reduce_motion`: `boolean`
- `config_hash`: `string`

### event_end
Поля:
- `type`: `boost|rage|explosive|bonus|finale`
- `mode`: `normal|turbo`
- `reduce_motion`: `boolean`
- `config_hash`: `string`

### bonus_triggered
Поля:
- `bonus_type`: `freespins|pick|wheel|other`
- `config_hash`: `string`

### bonus_end
Поля:
- `bonus_type`: `freespins|pick|wheel|other`
- `total_win_x`: `number`
- `finale_path`: `upgrade|multiplier|standard`
- `config_hash`: `string`

## Metrics (MUST)
- 3–6 week cohort retention trend (D7/D14/D21/D28)
- Bonus trigger rate
- Event activation rate (per 100 spins) by type
- Game loop monotony proxy: deadspins streak distribution


## Spotlight / Hype / Win Tiers Telemetry (MUST)

### round_fields (add)
- `hype_mode` (bool)
- `spotlight_triggered` (bool)
- `spotlight_positions` (array<int> | null)
- `win_tier` ("none"|"big"|"mega"|"epic")

### events (add)
- `SPOTLIGHT_APPLIED` (roundId, positions_count, positions)
- `HYPE_MODE_TOGGLED` (sessionId, enabled)
- `WIN_TIER` (roundId, tier, win_x)

