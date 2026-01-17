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
- `deadspins_streak` — подряд спины с `win_x = 0` в BASE.
- `smallwins_streak` — подряд спины с `0 < win_x <= 2` в BASE.
- `events_per_100_spins` (rolling window) — суммарная частота событий.
- `boost_per_100_spins`, `rage_per_100_spins`, `explosive_per_100_spins` — частоты по типам.
- `reduce_motion` и `turbo` приходят от клиента (или определяются UI), но backend должен учитывать правила совместимости.

## Global Rate Limit (MUST)
- Суммарная частота событий в BASE <= `EVENT_MAX_RATE_PER_100_SPINS` из `CONFIG.md`.
- Если лимит превышен — событие не запускается, но счётчики streak продолжают считаться.

## Event Types (MUST IMPLEMENT)

### 1) BOOST MODE
- Description: краткий “буст/ускорение/эффекты” (в основном UX).
- Trigger (MUST): после `BOOST_TRIGGER_SMALLWINS` подряд small-win в BASE.
  - small-win: `0 < win_x <= 2`
- Duration: `BOOST_SPINS`.
- Rate limit: `BOOST_MAX_RATE_PER_100_SPINS`.
- Math: **не меняет RTP** (по умолчанию), влияет на темп и FX.
- Presentation:
  - ускорение темпа (в normal mode)
  - усиление подсветок/частиц (в пределах UX_ANIMATION_SPEC.md)

### 2) RAGE MODE (x2+)
- Description: “рейдж” после серии пустых спинов: эмоциональная разрядка + ощущение, что игра “включилась”.
- Trigger (MUST): после `RAGE_TRIGGER_DEADSPINS` подряд dead spins в BASE.
  - dead spin: `win_x = 0`
- Duration: `RAGE_SPINS` из `CONFIG.md`.
- Rate limit: `RAGE_MAX_RATE_PER_100_SPINS`.
- Math: применяет множитель `RAGE_MULTIPLIER` (минимум x2) к win каждого rage-спина.
- Presentation:
  - агрессивнее звук/подсветки
  - haptics только на вход и big win (см. UX)

> Важно: если у вас параллельно существует “Afterparty Meter -> Rage Mode” из GAME_RULES.md, то приоритет такой:
> 1) если уже активен Rage/Boost/Bonus — новые события не стартуют
> 2) если Rage готов по meter или по deadspins — стартует один Rage, затем cooldown

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
- `eventStart` { type: "boost"|"rage"|"explosive", reason, durationSpins, multiplier? }
- `eventEnd` { type, reason? }
- `meterUpdate` (afterparty) — если включён meter (см. GAME_RULES.md)
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


