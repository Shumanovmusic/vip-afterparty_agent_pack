# GAME RULES (CONTRACT)

Этот документ фиксирует математику и правила выплат.

## Основные параметры
- `MAX_WIN_TOTAL_X` берётся из `CONFIG.md` и является hard cap для total win за раунд (base + bonus aggregate).

## MAX WIN DESIGN (CONTRACT)
- `MAX_WIN_TOTAL_X = 25000` — Max Win per Round: 25,000x Bet (Hard Cap).
- Max win MUST быть теоретически достижим в продакшн-конфигурации.
- Max win MUST достигаться только через **описанные** комбинации механик (без скрытых “ускорителей”).
- Выплата MUST быть ограничена hard cap `MAX_WIN_TOTAL_X` для **TOTAL round win** (base + bonus aggregate), даже если несколько механик суммируются.
- Display/UI: при срабатывании cap показывать `Max Win Reached`.

## Частоты (Simulation-Based Acceptance)
Реализация MUST уметь генерировать симуляционный отчёт, включающий:
1) Hit rate max win (25000x)
2) Hit rate 10000x+
3) Hit rate 1000x+

### Требования к отчёту (MUST)
- Отчёт формируется на детерминированном RNG (см. `RNG_POLICY.md`).
- В отчёте MUST быть: `seed`, `config_hash`, параметры запуска и итоговые частоты.
- Должно быть возможно воспроизвести отчёт 1-в-1 тем же seed/config.

### Acceptance Criteria (MUST)
- Max win либо наблюдается в симуляции, либо предоставляется доказательство достижимости через перебор/перечень состояний (с указанием условий и вероятностей), подтверждённое ревью.
- Никакая выплата не превышает `MAX_WIN_TOTAL_X`.

### Extended Tail Reachability (GATE 4: Cap Reachability)
The "dream wins" (10000x+ and 25000x cap) MUST be theoretically reachable in production config.
This is enforced via `CAP_REACHABILITY_STRATEGY` in `CONFIG.md`:

#### Strategy: seed (default)
- Run `seed_hunt.py --mode buy --min_win_x 10000 --target high --max_seeds 200000`
- MUST find at least 1 seed producing >=10000x total win in buy mode
- If found: log seed, total_win_x, is_capped, cap_reason, bonus_variant, config_hash
- If NOT found within budget: FAIL gate with explicit message "Tail unreachable"

#### Strategy: proof
- If `CAP_REACHABILITY_STRATEGY=proof` is set in CONFIG.md, OR if seed strategy fails:
- `CAP_REACHABILITY.md` MUST exist at repository root
- Document MUST contain:
  1) Exact mechanic path to reach >=10000x (referencing GAME_RULES.md sections)
  2) Exact mechanic path to reach theoretical cap (25000x)
  3) Probability analysis showing reachability in production config (not debug-only)
  4) config_hash for which the analysis applies

#### Acceptance for GATE 4
- EITHER: seed hunt finds >=1 seed with total_win_x >= 10000
- OR: CAP_REACHABILITY.md exists and contains valid formal proof

## ANTICIPATION SYSTEM (NON-DECEPTIVE CONTRACT)
Цель: дать ощущение “почти выиграл” **без обмана**.

### Trigger Conditions (MUST)
Anticipation может включаться только если:
- текущее состояние спина содержит реальные предпосылки к высокому исходу (определяется механиками)
- включение выводится из фактического state, а не из “случайного красивого момента”

### Forbidden (MUST NOT)
- Запрещены фейковые визуальные “почти-x100/x1000”, если этот шанс математически не существовал в текущем состоянии.
- Запрещено создавать near-miss чаще лимита, указанного в `CONFIG.md`.

### Rate Limiting (MUST)
- Частота anticipation MUST быть ограничена параметром:
  - `ANTICIPATION_MAX_RATE_PER_100_SPINS`

### Telemetry (MUST)
- Каждый `spin_result` MUST логировать `anticipation_used` (см. `TELEMETRY.md`).

## BASE GAME MODIFIERS (CONTRACT)
 (CONTRACT)
Цель: разбить монотонность Base Game случайными микро-событиями.

### Feature: Spotlight Wilds
- **Gate (CONFIG)**: `ENABLE_SPOTLIGHT_WILDS=ON`
- **Frequency (CONFIG)**: `SPOTLIGHT_WILDS_FREQUENCY`
- **Trigger**: Случайное событие в начале спина (до расчёта выигрыша) с частотой `SPOTLIGHT_WILDS_FREQUENCY`.
- **Effect**: “Прожектор” выбирает от 1 до 3 случайных позиций на поле и превращает их в `WILD`.
- **Visual**: Клубный прожектор/свет, короткий звук “spotlight hit”.
- **Math**: Выигрыш рассчитывается **после** превращения.

### Telemetry (MUST)
- Каждый спин MUST логировать: `spotlight_used: boolean`, `spotlight_count: number` (0..3).

## BETTING MODES (CONTRACT)

### Feature: Hype Mode (Ante Bet)
- **Gate (CONFIG)**: `ENABLE_HYPE_MODE_ANTE_BET=ON`
- **UI**: Переключатель в интерфейсе `Hype Mode / Boost Chance` рядом со Spin/Bet.
- **Cost**: Ставка увеличивается на `HYPE_MODE_COST_INCREASE` (например, +25%).
- **Effect**: Шанс выпадения 3+ `SCATTER` для запуска бонуса увеличивается в `HYPE_MODE_BONUS_CHANCE_MULTIPLIER` раз.
- **Payout**: Таблица выплат применяется к **базовой** ставке (без учёта наценки за Hype).

