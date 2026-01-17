# VIP Afterparty Frontend

## Stack (from STACK.md)
- TypeScript
- Vue 3
- Vite
- PixiJS v8 (@pixi/layout, @pixi/sound)
- vue-pixi
- PixiSpine v8
- i18next + vue-i18n (localization)

## Setup

```bash
# TODO: Initialize Vue 3 + Vite project
npm create vite@latest . -- --template vue-ts
npm install pixi.js @pixi/layout @pixi/sound
```

## Protocol Integration

See `../protocol_v1.md` for API contract.

Client must:
- Send `X-Player-Id` header on all requests
- Use `clientRequestId` (UUIDv4) for idempotency
- Handle events[] in order per protocol spec
- Ignore unknown fields (forward compatibility)
