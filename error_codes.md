# Error Codes Registry (VIP Afterparty) — V1.0

All error responses MUST use the body shape defined in `protocol_v1.md`:

```json
{
  "protocolVersion": "1.0",
  "error": {
    "code": "SOME_CODE",
    "message": "Human readable message",
    "recoverable": true
  }
}
```

## Codes

| Code | HTTP Status | Description | Recoverable | Frontend Action |
|------|-------------|-------------|-------------|-----------------|
| `INVALID_REQUEST` | 400 | Malformed JSON, missing fields, missing X-Player-Id, invalid enum values. | false | Show "Technical error" and stop. No retry. |
| `INVALID_BET` | 400 | betAmount not in allowedBets from /init. | false | Show "Bet not allowed". Disable spin until bet changed. |
| `FEATURE_DISABLED` | 409 | Client requested feature that server config disabled (e.g., BUY_FEATURE or Hype Mode). | false | Hide/disable feature UI; show toast. |
| `INSUFFICIENT_FUNDS` | 402 | Platform/wallet debit rejected (or server-side balance check failed). | true | Open Deposit / Low balance modal. Do not auto-retry. |
| `ROUND_IN_PROGRESS` | 409 | Concurrency lock is active for this playerId. | true | Retry after 500ms, max 3 attempts (same requestId). |
| `IDEMPOTENCY_CONFLICT` | 409 | Same clientRequestId used with different payload (bet/mode). | false | Log and force page reload. Do not retry. |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests per player/IP. | true | Wait 1s then retry (same requestId), max 2. |
| `MAINTENANCE` | 503 | Server intentionally unavailable (deploy/maintenance). | true | Show maintenance screen; retry after 5–10s. |
| `INTERNAL_ERROR` | 500 | Unhandled backend exception. | true | Show "Technical error". Auto-retry allowed (same requestId) with backoff 1s/2s/4s, max 3. |
| `NOT_IMPLEMENTED` | 501 | Endpoint exists but logic not yet implemented (scaffold only). | false | Show "Coming soon". Do not retry. |

## Frontend Retry Policy (MUST)

- Retry is ONLY allowed for: `ROUND_IN_PROGRESS`, `RATE_LIMIT_EXCEEDED`, `INTERNAL_ERROR` and network timeouts.
- Retry MUST use the SAME `clientRequestId`.
- For `INSUFFICIENT_FUNDS`: no auto-retry.

## Logging Requirement (MUST)

**Client MUST log:**
- `error.code`
- `httpStatus`
- `clientRequestId`
- `roundId` (if present)

**Server MUST log structured:**
- `SPIN_REQ`, `SPIN_RES`, `SPIN_ERR` with `requestId`, `playerId`, `executionTimeMs`
