# Architecture Overview

## System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  Vue 3 + PixiJS v8 + PixiSpine                              │
│  - Renders events[] from /spin response                      │
│  - Sends X-Player-Id header                                  │
│  - Uses clientRequestId for idempotency                      │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS / JSON
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI)                         │
│  - GET /init    → Configuration + restore state              │
│  - POST /spin   → Game round execution                       │
│  - GET /health  → Health check                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        ▼                              ▼
┌───────────────┐              ┌───────────────┐
│    Redis      │              │  Game Engine  │
│  - Locks      │              │  - RNG        │
│  - Idempotency│              │  - State      │
│  - State cache│              │  - Events     │
└───────────────┘              └───────────────┘
```

## Request Flow

### 1. Init Flow (`GET /init`)

```
Client → Backend
  ├─ Validate X-Player-Id header
  ├─ Check for unfinished round in Redis
  └─ Return configuration + restoreState (if any)
```

### 2. Spin Flow (`POST /spin`)

```
Client → Backend
  ├─ Validate X-Player-Id header
  ├─ Validate clientRequestId (idempotency)
  │   └─ If seen: return cached response
  ├─ Acquire player lock (Redis)
  │   └─ If locked: return ROUND_IN_PROGRESS
  ├─ Validate betAmount ∈ allowedBets
  ├─ Execute game round (RNG + rules)
  ├─ Generate events[]
  ├─ Cache response by clientRequestId
  ├─ Release lock
  └─ Return SpinResponse
```

## Data Flow

### Events Pipeline

Backend generates `events[]` in order per protocol_v1.md:

1. `reveal` - Grid symbols
2. `spotlightWilds` - Wild transformations (if any)
3. `winLine` - Win presentations
4. `eventStart` - Mode transitions (rage/boost/explosive)
5. `enterFreeSpins` - Bonus entry
6. `heatUpdate` - Meter progression
7. `bonusEnd` - Bonus completion
8. `eventEnd` - Mode exit
9. `winTier` - Celebration tier

Client plays events sequentially, respecting Skip/Turbo/ReduceMotion rules.

## Key Invariants

### From RNG_POLICY.md
- Production: cryptographically secure RNG, no fixed seed
- Test: deterministic RNG with logged seed for reproducibility

### From GAME_RULES.md
- All wins capped at `MAX_WIN_TOTAL_X = 25000`
- Anticipation only when mathematically valid
- Rage Mode multiplier applies before cap

### From protocol_v1.md
- Client ignores unknown fields (forward compatibility)
- Same `clientRequestId` returns identical response
- `X-Player-Id` required on all game endpoints

## Files → Code Mapping

| Contract File | Code Implementation |
|--------------|---------------------|
| `protocol_v1.md` | `backend/app/protocol.py` |
| `error_codes.md` | `backend/app/errors.py` |
| `CONFIG.md` | `backend/app/config.py` |
| `GAME_RULES.md` | `backend/app/logic/engine.py` (TODO) |
| `RNG_POLICY.md` | `backend/app/logic/rng.py` |
| `EVENT_SYSTEM.md` | `backend/app/logic/engine.py` (TODO) |
