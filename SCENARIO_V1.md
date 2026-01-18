# SCENARIO V1 — VIP AFTERPARTY (TIMELINE + UX CONTRACT)

Цель: зафиксировать “поскриптовый” луп и места для событий/развязок так, чтобы команда и агенты воспроизводили одинаковый UX.

Ориентация: Mobile First (9:16). Темп: быстрый. Skip/Turbo: всегда доступны.

## Global Timing Targets (Normal Mode)
- Spin cycle (start -> final stop): 0.9–1.2s
- Win text popup (small win < 5x): <= 0.4s
- Win presentation (mid win 5x–20x): 0.8–1.2s
- Big Win (>=20x): 2.5–3.5s, но **всегда скипаемо**
- Event FX (BOOM/fireworks): <= 0.5s, скипаемо

## Global Rules
- Client всегда проигрывает backend `events[]` по очереди (EventQueue).
- Skip ускоряет анимации (timeScale), но не меняет порядок событий.
- TURBO: отключает декоративные FX (см. UX_ANIMATION_SPEC.md).

---

## Scene A: Autoplay Setup (как референс Smells Like Crypto)
00:00–00:01 Игрок открывает AUTOPLAY панель.
- Presets: 10 / 50 / 100
- START запускает автоспины.
00:01–00:02 Панель закрывается, Spin превращается в счётчик оставшихся спинов.

---

## Scene B: Base Game Loop (повторяется)
### B1) Spin Start
T+0ms
- UI: Spin pressed feedback мгновенно (<=50ms)
- Reels: сильный blur/motion
- Audio: короткий “click/impulse”

### B2) Reel Stop
T+600–1000ms
- Stop слева направо
- Bounce (упругость) на остановке

### B3) Result (No Win)
Если win_x = 0:
- Нет долгих пауз. Следующий спин доступен сразу.
- NOTE: Rage Mode is now triggered by Afterparty Meter (meter-based), NOT deadspins.
  - See GAME_RULES.md and CONFIG.md (`AFTERPARTY_*` keys) for meter mechanics.
  - When `afterparty_meter >= AFTERPARTY_METER_MAX`, Rage triggers on next BASE spin.

### B4) Result (Small/Mid Win)
Если win_x > 0:
- Dimming невыигрышных символов
- Win popup на поле `+amount` (обязателен)
- Если win_x <= 2: увеличивать `smallwins_streak`, иначе сбрасывать.
- Если `smallwins_streak` достиг `BOOST_TRIGGER_SMALLWINS`:
  - backend стартует Boost событие на следующие `BOOST_SPINS` спинов.

### B5) Explosive Trigger (threshold win)
Если win_x >= EXPLOSIVE_TRIGGER_WIN_X:
- backend эмитит `eventStart(type="explosive", reason="win_threshold", durationSpins=EXPLOSIVE_SPINS)`
- фронт показывает BOOM overlay + короткий fireworks (<=500ms, скипаемо)
- В TURBO — только stamp + короткая подсветка (<=300ms)

---

## Scene C: Rage Mode (x2+) — Afterparty Meter Based
Rage запускается только в BASE (не в Free Spins) when Afterparty Meter fills.
- Trigger: `afterparty_meter >= AFTERPARTY_METER_MAX` (from CONFIG.md)
- Баннер: "RAGE x2" (x{multiplier} из события)
- Длительность: `AFTERPARTY_RAGE_SPINS` (from CONFIG.md) + заканчивается `eventEnd(type="afterpartyRage")`
- Математика: win каждого rage-спина умножается на `AFTERPARTY_RAGE_MULTIPLIER` (from CONFIG.md)
- Cooldown: `AFTERPARTY_RAGE_COOLDOWN_SPINS` before meter can refill
- FX: более жирные подсветки, но без обмана.

---

## Scene D: Bonus (Free Spins + Heat Meter)
### D1) Enter Bonus
- Trigger: 3+ scatter (или BUY_FEATURE)
- Event: `enterFreeSpins(count=10)` + `heatUpdate(level=1)`

### D2) Free Spins Loop
- Heat обновляется ДО показа выигрыша (`heatUpdate` -> then win).
- При каждом выигрыше heat+1 (до max, см. GAME_RULES.md).

### D3) Finale Paths (минимум 2 развязки — MUST)
В конце бонуса backend обязан выбрать `finale_path` и залогировать `bonus_end`:

**Finale Path A — upgrade**
- Условие: heatLevel достигал MAX_HEAT_MULT (например 10) хотя бы 1 раз.
- Эффект: “Afterhours Encore” — +3 Encore Spинa (без изменения cap), плюс финальный fireworks.
- Логирование: `bonus_end.finale_path="upgrade"`

**Finale Path B — multiplier**
- Условие: в бонусе был хотя бы один big win (win_x >= 20).
- Эффект: “Final Count Up” — применить финальный множитель x2 к сумме бонуса (capped).
- Логирование: `bonus_end.finale_path="multiplier"`

**Fallback — standard**
- Иначе обычное завершение.
- Логирование: `bonus_end.finale_path="standard"`

---

## Scene E: Post-round UI
- Total Win перетекает в баланс.
- История раунда доступна через roundId (audit trace).
