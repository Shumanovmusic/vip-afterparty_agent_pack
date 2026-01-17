# UX & ANIMATION SPEC (CONTRACT)

Этот документ описывает презентацию результата спина и обязательные режимы для длинных сессий.

## Термины
- **Post-spin bounce**: “резиновое” подпрыгивание/деформация символов после остановки барабанов.
- **Reduce Motion**: режим снижения движения и визуальной нагрузки.
- **Turbo Spin**: ускоренный режим спинов для “много часов подряд”.
- **Skip**: пропуск анимаций без изменения исхода.

## Дефолты (из `CONFIG.md`)
- POST_SPIN_BOUNCE_DEFAULT = ON
- REDUCE_MOTION_DEFAULT = OFF
- TURBO_SPIN_DEFAULT = OFF
- ALLOW_SKIP_ANIMATIONS = ON

## Правила Reduce Motion (MUST)
Когда `REDUCE_MOTION=ON`:
1) **Полностью отключить** post-spin bounce.
2) Отключить squash&stretch, “резину”, вторичные декоративные частицы.
3) Любая анимация празднования выигрыша:
   - MUST быть пропускаемой (Skip)
   - MUST заканчиваться автоматически быстро: **<= 600ms**, затем переход в idle/готовность к следующему спину.
4) Любые пост-спин анимации, не несущие информации о результате, MUST быть удалены.

## Правила Turbo Spin (MUST)
Когда `TURBO_SPIN=ON`:
1) Post-spin bounce MUST быть OFF.
2) Декоративные пост-спин анимации MUST быть OFF.
3) Разрешён только информативный фидбек:
   - подсветка линий/комбинаций выигрыша **<= 300ms**
   - подсветка scatter/wild **<= 300ms**
4) Если `ALLOW_SKIP_ANIMATIONS=ON`, то любое “celebration” MUST быть скипаемо мгновенно.

## Правила Skip (MUST)
Если `ALLOW_SKIP_ANIMATIONS=ON`:
1) Пользовательский ввод во время celebration/подсветок MUST переводить игру в финальное состояние презентации результата.
2) Skip **никогда** не меняет исход (только длительность презентации).

## Acceptance Criteria (MUST)
1) При `REDUCE_MOTION=ON` отсутствует bounce после остановки барабанов (0 кадров bounce-анимации).
2) При `TURBO_SPIN=ON` отсутствуют декоративные пост-эффекты, а информативные подсветки укладываются в лимиты времени.
3) Настройки сохраняются локально и применяются без перезапуска приложения.

## CELEBRATION TIERS (CONTRACT)
Цель: дать игрокам “фейерверки/взрывы”, сохранив совместимость с `Reduce Motion` и `Turbo Spin`.

### Tiers (по win_x)
1) **Big Win (20x - 200x)**:
   - Visual (Normal): золотые монеты/искры снизу экрана, короткое конфетти.
   - Audio (Normal): короткий “sting” победы.
   - Reduce Motion: только текст `BIG WIN` + лёгкое затемнение фона, **без** частиц.
2) **Mega Win (200x - 1000x)**:
   - Visual (Normal): конфетти + усиленное свечение + краткие вспышки.
   - Audio (Normal): более громкий sting.
   - Reduce Motion: текст `MEGA WIN`, фон затемняется, **без** вспышек/строба.
3) **Epic Win (1000x+)**:
   - Visual (Normal): фейерверки + шампанское + опционально screen shake.
   - Audio (Normal): “anthem” победы.
   - Reduce Motion: текст `EPIC WIN`, статичный золотой фон, **без** фейерверков/тряски.

### Compatibility (MUST)
- If `TURBO_SPIN=ON`: celebration tiers MUST быть упрощены до информативного текста + подсветки (см. лимиты Turbo).
- If `ALLOW_SKIP_ANIMATIONS=ON`: любые celebration MUST быть скипаемыми мгновенно.

## ANTICIPATION TEASER: "VELVET ROPE" (CONTRACT)
Цель: усилить ожидание бонуса, когда игрок “в одном шаге”, без обмана.

### Trigger (MUST)
- Если на спине выпало **ровно 2** `SCATTER` (и ещё есть шанс получить 3-й в этом же спине до полного стопа барабанов), включить teaser.

### Presentation (Normal)
- Audio: основной трек уходит под Low Pass (приглушение), добавляется “нарастающий гул/биение”.
- Visual: оставшиеся барабаны подсвечиваются рамкой “Velvet Rope” (красный неон), слегка замедляется остановка последнего барабана.
- Timing: продлить вращение на **1.5–2.0 сек** (только если `TURBO_SPIN=OFF`).

### Presentation (Reduce Motion / Turbo)
- If `REDUCE_MOTION=ON`: без фильтров/вспышек; допускается только статичная рамка + текст `ONE AWAY`.
- If `TURBO_SPIN=ON`: teaser MUST быть сокращён до <= 300ms и не удлинять спин.

### Telemetry (MUST)
- Логировать `teaser_used: boolean` и `teaser_type: velvet_rope` в `spin_result`.


## Rage Mode (x2+) — Animation & UX Contract

When backend emits `enterRageMode`, client MUST:
- Show banner: **RAGE x{multiplier}** (from event payload)
- Switch theme accents to aggressive (red neon / strobe) without changing math
- Add VFX:
  - fireworks/particles on big wins
  - comic-style BOOM on each win cluster
- Increase perceived speed:
  - reel start impulse stronger
  - reel stop bounce snappier
- Haptics policy:
  - Only on Rage entry and on Big Win (>= 20x base bet), never on every spin
- Skip policy:
  - Skip accelerates animations (timeScale), but does not drop events. Event order preserved.

When backend emits `exitRageMode`, client MUST:
- Fade out banner and return to previous vibe/theme
- Reset Rage VFX state cleanly (no leaking particles/sprites)

Optional (allowed):
- Short “rage sting” sound on entry; looped layer while active (must be stoppable on Reduce Motion / mute).


## EVENT FX RULES (MUST)
1) Любые “взрывы/фейерверки/BOOM”:
   - MUST быть <= 500ms в normal mode
   - MUST быть скипаемыми при ALLOW_SKIP_ANIMATIONS=ON
2) В TURBO_SPIN:
   - BOOM/фейерверки MUST быть OFF
   - допускается только короткий текст + подсветка <= 300ms
3) В REDUCE_MOTION:
   - BOOM/фейерверки MUST быть упрощены: без тряски, без резких вспышек, без резины
   - допускается статичный “stamp” (BOOM) + подсветка


## Teaser Mechanic: Velvet Rope (Anticipation)
Если выпало **ровно 2 Scatters** (и игра в BASE, не TURBO):
- Audio: применить low-pass filter к треку (приглушение), добавить нарастающий “hum/heartbeat”.
- Visual: подсветить оставшиеся барабаны красным неоном “Velvet Rope”.
- Timing: продлить вращение на `VELVET_ROPE_EXTRA_SPIN_SEC_MIN..MAX` секунд.
- Integrity: честно — только если реально 2 scatters уже на поле; не имитировать.
- TURBO: Teaser OFF.
- Reduce Motion: без резких вспышек; допускается только рамка и текст “One more…”.
