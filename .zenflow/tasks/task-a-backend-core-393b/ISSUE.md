# ISSUE: Missing Source of Truth Files Block Task A

## Summary
Task A (Backend Core) cannot proceed because critical Source of Truth files referenced in the task specification do not exist in the repository.

## Missing Files

### 1. `protocol_v1.md` (CRITICAL)
**Required by task for:**
- GET /init endpoint specification (exact response schema)
- POST /spin endpoint specification (exact request/response schema)
- `protocolVersion` field value
- `events[]` ordering contract
- `nextState` structure definition

**Impact:** Cannot implement endpoints without knowing the exact API contract (request/response schemas, field names, types, required vs optional fields).

### 2. `error_codes.md` (CRITICAL)
**Required by task for:**
- Error response body shape for /spin
- Standard error codes and messages
- HTTP status code mappings

**Impact:** Cannot implement proper error handling and test "error body shape" as required.

## Existing Context
From available documents, I can infer some requirements:
- Backend uses FastAPI (Python 3.12)
- Redis for idempotency/locking
- Events include: `meterUpdate`, `enterRageMode`, `exitRageMode`, `eventStart`, `eventEnd`, etc.
- Configuration values are defined in `CONFIG.md`
- Game rules in `GAME_RULES.md`, `SCENARIO_V1.md`
- RNG policy in `RNG_POLICY.md`

However, the **exact HTTP API contract** (endpoints, request/response schemas, field names, error formats) is **not specified** in any existing document.

## Questions Requiring Decisions

### For `/init` endpoint:
1. What is the exact URL path? (GET /init? GET /api/v1/init? GET /game/init?)
2. What query parameters are required/optional?
3. What is the exact response JSON schema?
4. What `protocolVersion` value should be returned?

### For `/spin` endpoint:
1. What is the exact URL path?
2. What is the request body schema? (bet amount, session/player ID, hypeMode flag, etc.)
3. What is the exact response JSON schema?
4. What are all possible `events[]` types and their shapes?
5. What is the `nextState` object structure?

### For error handling:
1. What error codes should be used?
2. What is the error response body format?
3. What HTTP status codes map to which error conditions?

## Recommendation
Before Task A can proceed, please create:
1. `protocol_v1.md` - Full HTTP API contract specification
2. `error_codes.md` - Error code definitions and response format

Alternatively, provide answers to the questions above so I can document them and proceed.

## Status
**BLOCKED** - Awaiting specification decisions.
