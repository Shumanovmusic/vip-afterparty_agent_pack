# VIP Afterparty — Agent-First Repo Pack (Auto-Claude)

Структура репозитория настроена так, чтобы агент работал как инженер и не фантазировал.

- `MEMORY_BANK/` — единый контекст и «законы» проекта.
- `PLANS/` — 16 подпланов.
- `TASKS/` — матрица задач.
- `stake_docs/` — локальная библиотека Stake-доков.

Контрактные артефакты (то, что агент обязан читать и соблюдать):
- `CONFIG.md` — флаги и ключевые числа.
- `GAME_RULES.md` — правила выплат, max win, анти-обманные правила anticipation.
- `RNG_POLICY.md` — сидирование и воспроизводимость.
- `UX_ANIMATION_SPEC.md` — bounce / Reduce Motion / Turbo / Skip.
- `TELEMETRY.md` — события и метрики.

## New Contracts (Variety Layer)
- `EVENT_SYSTEM.md`
- `SCENARIO_V1.md`
