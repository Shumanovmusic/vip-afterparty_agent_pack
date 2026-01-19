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
- `bonus_is_bought`: `boolean`
- `bonus_variant`: `standard|vip_buy`
- `bonus_multiplier_applied`: `number`
- `config_hash`: `string`

### bonus_end
Поля:
- `bonus_type`: `freespins|pick|wheel|other`
- `bonus_is_bought`: `boolean`
- `bonus_variant`: `standard|vip_buy`
- `bonus_multiplier_applied`: `number`
- `bonus_total_win_x_pre_multiplier`: `number`
- `bonus_total_win_x_post_multiplier`: `number`
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
- `scatter_chance_base` (float) - Base scatter probability (0.02)
- `scatter_chance_effective` (float) - Actual scatter probability used (0.02 or 0.04)
- `scatter_chance_multiplier` (float) - Multiplier applied (1.0 or 2.0)
- `spotlight_triggered` (bool)
- `spotlight_positions` (array<int> | null)
- `win_tier` ("none"|"big"|"mega"|"epic")

### events (add)
- `SPOTLIGHT_APPLIED` (roundId, positions_count, positions)
- `HYPE_MODE_TOGGLED` (sessionId, enabled)
- `WIN_TIER` (roundId, tier, win_x)


## Server-Side Observability (MUST)

Server events emitted internally for observability/audit (NOT in HTTP responses).

### init_served
Emitted at end of GET /init processing.

Поля:
- `player_id`: string
- `restore_state_present`: boolean — true if restoreState != null
- `restore_mode`: "FREE_SPINS" | "NONE" — "NONE" if restoreState null
- `spins_remaining`: number | null — spins remaining if restore present, else null

### spin_processed
Emitted at end of POST /spin processing, ONLY when request reaches critical section under lock.
NOT emitted on idempotent replay (fast-path cache hit returns early without telemetry).

Поля:
- `player_id`: string
- `client_request_id`: string
- `lock_acquire_ms`: number — time from start of lock acquisition to lock acquired (ms)
- `lock_wait_retries`: number — count of failed lock attempts before success (0 if immediate)
- `is_bonus_continuation`: boolean — true if spin processed as continuation of FREE_SPINS loaded from Redis state
- `bonus_continuation_count`: number — cumulative count of bonus continuation spins in current restoreable session
- `config_hash`: string — 16-char hex hash of config snapshot (same as audit CSV)
- `mode`: "base" | "buy" | "hype" — spin mode for correlation
- `round_id`: string — roundId from SpinResponse (for frontend/backend correlation)
- `bonus_variant`: "standard" | "vip_buy" | null — bonus type if enterFreeSpins triggered, else null

### Semantics

**bonus_continuation_count:**
- Stored in Redis player state as `bonusContinuationCount` (durable).
- Incremented by 1 each time POST /spin is processed as continuation (FREE_SPINS with spinsRemaining > 0 at spin start).
- Does NOT increment on idempotent replay (response from cache, no state mutation).
- Resets to 0 when bonus ends (state cleared).

**lock metrics:**
- `lock_acquire_ms` measured around lock acquisition call.
- `lock_wait_retries` = number of failed attempts before success.
- Current implementation is non-blocking (immediate 409 on fail), so typical values: lock_acquire_ms ~0-1ms, lock_wait_retries = 0.

**Idempotent replay policy:**
- Fast-path cache hit (before lock): no telemetry emitted.
- Slow-path cache hit (inside lock): no telemetry emitted.
- Only fresh spin processing emits spin_processed.

### spin_rejected
Emitted when POST /spin is rejected BEFORE entering critical section (lock not acquired or early validation failure).
Used for observability of lock contention and request rejection rates.

Поля:
- `player_id`: string
- `client_request_id`: string | null — null if request body parsing failed
- `reason`: "ROUND_IN_PROGRESS" | "INVALID_REQUEST" | "INVALID_BET" | "FEATURE_DISABLED" — rejection reason code
- `lock_acquire_ms`: number — time spent attempting lock before rejection (ms, 0 if rejected before lock)
- `lock_wait_retries`: number — count of failed lock attempts before giving up (0 if immediate rejection)

**spin_rejected semantics:**
- Emitted on 409 ROUND_IN_PROGRESS (lock contention).
- MAY be emitted on early validation failures (400 INVALID_BET, etc.) at implementation discretion.
- NOT emitted on idempotent replay (those return 200 from cache).
- sink failures MUST NOT break the request — catch and log internally.

### Delivery Guarantee

Telemetry sink failures MUST NOT break HTTP requests:
- Sink emit() is wrapped in try/catch.
- Exceptions are logged internally (not propagated).
- Request continues and returns normal response.

