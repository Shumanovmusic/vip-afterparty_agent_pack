# ISSUE: Missing API Contract Definitions

**Status:** ✅ RESOLVED
**Created:** 2026-01-17
**Updated:** 2026-01-17
**Resolved:** 2026-01-17

---

## RESOLVED

The following contract files have been added to the repository root:

| File | Location | Status |
|------|----------|--------|
| `protocol_v1.md` | `./protocol_v1.md` | ✅ CREATED |
| `error_codes.md` | `./error_codes.md` | ✅ CREATED |

**Canonical location:** Repository root (`~/Documents/gamedev/vip-afterparty/`)

The scaffold initialization can now proceed.

---

## Previous Issue (Historical)

---

## Summary

The repository defines **game mechanics, events, telemetry, and config flags** comprehensively.
However, **no HTTP API contract** exists — endpoints, request/response shapes, error handling are unspecified.

---

## Missing Specifications for `protocol_v1.md`

### 1. HTTP Endpoints (CRITICAL)

| Missing Item | Question | Suggested Minimum Decision |
|--------------|----------|----------------------------|
| Init endpoint | `GET /init` or `POST /init`? Path format? | Define: `GET /api/v1/init` |
| Spin endpoint | `POST /spin` path? | Define: `POST /api/v1/spin` |
| Other endpoints | Balance? Cashout? History? | List required endpoints |

### 2. Request Schemas (CRITICAL)

**Init Request:**
- What parameters? `sessionId`, `playerId`, auth token?

**Spin Request:**
- Required fields: `bet`, `betMode` (NORMAL/HYPE)?
- Optional fields: `idempotencyKey`?
- What is the bet structure? `{ baseBet: number, currency: string }`?

### 3. Response Schemas (CRITICAL)

**Init Response:**
- Configuration shape? `{ allowedBets: [...], flags: {...}, balance: {...} }`?
- What exactly goes in `allowedBets`?

**Spin Response:**
- Wrapper shape: `{ roundId, events[], nextState, balance, error? }`?
- What is `nextState` structure? Meter values, mode flags?
- How are events[] ordered and typed?

### 4. Event Payload Shapes (CRITICAL)

Events are listed in EVENT_SYSTEM.md but payloads are incomplete:

| Event | Known Fields | Missing Fields |
|-------|--------------|----------------|
| `eventStart` | type, reason, durationSpins, multiplier? | Exact JSON schema |
| `eventEnd` | type, reason? | Exact JSON schema |
| `meterUpdate` | meter='afterparty', value | Wrapper shape? |
| `spotlightWilds` | positions | Positions format: `[{reel, row}]` or `[index]`? |
| `enterFreeSpins` | count | Additional fields? |
| `heatUpdate` | level | Max level? |
| `bonus_end` | finale_path | total_win, spins_played? |

### 5. Session & Authentication Model (CRITICAL)

| Missing Item | Question |
|--------------|----------|
| Auth mechanism | Token in header? Session cookie? |
| Session lifecycle | How is session created/validated? |
| Idempotency | How is `idempotencyKey` handled? Header or body? |

---

## Missing Specifications for `error_codes.md`

### 1. Error Code Registry (CRITICAL)

No error codes are defined anywhere. The following are industry-standard but NOT confirmed:

| Code | HTTP Status | Description | Frontend Action |
|------|-------------|-------------|-----------------|
| INVALID_REQUEST | 400? | Malformed request | ? |
| INVALID_BET | 400? | Bet validation failed | ? |
| INSUFFICIENT_FUNDS | 402? 400? | Balance too low | ? |
| ROUND_IN_PROGRESS | 409? | Previous round not finished | ? |
| RATE_LIMIT_EXCEEDED | 429? | Too many requests | ? |
| INTERNAL_ERROR | 500? | Server error | ? |
| MAINTENANCE | 503? | System unavailable | ? |

### 2. Error Body Shape (CRITICAL)

No specification for error response format:

```
Option A: { "error": { "code": "...", "message": "...", "details": {...} } }
Option B: { "code": "...", "message": "..." }
Option C: Other?
```

### 3. Error Handling Rules (CRITICAL)

- Should client retry on INTERNAL_ERROR?
- What's the rate limit window and threshold?
- Does MAINTENANCE include `retryAfter`?

---

## Forward Compatibility (Missing)

No specification for:
- Unknown field handling: "ignore unknown fields" rule?
- Version negotiation: How does client request protocol version?
- Deprecation policy?

---

## Recommended Actions

### Option A: Define Minimal Contract (Owner Decision Required)

Product/Tech lead should specify:

1. **Endpoint paths** (e.g., `/api/v1/init`, `/api/v1/spin`)
2. **Init response** minimal fields
3. **Spin request** required fields: `{ bet, betMode?, idempotencyKey? }`
4. **Spin response** wrapper: `{ roundId, events[], state, balance }`
5. **Error body** shape: `{ code, message, details? }`
6. **Error codes** list with HTTP status mapping

### Option B: Reference External RGS Spec

If this game integrates with Stake or another RGS platform:
- Point to their canonical API spec
- Document only game-specific extensions

---

## Files That Should Contain This Information

| Missing Spec | Suggested Location |
|--------------|-------------------|
| HTTP endpoints | `protocol_v1.md` (once defined) |
| Request/Response schemas | `protocol_v1.md` |
| Error codes | `error_codes.md` (once defined) |
| Session/Auth | `protocol_v1.md` or separate `AUTH.md` |

---

## Blocking Status

**Cannot proceed with `protocol_v1.md` or `error_codes.md` creation.**

The existing documentation defines:
- ✅ Game mechanics (GAME_RULES.md)
- ✅ Events to emit (EVENT_SYSTEM.md)
- ✅ Telemetry fields (TELEMETRY.md)
- ✅ Config flags (CONFIG.md)
- ✅ UX/Animation rules (UX_ANIMATION_SPEC.md)

But does NOT define:
- ❌ HTTP API contract
- ❌ Error registry
- ❌ Authentication model

**Next step:** Owner must provide minimal API decisions (see "Recommended Actions" above).
