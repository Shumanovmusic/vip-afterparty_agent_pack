# VIP Afterparty — Agent-First Repo Pack (Auto-Claude)

Структура репозитория настроена так, чтобы агент работал как инженер и не фантазировал.

## Quick Start

```bash
# Install backend dependencies
make install

# Run with Docker
make up

# Run tests
make test

# Development mode (hot reload)
make dev
```

## Project Structure

```
.
├── backend/           # FastAPI RGS server
│   ├── app/
│   │   ├── main.py    # Endpoints: /health, /init, /spin
│   │   ├── config.py  # Settings from CONFIG.md
│   │   ├── errors.py  # Error codes from error_codes.md
│   │   ├── protocol.py # Models from protocol_v1.md
│   │   └── logic/     # Game engine (TODO)
│   └── tests/
├── frontend/          # Vue 3 + PixiJS client (TODO)
├── MEMORY_BANK/       # Project context and laws
├── PLANS/             # 16 subplans
├── TASKS/             # Task matrix
└── stake_docs/        # Stake documentation library
```

## Source of Truth (Contracts)

| File | Description |
|------|-------------|
| `protocol_v1.md` | HTTP API contract (endpoints, request/response schemas) |
| `error_codes.md` | Error registry with HTTP status mapping |
| `CONFIG.md` | Feature flags and key numbers |
| `GAME_RULES.md` | Payout rules, max win, anticipation rules |
| `RNG_POLICY.md` | Seeding and reproducibility |
| `EVENT_SYSTEM.md` | Event types and triggers |
| `SCENARIO_V1.md` | UX timeline and scene flow |
| `UX_ANIMATION_SPEC.md` | Bounce / Reduce Motion / Turbo / Skip |
| `TELEMETRY.md` | Events and metrics |

## API Endpoints

| Endpoint | Status | Description |
|----------|--------|-------------|
| `GET /health` | ✅ Ready | Health check |
| `GET /init` | 🚧 501 | Game initialization |
| `POST /spin` | 🚧 501 | Execute spin |

See `protocol_v1.md` for full API specification.
