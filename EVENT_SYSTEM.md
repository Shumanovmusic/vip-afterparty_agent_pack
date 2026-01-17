# EVENT SYSTEM (CONTRACT)

Цель: убрать однотипность, добавить “события/взрывы/ускорения”, не нарушая честность RNG и не перегружая длинные сессии.

## Core Rule (MUST)
- Events MUST NOT менять исход RNG “задним числом”.
- Events могут только:
  1) активировать заранее описанные модификаторы (если они часть математики),
  2) менять презентацию/темп,
  3) добавлять визуальные/аудио эффекты в рамках UX лимитов.

## Inputs & Counters (MUST)
Backend обязан вести счётчики за сессию/окно:
- `smallwins_streak` — подряд спины с `0 < win_x <= 2` в BASE (for BOOST trigger).
- `afterparty_meter` — текущее значение метра (0–100) для Afterparty Rage Mode.
- `events_per_100_spins` (rolling window) — суммарная частота событий BOOST+EXPLOSIVE.
- `boost_per_100_spins`, `explosive_per_100_spins` — частоты по типам.
- `reduce_motion` и `turbo` приходят от клиента (или определяются UI), но backend должен учитывать правила совместимости.

> NOTE: `deadspins_streak` is no longer used (rage is meter-based, not deadspins-based).

## Global Rate Limit (MUST)
- Суммарная частота событий в BASE <= `EVENT_MAX_RATE_PER_100_SPINS` из `CONFIG.md`.
- Если лимит превышен — событие не запускается, но счётчики streak продолжают считаться.

## Event Types (MUST IMPLEMENT)

### 1) BOOST MODE
- Description: краткий "буст/ускорение/эффекты" (в основном UX).
- Trigger (MUST): после `BOOST_TRIGGER_SMALLWINS` подряд small-win в BASE.
  - small-win: `0 < win_x <= 2`
- Duration: `BOOST_SPINS`.
- Rate limit: `BOOST_MAX_RATE_PER_100_SPINS`.
- Math: **не меняет RTP** (по умолчанию), влияет на темп и FX.
- Presentation:
  - ускорение темпа (в normal mode)
  - усиление подсветок/частиц (в пределах UX_ANIMATION_SPEC.md)

### 2) AFTERPARTY RAGE MODE (x2+) — Meter-Based (Canonical)
> **IMPORTANT:** Rage Mode is handled ONLY by Afterparty Meter (see CONFIG.md `AFTERPARTY_*` keys).
> Event System does NOT trigger Rage. There is no deadspins-based rage trigger.

- Description: "рейдж" when Afterparty Meter fills to max — эмоциональная разрядка + ощущение, что игра "включилась".
- Trigger: Afterparty Meter reaches `AFTERPARTY_METER_MAX` (100).
  - Meter increments: +3 on any win, +5 on wild present, +8 on 2 scatters (in BASE mode).
- Duration: `AFTERPARTY_RAGE_SPINS` (3 spins).
- Cooldown: `AFTERPARTY_RAGE_COOLDOWN_SPINS` (15 spins before meter can refill).
- Math: applies `AFTERPARTY_RAGE_MULTIPLIER` (x2) to win of each rage spin.
- Presentation:
  - агрессивнее звук/подсветки
  - haptics только на вход и big win (см. UX)
  - UI banner, VFX intensity, screen shake per CONFIG.md

### 3) EXPLOSIVE MODE
- Description: “взрывной” спин: BOOM/комикс-удар/фейерверк при выигрыше.
- Trigger (MUST): если `win_x >= EXPLOSIVE_TRIGGER_WIN_X` в BASE (порог из CONFIG.md).
- Duration: `EXPLOSIVE_SPINS` (обычно 1).
- Rate limit: `EXPLOSIVE_MAX_RATE_PER_100_SPINS`.
- Math: не меняет исход.
- Presentation:
  - BOOM overlay + короткий “взрыв” символов (можно как removal/cascade визуально)

## Compatibility With UX Modes (MUST)
- If TURBO_SPIN=ON:
  - Events MUST NOT добавлять длинные декоративные пост-эффекты
  - Допускается только короткий текст + подсветка в лимитах UX_ANIMATION_SPEC.md
- If REDUCE_MOTION=ON:
  - Events MUST отключать тряску/резину/вспышки высокой частоты
  - Оставить короткие подсветки и текст, допускается статичный “stamp” (BOOM)

## Protocol Events (MUST)
Backend MUST emit:
- `eventStart` { type: "boost"|"afterpartyRage"|"explosive", reason, durationSpins, multiplier? }
- `eventEnd` { type, reason? }
- `afterpartyMeterUpdate` { level: 0-100, triggered: boolean } — emitted when meter changes
- `fx` (boom/fireworks) — опционально, но только как честная презентация

## Telemetry (MUST)
Каждое событие обязано логироваться (см. TELEMETRY.md):
- `event_start`
- `event_end`
с полями `type`, `reason`, `mode`, `reduce_motion`, `config_hash`.

## Additional Mechanics (NEW, MUST)

### Spotlight Wilds (Base Game Random Feature)
- Flag: `ENABLE_SPOTLIGHT_WILDS`
- Frequency: `SPOTLIGHT_WILDS_FREQUENCY` (probability per BASE spin)
- Effect: choose N random positions (N in [`SPOTLIGHT_WILDS_MIN_POS`, `SPOTLIGHT_WILDS_MAX_POS`]) and convert them to WILD **before** win evaluation.
- Integrity: this is part of math (not post-hoc). It must be applied deterministically within the spin computation pipeline.
- Protocol: backend emits `spotlightWilds` event with selected positions.

### Hype Mode (Ante Bet, Player-Controlled)
- Flag: `ENABLE_HYPE_MODE_ANTE_BET`
- UI: toggle in client; request field `hypeMode: true|false` (or `betMode: NORMAL|HYPE`) — backend must validate.
- Cost: `debit = baseBet * (1 + HYPE_MODE_COST_INCREASE)`; payouts are calculated from **baseBet**.
- Effect: bonus trigger probability is increased by `HYPE_MODE_BONUS_CHANCE_MULTIPLIER` by switching to an alternative scatter weight table (no forcing).
- Telemetry: must log hypeMode on each round.


