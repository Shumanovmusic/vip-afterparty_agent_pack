# STACK (Source of Truth)

## Frontend (Fixed)
- JavaScript / TypeScript
- Vue 3
- Vite
- PixiJS v8 (`@pixi/layout`, `@pixi/sound`)
- `vue-pixi`
- PixiSpine v8
- Localization: `i18next` + `vue-i18n` (messages and UI strings must be localizable)
- GSAP — опционально (может быть удалён; базовая анимация должна жить на Pixi ticker + Spine)

## Backend (Fixed)
- Python 3.12
- FastAPI
- Redis (локи, идемпотентность)

## Platform Notes
- Rust оптимизатор/компоненты Stake считаются внешней платформой (не часть репозитория игры).

## Принцип
- Никакой «магии»: всё через Memory Bank и контракты.
