# 16 подпланов (иерархия работ)

1) Foundation — структура, команды, правила.
2) Repo Hygiene — стиль, хуки, CI.
3) Stake Docs Library — локальные доки Stake + индекс.
4) Memory Bank — законы/решения/глоссарий.
5) API Contracts — контракт API + коды ошибок.
6) RNG Policy — сидирование, воспроизводимость симуляций (`RNG_POLICY.md`).
7) Math Rules — max win, частоты, правила выплат (`GAME_RULES.md`, `CONFIG.md`).
8) State Machine + Idempotency — состояния, ретраи, анти-дубли.
9) Frontend Shell — сцены и базовый UI.
10) Rendering + Animation — Pixi/Spine, bounce, Reduce Motion/Turbo/Skip (`UX_ANIMATION_SPEC.md`).
11) Audio — звук, политика громкости/событий.
12) i18n — словари и переключение.
13) Telemetry + Logs — события и метрики (`TELEMETRY.md`).
14) Security + Abuse Controls — лимиты, валидации, анти-фрод.
15) Testing + Simulation — тесты, симуляции, отчёты.
16) Release + Certification Pack — сборка и пакет артефактов.

## Addendum: Rage Mode (Feedback)
- Base game must include Afterparty Meter -> Rage Mode (x2+) to avoid monotony and add “events/explosions/boosts”.

## Addendum: Event System + Scenario
- Implement Event System (BOOST/RAGE/EXPLOSIVE) as a spec: `EVENT_SYSTEM.md`.
- Add scenario script: `SCENARIO_V1.md` (timeline + finale paths).

## Addendum: Analyst Audit — Juice Layer
- Spotlight Wilds (random base-game modifier) + Hype Mode (ante bet) + Big Win tiers + Velvet Rope teaser.
- Specs live in CONFIG.md, GAME_RULES.md, UX_ANIMATION_SPEC.md, EVENT_SYSTEM.md, SCENARIO_V1.md.
