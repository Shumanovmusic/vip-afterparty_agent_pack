# Матрица задач (16 подпланов)

1) Foundation — стек, команды запуска, структура.
2) Repo Hygiene — стиль, хуки, CI.
3) Stake Docs Library — локальные доки и индекс.
4) Memory Bank — законы, решения, глоссарий.
5) API Contracts — контракты и ошибки.
6) RNG Policy — сидирование и воспроизводимость.
7) Math Rules — правила и проверки.
8) State Machine — состояния и идемпотентность.
9) Frontend Shell — сцены и базовый UI.
10) Rendering + Animation — Pixi/Spine эффекты.
11) Audio — загрузка и управление звуком.
12) i18n — словари и переключение.
13) Telemetry + Logs — события и диагностика.
14) Security + Abuse — валидация и лимиты.
15) Testing + Simulation — тесты и воспроизводимость.
16) Release + Certification — сборка и пакет артефактов.

---

## Вставка требований из отзывов игроков (MUST)

### Plan 6) RNG Policy
- Обеспечить воспроизводимость симуляций: seed/config/hash обязаны логироваться (см. `RNG_POLICY.md`).

### Plan 7) Math Rules
- Зафиксировать `MAX_WIN_X=25000` в `CONFIG.md` и `GAME_RULES.md`.
- Добавить контракт на симуляционный отчёт: частоты 25000x / 10000x+ / 1000x+ (см. `GAME_RULES.md`).

### Plan 10) Rendering + Animation
- Post-spin bounce остаётся default ON, но:
  - `Reduce Motion` MUST полностью отключать bounce и squash&stretch.
  - `Turbo Spin` MUST убирать декоративные пост-спин эффекты.
  (см. `UX_ANIMATION_SPEC.md`)
- Включить правила Skip (см. `UX_ANIMATION_SPEC.md`).

### Plan 13) Telemetry + Logs
- Ввести события и метрики из `TELEMETRY.md`.
- Логировать флаги конфигурации в каждом spin_result (mode/reduce_motion/turbo).

### Plan 15) Testing + Simulation
- Автотесты для переключателей Reduce Motion/Turbo/Skip.
- Симуляции должны быть детерминированы и воспроизводимы (см. `RNG_POLICY.md`).

---

## Additions from Player Feedback (Variety & Juice)

### Plan 7) Math Rules
- Реализовать логику `Spotlight Wilds` (рандомная замена 1–3 позиций на WILD по частоте `SPOTLIGHT_WILDS_FREQUENCY`).
- Реализовать математику `Hype Mode` (Ante Bet): изменение hit frequency бонуса при активном флаге, без нарушения `MAX_WIN_X`.

### Plan 9) Frontend Shell
- Добавить UI-тоггл для `Hype Mode` (рядом с кнопкой Spin/Bet).
- Добавить визуальный слой `Spotlight` поверх сетки (прожекторы + SFX), соблюдая `Reduce Motion`.

### Plan 10) Rendering + Animation
- Реализовать 3 уровня celebration tiers: `Big Win / Mega Win / Epic Win` (см. `UX_ANIMATION_SPEC.md`).
- Реализовать teaser-анимацию `Velvet Rope` при 2 `SCATTER` (см. `UX_ANIMATION_SPEC.md`).
- Убедиться, что `Reduce Motion` отключает строб/тряску, а `Turbo Spin` не удлиняет спин.

### Plan 13) Telemetry + Logs
- Добавить поля логирования: `spotlight_used`, `spotlight_count`, `teaser_used`, `teaser_type`, `hype_mode_enabled`.
- Добавить метрики по событиям/развязкам и трек 3–6 недельных когорт (см. `TELEMETRY.md`).


## Add-on: Rage Mode (Base Game Variety)
- Implement Afterparty Meter accumulation rules from `CONFIG.md`.
- Emit protocol events: `meterUpdate`, `enterRageMode`, `exitRageMode`.
- Apply multiplier `RAGE_MULTIPLIER` to win during Rage spins (x2+).
- Ensure `MAX_WIN_X` cap still applies.
- Add tests:
  - seed -> Rage enter -> 3 rage spins -> exit
  - verify multiplier applied
  - verify cap safety

## Variety Layer: Event System + Scenario (MUST)
- Create `EVENT_SYSTEM.md` (contract) and wire it into backend events + telemetry.
- Create `SCENARIO_V1.md` and ensure frontend implements timings and skip/turbo rules.
- Update `CONFIG.md`, `GAME_RULES.md`, `UX_ANIMATION_SPEC.md`, `TELEMETRY.md` accordingly.
- Add tests for event triggering and rate limits (per 100 spins window).


## Additions from Slot Analyst Audit (Variety & Juice)

### Plan 7) Math Rules
- Implement `Spotlight Wilds` (random wild conversion BEFORE win eval; gated by CONFIG).
- Implement `Hype Mode` (Ante Bet): debit increase + alternative scatter-weight table; report RTP separately for NORMAL vs HYPE.
- Ensure these features respect hard caps and are logged/telemetry-ready.

### Plan 9) Frontend Shell
- Add UI toggle for `Hype Mode` (near Spin; disabled if config OFF).
- Implement `Spotlight` visual layer (spotlight sweep overlay; highlight converted wild positions).

### Plan 10) Rendering + Animation
- Implement Big Win tiers (Big/Mega/Epic) with strict Turbo/Reduce Motion degradations.
- Implement “Velvet Rope” teaser for 2 scatters (audio low-pass + neon rope + timing extension), TURBO OFF.

