# 16 подпланов (иерархия работ)

1) Foundation — структура, команды, правила.
2) Repo Hygiene — стиль, хуки, CI.
3) Stake Docs Library — локальные доки Stake + индекс.
4) Memory Bank — законы/решения/глоссарий.
5) API Contracts — контракт API + коды ошибок.
6) RNG Policy — сидирование, воспроизводимость симуляций (`RNG_POLICY.md`).
7) Math Rules — max win, частоты, правила выплат (`GAME_RULES.md`, `CONFIG.md`).
8) State Machine + Idempotency — состояния, ретраи, анти-дубли.

   - Definition of Done for 8): idempotency + locking покрыты тестами (test_idempotency.py, test_locking.py) и проходят в Docker.

9) Frontend Shell — Vue 3 + Vite shell, сцены/роутинг, базовый UI, Safe Areas + Thumb Zone (Stack: TypeScript + Vue 3 + Vite + Pixi v8 + Vue-Pixi).
10) Rendering + Animation — Pixi v8 (pixi/layout), Vue-Pixi компоненты, PixiSpine v8, Skip/Turbo/Reduce Motion, Rage/Boost/Explosive FX по контракту (`UX_ANIMATION_SPEC.md`, `SCENARIO_V1.md`). GSAP — опционально.
11) Audio — Pixi/Sound (или совместимый WebAudio слой), политика громкости, event stingers (rage/boost/explosive), правила отключения в Turbo/Reduce Motion (`UX_ANIMATION_SPEC.md`).
12) i18n — i18next + vue-i18n: словари, ключи UI/ошибок, переключение языка без перезагрузки. (Источник текстов: `UX_ANIMATION_SPEC.md` + error_codes.md).
13) Telemetry + Logs — события и метрики (`TELEMETRY.md`).
14) Security + Abuse Controls — лимиты, валидации, анти-фрод.
15) Testing + Simulation — тесты, симуляции, отчёты.
16) Release + Certification Pack — сборка и пакет артефактов.

## Definition of Done (Project Gates)

**GATE A — Contracts:**
- protocol_v1.md + error_codes.md не противоречат друг другу.
- Тесты: test_contract_api.py, test_validation.py.

**GATE B — Money Safety:**
- Redis idempotency (clientRequestId cache) + per-player lock работают.
- Тесты: test_idempotency.py, test_idempotency_conflict.py, test_locking.py.

**GATE C — RNG & Repro:**
- Seeded режим воспроизводим.
- Есть 2–3 snapshot кейса (seed -> expected reveal grid).
- Тесты: test_rng_snapshots.py.

**GATE D — Liability:**
- Hard cap 25000x enforced, isCapped/capReason корректны.
- Тесты: test_caps.py.

**GATE E — Scenario & Events:**
- Порядок событий соответствует SCENARIO_V1.md.
- Event System (BOOST/RAGE/EXPLOSIVE + Spotlight/Hype Mode если включены) реализован без "заднего" влияния на RNG.
- Тесты: test_event_ordering.py + (при наличии) test_event_rate_limits.py.

**GATE F — Release Readiness:**
- make test зелёный, docker compose up/down без ошибок.
- Есть release/cert pack (план 16) и runbook.

## Addendum: Rage Mode (Feedback)
- Base game must include Afterparty Meter -> Rage Mode (x2+) to avoid monotony and add “events/explosions/boosts”.

## Addendum: Event System + Scenario
- Implement Event System (BOOST/RAGE/EXPLOSIVE) as a spec: `EVENT_SYSTEM.md`.
- Add scenario script: `SCENARIO_V1.md` (timeline + finale paths).

## Addendum: Analyst Audit — Juice Layer
- Spotlight Wilds (random base-game modifier) — базовая вариативность в BASE.
- Hype Mode (ante bet) — игрок включает "буст" (+cost, +bonus chance) по контракту.
- Big Win tiers (Big/Mega/Epic) — чёткие развязки с Reduce Motion правилами.
- Velvet Rope teaser — честная антиципация при 2 Scatters (Turbo выключает длинные тизеры).
