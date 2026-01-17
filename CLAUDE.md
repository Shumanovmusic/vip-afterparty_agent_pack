# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## READ FIRST (Source of Truth)

Open and read each file **in this exact order** before starting any task:

1. `LAWS_INDEX.md` — master index of all law files
2. `protocol_v1.md` — HTTP API contract (endpoints, request/response schemas)
3. `error_codes.md` — error registry with HTTP status mapping
4. `GAME_RULES.md` — payout rules, max win cap (25000x), anticipation rules
5. `EVENT_SYSTEM.md` — event types, triggers, rate limits
6. `SCENARIO_V1.md` — UX timeline and scene flow
7. `TELEMETRY.md` — events and metrics to log
8. `CONFIG.md` — feature flags and key numbers
9. `RNG_POLICY.md` — seeding and reproducibility
10. `MEMORY_BANK/` — project context, architecture, decisions
11. `stake_docs/` — Stake platform documentation (if present)

---

## NON-NEGOTIABLE RULES

1. **No guessing.** If a spec is unclear, missing, or contradicting: create `ISSUE.md` with exact file + section references and **STOP**.

2. **API must match `protocol_v1.md` exactly.** Do not add, remove, or rename fields. Unknown fields must be ignored by client per protocol spec.

3. **Implement Redis idempotency and per-player lock exactly per `error_codes.md`:**
   - Same `clientRequestId` must return identical cached response
   - `ROUND_IN_PROGRESS` (409): concurrency lock active; client retries with same requestId
   - `IDEMPOTENCY_CONFLICT` (409): same clientRequestId with different payload is fatal

4. **Enforce caps and modes per `GAME_RULES.md` and `CONFIG.md`:**
   - Hard cap: `MAX_WIN_X = 25000` (from CONFIG.md)
   - Hype Mode: cost increase = `HYPE_MODE_COST_INCREASE`; payouts from base bet only
   - Rage Mode: multiplier from `RAGE_MULTIPLIER`, still capped at MAX_WIN_X

5. **Events must follow `EVENT_SYSTEM.md` and scenario ordering/timings from `SCENARIO_V1.md`:**
   - Do NOT reorder events for visual convenience
   - Client must play `events[]` in the order returned by backend
   - Skip/Turbo affects timeScale, not event order

6. **No "done" until `make test` is fully green** with no skipped contract/idempotency/locking tests.

---

## Stake Spec Validation Gates (MUST PASS)

### Gate 1: Backend Health
```bash
make install   # once
make test      # all tests green, zero skipped
make up        # containers start
curl -s http://localhost:8000/health | grep -q '"status":"ok"'
make down
```

### Gate 2: Contract Compliance
- `/init` response matches `protocol_v1.md` schema exactly
- `/spin` response matches `protocol_v1.md` schema exactly
- All error responses match `error_codes.md` (code, HTTP status, recoverable flag)

### Gate 3: Integrity
- Idempotency: same `clientRequestId` returns cached response
- Locking: concurrent spins for same player return `ROUND_IN_PROGRESS` (409)
- Cap enforcement: no payout exceeds `MAX_WIN_X = 25000`

### Gate 4: Docs/Approval Readiness
- If `stake_docs/` exists, it must remain non-empty
- If `scripts/sync_stake_docs.sh` exists, run it when updating docs
- If implementation conflicts with `stake_docs/` requirements → create `ISSUE.md` and **STOP**

---

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

---

## Architecture

**Backend Stack:** FastAPI (Python 3.12) + Redis

**Frontend Stack:** TypeScript + Vue 3 + Vite + Pixi v8 (pixi/layout, pixi/sound) + Vue-Pixi + PixiSpine v8 + i18next/vue-i18n (+ GSAP optional)

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
| `EVENT_SYSTEM.md` | `backend/app/logic/events.py` |
| `SCENARIO_V1.md` | `frontend/src/game/EventQueue.ts` |
| `TELEMETRY.md` | `backend/app/telemetry.py` |

**Events pipeline order:**
```
reveal → spotlightWilds → winLine → eventStart → enterFreeSpins → heatUpdate → bonusEnd → eventEnd → winTier
```

---

## Key Invariants

- All wins capped at `MAX_WIN_X = 25000` (from CONFIG.md)
- Same `clientRequestId` must return identical cached response
- Production RNG: cryptographically secure, no fixed seed
- Test RNG: deterministic with logged seed for reproducibility
- Events: client MUST play in order; Skip affects timeScale only, not sequence
- Finale paths: `upgrade | multiplier | standard` — must be logged in `bonus_end`

---

## Reference Directories

| Directory | Purpose |
|-----------|---------|
| `MEMORY_BANK/` | Project context, architecture decisions |
| `TASKS/` | Task matrix |
| `PLANS/` | Implementation plans |
| `stake_docs/` | Stake platform documentation |

---

## When Stuck

If you cannot proceed due to missing or contradictory information:

1. Create `ISSUE.md` with:
   - Exact file and section reference
   - What is missing or contradicting
   - Proposed resolution (if any)
2. **STOP** — do not guess or invent.
