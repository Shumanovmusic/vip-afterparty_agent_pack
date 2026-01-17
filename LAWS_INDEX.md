# LAWS INDEX (Source of Truth)

**READ FIRST: Open every file below and follow them strictly.**

## Protocol & Errors
- [protocol_v1.md](protocol_v1.md) — HTTP API contract (endpoints, request/response schemas)
- [error_codes.md](error_codes.md) — Error registry with HTTP status mapping

## Game Rules & Math
- [CONFIG.md](CONFIG.md) — Feature flags and key numbers
- [GAME_RULES.md](GAME_RULES.md) — Payout rules, max win, anticipation rules
- [RNG_POLICY.md](RNG_POLICY.md) — Seeding and reproducibility

## Events & Scenarios
- [EVENT_SYSTEM.md](EVENT_SYSTEM.md) — Event types, triggers, rate limits
- [SCENARIO_V1.md](SCENARIO_V1.md) — UX timeline and scene flow

## UX & Telemetry
- [UX_ANIMATION_SPEC.md](UX_ANIMATION_SPEC.md) — Bounce / Reduce Motion / Turbo / Skip
- [TELEMETRY.md](TELEMETRY.md) — Events and metrics to log

## Reference Directories
- [MEMORY_BANK/](MEMORY_BANK/) — Project context, architecture, decisions
- [TASKS/](TASKS/) — Task matrix
- [PLANS/](PLANS/) — Implementation plans
- [stake_docs/](stake_docs/) — Stake platform documentation

---

## Agent Instructions

Before starting any task:

1. Read `LAWS_INDEX.md` (this file)
2. Open and read every referenced file above
3. Follow contracts strictly — do not invent or guess
4. If information is missing, create `ISSUE.md` and STOP
