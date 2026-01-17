# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical: Laws-as-Code

**READ FIRST (Source of Truth):** `LAWS_INDEX.md` — then open every referenced file and follow them strictly.

This repository uses contract-driven development. All behavior must be derived from spec files ("laws").

### Source of Truth (MUST)
Read these in order before writing or changing code:
- `LAWS_INDEX.md`
- `protocol_v1.md`
- `error_codes.md`
- `GAME_RULES.md`
- `EVENT_SYSTEM.md`
- `SCENARIO_V1.md`
- `UX_ANIMATION_SPEC.md`
- `TELEMETRY.md`
- `CONFIG.md`
- `RNG_POLICY.md`
- `MEMORY_BANK/`
- `stake_docs/` (local copy of Stake Engine docs, if present)

### Non-negotiable
1. **No guessing.** If any spec is missing or contradicts another: create `ISSUE.md` with exact file + section references and **STOP**.
2. **API contract is strict.** HTTP endpoints, request/response schemas, field names/types, and error bodies must match `protocol_v1.md` exactly. **Do not add fields.**
3. **Redis safety is mandatory.** Implement idempotency using `clientRequestId` and per-player locking that returns `ROUND_IN_PROGRESS` exactly as defined in `error_codes.md`. Never double-charge.
4. **Math safety is mandatory.** Enforce caps and modes exactly per `GAME_RULES.md` and `CONFIG.md`.
5. **Event & UX correctness is mandatory.** Backend events must follow `EVENT_SYSTEM.md` and the scenario ordering/timings contract from `SCENARIO_V1.md`. Frontend timing/FX rules must follow `UX_ANIMATION_SPEC.md`. Do not reorder backend events to “look nicer”.
6. **No “done” until tests are green.** Do not claim completion until `make test` is GREEN with no skipped contract/idempotency/locking tests.

### Stake spec validation gates (MUST PASS)

These are iteration gates. Every change must keep these passing.

**Backend gates**
- `make test` (must be fully green; no skipped contract/idempotency/locking tests)
- Docker health:
  - `make up`
  - `curl -s http://localhost:8000/health` must return `{ "ok": true }` (or the repo’s defined health JSON)
  - `make down`

**Contract gates**
- `/init` and `/spin` must validate and behave exactly as in `protocol_v1.md`.
- Errors must match `error_codes.md` (HTTP status + body shape + code).

**Integrity gates**
- Idempotency: same `clientRequestId` returns identical cached response.
- Locking: concurrent spins for same player return `ROUND_IN_PROGRESS`.
- Caps: max win / multipliers are enforced exactly per `GAME_RULES.md` and `CONFIG.md`.

**Docs / approval readiness gates (if stake docs exist locally)**
- If `stake_docs/` is present, keep it non-empty and consistent. If the repo contains `scripts/sync_stake_docs.sh`, run it when updating docs.
- Do not introduce requirements that contradict local Stake docs. If conflict is found: write `ISSUE.md` and stop.

## Commands

```bash
make install    # Install backend deps (once, creates venv)
make up         # Start Docker (redis + backend)
make down       # Stop Docker
make test       # Run pytest
make dev        # Local dev server with hot reload (port 8000)
make clean      # Remove containers, caches
```

Run single test:
```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_health.py -v
```

## Architecture

**Stack:** FastAPI (Python 3.12) + Redis + Frontend: TypeScript + Vue 3 + Vite + Pixi v8 (pixi/layout, pixi/sound) + Vue-Pixi + PixiSpine v8 + i18next/vue-i18n (+ GSAP optional)

**Request flow:**
1. Client sends `X-Player-Id` header (required) + `clientRequestId` (idempotency)
2. Backend validates, acquires Redis lock per player
3. Game engine generates `events[]` array
4. Client plays events sequentially

**Contract → Code mapping:**
| Contract | Implementation |
|----------|----------------|
| `protocol_v1.md` | `backend/app/protocol.py` |
| `error_codes.md` | `backend/app/errors.py` |
| `CONFIG.md` | `backend/app/config.py` |
| `GAME_RULES.md` | `backend/app/logic/engine.py` |
| `RNG_POLICY.md` | `backend/app/logic/rng.py` |

**Events pipeline order:** reveal → spotlightWilds → winLine → eventStart → enterFreeSpins → heatUpdate → bonusEnd → eventEnd → winTier

## Key Invariants

- All wins capped at `MAX_WIN_TOTAL_X = 25000` (from CONFIG.md)
- Same `clientRequestId` must return identical cached response
- Production RNG: cryptographically secure, no fixed seed
- Test RNG: deterministic with logged seed for reproducibility