### Acceptance Criteria (MUST)
- При включённом Hype Mode фактическая вероятность входа в бонус возрастает согласно `HYPE_MODE_BONUS_CHANCE_MULTIPLIER` (подтверждается симуляциями).
- Изменение режима НЕ ломает hard cap `MAX_WIN_TOTAL_X`.

### Feature: VIP Bonus Buy (Enhanced Bonus Variant) (CONTRACT)
- Mode: BUY_FEATURE
- Cost: BUY_FEATURE_COST_MULTIPLIER * betAmount (from CONFIG.md)
- bonus_variant: standard (natural) vs vip_buy (bought)
- Payout Multiplier (VIP-only): bonus session total win multiplied by BUY_BONUS_PAYOUT_MULTIPLIER
  *Applied ONLY when bonus_is_bought=true / bonus_variant=vip_buy*
  *Never applied to base game and never applied to natural scatter bonus*
- Disclosure: UI label "VIP Bonus Buy" (note: UI implemented later but law must require it)
- Cap Safety: must still respect MAX_WIN_TOTAL_X
- Acceptance: audit_sim must report vip_buy separately and telemetry must include bonus flags & multiplier fields


## FEATURE: AFTERPARTY METER -> RAGE MODE (CONTRACT)

Цель: убрать однотипность Base Game и давать частые "развязки" (взрывы/события/буст-режим).

> **Source of Truth:** All tuned values for Afterparty Meter are defined in CONFIG.md (`AFTERPARTY_*` keys).
> Do not duplicate numeric values in this file.

### Meter (Base Game)
- В Base Game есть счётчик `afterparty_meter` (0..`AFTERPARTY_METER_MAX` из CONFIG.md).
- Инкременты (из CONFIG.md):
  - При любом выигрыше спина: `+AFTERPARTY_METER_INC_ON_ANY_WIN`
  - Если в раскладе есть хотя бы один WILD: `+AFTERPARTY_METER_INC_ON_WILD_PRESENT`
  - Если выпало ровно 2 SCATTER (без входа в бонус): `+AFTERPARTY_METER_INC_ON_TWO_SCATTERS`
- Счётчик ограничен `AFTERPARTY_METER_MAX`.

### Trigger
- Если `ENABLE_AFTERPARTY_METER=ON` и `afterparty_meter >= AFTERPARTY_METER_MAX`, то **Rage Mode** запускается
  **в начале следующего базового раунда** (до reveal) при условии, что игра не находится в Free Spins.
- Если в момент готовности Rage игра уходит в Free Spins, Rage **откладывается** до завершения Free Spins
  (meter не сбрасывается, но не накапливается в бонусе).

### Rage Mode (Base Game modifier)
- Длительность: `AFTERPARTY_RAGE_SPINS` спинов.
- Множитель: `AFTERPARTY_RAGE_MULTIPLIER` (минимум x2) применяется к win каждого Rage-спина:
  - `rage_win = base_win * AFTERPARTY_RAGE_MULTIPLIER`
- После последнего Rage-спина:
  - Rage завершается
  - `afterparty_meter` сбрасывается в 0
  - применяются cooldown правила (см. `AFTERPARTY_RAGE_COOLDOWN_SPINS`)

### Cap Safety
- Множитель Rage участвует в расчёте, но итог всё равно ограничен hard cap `MAX_WIN_TOTAL_X`.
- Если сработал cap, `isCapped=true` и в событиях/телеметрии фиксируется `capReason`.

### Events (Protocol)
Backend MUST emit events:
- `meterUpdate` (afterparty): значение meter после каждого раунда Base Game
- `enterRageMode` при старте Rage (с количеством спинов и множителем)
- `exitRageMode` при завершении
- Доп. FX-события (например `fx: boom/fireworks`) разрешены, но должны быть честными (см. раздел Anticipation).

### Telemetry (MUST)
Каждый раунд MUST логировать:
- `afterparty_meter_before`, `afterparty_meter_after`
- `rage_active` boolean
- `rage_spins_left` integer
- `rage_multiplier` (если active)
- `rage_deferred_due_to_bonus` boolean


## VARIETY & CLIMAX (CONTRACT)
Цель: уйти от однотипности и дать “развязки” без обмана.

### MUST
1) Event System MUST быть частью продукта и описан в `EVENT_SYSTEM.md`.
2) В Base Game MUST существовать минимум 2 “микро-развязки”:
   - Boost Mode (после серии small wins) — см. EVENT_SYSTEM.md
   - Rage Mode (после серии dead spins) — см. EVENT_SYSTEM.md (x2+)
   - Explosive Mode (на win threshold) — см. EVENT_SYSTEM.md
3) В бонусе MUST существовать минимум 2 разных “развязки” (finale paths), которые меняют ощущения финала и логируются:
   - `upgrade` (Afterhours Encore)
   - `multiplier` (Final Count Up)
4) Любая развязка MUST быть определена правилами триггера и логироваться (см. TELEMETRY.md).

### MUST NOT
- Запрещены “фейковые” развязки, которые визуально обещают шанс, которого не было.

### Protocol
- Backend обязан эмитить `eventStart/eventEnd` и `bonus_end` (finale_path).
