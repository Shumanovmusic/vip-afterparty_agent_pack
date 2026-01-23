# UX & ANIMATION SPEC (CONTRACT)

This document defines the "See → Understand → Celebrate" emotional curve for win presentation and compliance modes.

## Terminology

- **Post-spin bounce**: Elastic deformation of symbols after reel stop
- **Reduce Motion**: Minimal animation mode for accessibility
- **Turbo Spin**: Accelerated mode for extended sessions
- **Skip**: User-initiated acceleration without changing outcome
- **HIGHLIGHT**: Phase where winning cells are shown and understood
- **CELEBRATION**: Phase where tier-based overlays celebrate the win

---

## WIN PRESENTATION: EMOTIONAL CURVE (CONTRACT)

### Philosophy
The win presentation follows the "See → Understand → Celebrate" curve:
1. **SEE**: Player sees the final grid (reels stopped)
2. **UNDERSTAND**: Winning cells are highlighted, player comprehends the win
3. **CELEBRATE**: Tier-appropriate overlay confirms the magnitude

**Critical Rule**: Celebration overlay MUST NOT appear before HIGHLIGHT completes.
This prevents "popup jumpscare" where banners obscure what the player won.

### Win Tiers (Thresholds from CONFIG.md)

| Tier | Threshold (winX) | Description |
|------|------------------|-------------|
| SMALL | < 15x | No overlay, highlight only |
| BIG | 15x - 50x | Gold celebration |
| MEGA | 50x - 100x | Cyan celebration |
| EPIC | ≥ 100x | Magenta celebration |

---

## WIN SEQUENCE V2: PHASES (CONTRACT)

### Phase Timeline (relative to reel stop T=0)

```
STOP (T=0)
  ↓
SPOTLIGHT (T+0 to T+300ms max) — if triggered by backend event
  ↓
HIGHLIGHT (T+300 to T+1100ms) — min 800ms, must complete 1 cycle
  ↓
CELEBRATION (T+1100+) — Big/Mega/Epic banners allowed here
  ↓
RESET — clear all overlays, return to IDLE
```

### Phase 1: SPOTLIGHT (Optional, ≤300ms)
- **Trigger**: Backend emits `spotlightWilds` event
- **Visual**: Beam animation highlighting wild positions
- **Priority**: ALWAYS before HIGHLIGHT (never concurrent)
- **Turbo/ReduceMotion**: Disabled

### Phase 2: HIGHLIGHT (MANDATORY)

| Mode | Min Duration | Exit Condition |
|------|--------------|----------------|
| Normal | 800ms | Min time AND ≥1 WinLineHighlighter cycle |
| Turbo | 300ms | Min time AND ≥1 cycle |
| ReduceMotion | 300ms | Min time, no cycle requirement |

**During HIGHLIGHT:**
- DimOverlay active (losing cells alpha = 0.55)
- WinLineHighlighter runs on winning cells
- Count-up audio starts (if tier > SMALL)
- NO celebration banners visible

### Phase 3: CELEBRATION (Tier-Based)

| Tier | Normal (ms) | Turbo (ms) | Notes |
|------|-------------|------------|-------|
| SMALL | Skip | Skip | No overlay |
| BIG | 900 | 350 | Micro-version in turbo |
| MEGA | 1400 | 500 min | Must feel "big" |
| EPIC | 2200 | 700 min | Must feel "epic" |

**During CELEBRATION:**
- BigWin overlay visible with tier styling
- Count-up continues with pitch modulation
- Heavy particles (Turbo disables particles, keeps banner)
- Skip input → immediate complete

### Phase 4: RESET

- Clear DimOverlay (alpha → 0)
- Clear all glow filters
- Destroy win labels
- Stop all audio loops
- Return to IDLE state

---

## CANCEL & SKIP CONTRACT (MANDATORY)

### Interrupt Matrix

| Source | Token Increment | Cleanup Required |
|--------|-----------------|------------------|
| New spin click | Yes | Full |
| Auto-spin next | Yes | Full |
| Turbo toggle ON | No (duration change) | Partial (heavy VFX) |
| ReduceMotion toggle ON | No | Partial (particles, shake) |
| Route/unmount | Yes | Full |
| Stale result (new result arrives) | Yes | Full |
| Skip Stage 1 (accelerate) | No | None (4x speed) |
| Skip Stage 2 (complete) | Yes | Full |

### 2-Stage Skip Behavior

1. **First skip (Stage 1)**: Accelerate timeline to 4x speed, audio continues
2. **Second skip (Stage 2)**: Complete immediately, all audio/VFX stopped

### Idempotent Cleanup Checklist (MUST)

```typescript
interface CleanupTarget {
  emitters: ParticleEmitter[]      // clear() all
  audioLoops: string[]             // stopCoinRoll(), stopAllLoops()
  tickers: Ticker[]                // remove all animation callbacks
  tweens: GSAP.Tween[]             // kill() all active (if using GSAP)
  dimLayer: Container | null       // alpha → 0, then destroy
  glowFilters: Filter[]            // remove from display objects
  banners: Container[]             // hide/destroy
  winLabels: Text[]                // destroy
}
```

**Implementation**: `WinSequenceV2.cancel()` must:
1. Increment sequence token
2. Execute cleanup synchronously
3. Check `this.currentSeqId === expectedSeqId` before any async continuation

---

## DIM STRATEGY (CONTRACT)

### Overlay-Based Dim (Chosen Approach)

NOT per-sprite alpha (expensive, conflicts with blur/filters).

**Implementation:**
1. Create `DimOverlay` container with 15 semi-transparent rectangles (one per cell)
2. Winning cells: overlay alpha = 0 (transparent)
3. Losing cells: overlay alpha = 0.55 (darkened)
4. Color: `0x000000` with per-cell alpha

### Layer Order (bottom to top)

1. Reels container (symbols)
2. DimOverlay (losing cells only)
3. WinHighlights (glow/borders on winners)
4. WinLabels (floating amounts)
5. HUD (never dimmed)
6. CelebrationOverlay (banners)

### Dim Rules

- Dim applied strictly AFTER all reels stopped
- Dim removed in Reset phase
- HUD/Heat Meter NEVER dimmed (separate layer)
- Dim alpha: max 55% during Highlight, max 65% during Celebration

---

## SPOTLIGHT WINDOW (CONTRACT)

### Timing (relative to reel stop)

```
STOP (T=0)
  ↓
SPOTLIGHT (T+0 to T+300ms max) — if triggered by backend event
  ↓
HIGHLIGHT (T+300 to T+1100ms) — min 800ms, must complete 1 cycle
  ↓
CELEBRATION (T+1100+) — Big/Mega/Epic banners allowed here
```

### Priority Rules

1. Spotlight ALWAYS before Highlight (never concurrent)
2. If spotlightWilds event received: play beam animation ≤300ms
3. If no spotlight: Highlight starts at T+0
4. Frontend ONLY visualizes backend result — never invents transforms

### Spotlight Gating (from heat system)

- heat ≥ 10: 100% trigger
- heat ≥ 6: 15% trigger
- heat < 6: 0%
- Disabled in Turbo/ReduceMotion

---

## AUDIO CONTRACT (MANDATORY)

### Hook Integration

| Hook | Method | When |
|------|--------|------|
| Count-up start | `audioService.startCoinRoll()` | HIGHLIGHT phase start (if tier > SMALL) |
| Pitch modulation | `audioService.setCoinRollPitch(progress, turbo)` | During count-up, each frame |
| Count-up stop | `audioService.stopCoinRoll()` | Skip, Reset, or count complete |
| Tier stinger | `audioService.onWinTier(tier)` | CELEBRATION phase start |
| Emergency stop | `audioService.stopAll()` | Cancel/interrupt |

### Pitch Mapping

- Normal: 1.0 → 1.2 (20% increase over progress)
- Turbo: 1.0 → 1.1 (10% increase)
- Synth fallback: 180 BPM → 240 BPM

### Stop Conditions

- Skip Stage 2 → `stopCoinRoll()` immediate
- New spin → `stopAll()` via cleanup
- Reset phase → `stopCoinRoll()` after count complete

---

## LAYOUT CONSTRAINTS (MANDATORY)

### Desktop Cap

- Max grid width: 600px
- Apply via CSS `max-width` on `.reels-container`
- Center horizontally when capped

### iOS Safe Area

- Bottom: respect `env(safe-area-inset-bottom)` for HUD
- Top: respect `env(safe-area-inset-top)` for Heat Meter
- Use CSS `padding` not `margin`

### Small Height Devices (≤667px)

- Reduce Heat Meter height to 24px
- Reduce HUD font size to 14px
- No changes to reel size (already responsive)

### HUD Reserve Zone

- Bottom 80px reserved for HUD (never covered by dim/celebration)
- Heat Meter positioned above reels, never inside safe-area-top

---

## REDUCE MOTION RULES (MUST)

When `REDUCE_MOTION=ON`:

1. **Disable** post-spin bounce completely
2. **Disable** squash&stretch, elastic deformations, secondary particles
3. **Instant** count-up display (no animation)
4. **No** heavy particles (coin showers, confetti)
5. **No** screen shake
6. **Keep** text banners (static, no animation)
7. Max celebration duration: **≤600ms**, then auto-transition to idle

---

## TURBO SPIN RULES (MUST)

When `TURBO_SPIN=ON`:

1. Post-spin bounce MUST be OFF
2. Decorative post-spin animations MUST be OFF
3. Informative feedback only:
   - Win line highlight **≤300ms**
   - Scatter/wild highlight **≤300ms**
4. Readable blur (reduced motion blur vs normal)
5. Mega/Epic MUST still feel noticeable (min durations enforced)
6. Heavy particles disabled, banners kept

---

## SKIP RULES (MUST)

When `ALLOW_SKIP_ANIMATIONS=ON`:

1. User input during celebration MUST advance to final state
2. Skip **never** changes outcome (only presentation duration)
3. 2-stage skip: first accelerate, second complete
4. Audio cleanup MUST be immediate on Stage 2 skip

---

## CELEBRATION TIERS (CONTRACT)

### Tier Definitions (from CONFIG.md thresholds)

1. **Big Win (15x - 50x)**:
   - Visual (Normal): Gold rays, coins, short confetti
   - Audio (Normal): Short "sting" victory sound
   - ReduceMotion: Text `BIG WIN` only, light backdrop

2. **Mega Win (50x - 100x)**:
   - Visual (Normal): Cyan rays, enhanced glow, particles
   - Audio (Normal): Louder stinger, coin roll
   - ReduceMotion: Text `MEGA WIN`, backdrop, no particles

3. **Epic Win (≥100x)**:
   - Visual (Normal): Magenta rays, fireworks, optional shake
   - Audio (Normal): Victory anthem
   - ReduceMotion: Text `EPIC WIN`, static gold backdrop, no shake

### Compatibility (MUST)

- If `TURBO_SPIN=ON`: Tiers use micro-durations, particles disabled
- If `ALLOW_SKIP_ANIMATIONS=ON`: All celebrations skippable instantly

---

## ANTICIPATION TEASER: "VELVET ROPE" (CONTRACT)

### Trigger (MUST)

- Exactly 2 `SCATTER` symbols visible AND remaining reels still spinning
- Only in BASE game, not during TURBO

### Presentation (Normal)

- Audio: Main track low-pass filter, rising heartbeat
- Visual: Remaining reels highlighted with red neon "Velvet Rope"
- Timing: Extend spin by 1.5–2.0 seconds (if not TURBO)

### Presentation (Reduce Motion / Turbo)

- ReduceMotion: Static frame only, text "ONE AWAY"
- Turbo: Teaser ≤300ms, no spin extension

### Telemetry (MUST)

- Log `teaser_used: boolean` and `teaser_type: velvet_rope` in spin_result

---

## RAGE MODE ANIMATION (CONTRACT)

When backend emits `enterRageMode`:

- Show banner: **RAGE x{multiplier}**
- Switch theme to aggressive (red neon / strobe) without math changes
- Add VFX: fireworks/particles on big wins, comic-style BOOM
- Increase perceived speed: stronger reel impulse, snappier bounce
- Haptics: Only on Rage entry and Big Win (≥20x), never per spin

When backend emits `exitRageMode`:

- Fade out banner, return to previous theme
- Reset Rage VFX cleanly (no leaking particles/sprites)

### Skip Policy

- Skip accelerates animations (timeScale), does not drop events
- Event order preserved

---

## EVENT FX RULES (MUST)

1. "Explosions/fireworks/BOOM":
   - Normal mode: ≤500ms
   - Skippable when `ALLOW_SKIP_ANIMATIONS=ON`

2. Turbo mode:
   - BOOM/fireworks MUST be OFF
   - Text + highlight ≤300ms only

3. Reduce Motion:
   - BOOM/fireworks simplified: no shake, no flash, no elastic
   - Static "stamp" + highlight allowed

---

## ACCEPTANCE CRITERIA (MUST)

### Core Flow

- [ ] No banner appears before HIGHLIGHT min time (800ms normal, 300ms turbo)
- [ ] Winning combination visible and understandable before celebration
- [ ] At least 1 highlight cycle completes before celebration starts
- [ ] Skip Stage 1: animations 4x speed, audio continues
- [ ] Skip Stage 2: instant final amount, all audio/VFX stopped
- [ ] 20 consecutive spins: no ghost overlays/particles

### Motion Prefs

- [ ] ReduceMotion: no blur, no shake, no heavy particles, instant count-up
- [ ] Turbo: readable blur, shorter timings, Mega/Epic still noticeable

### Cancel/Interrupt

- [ ] New spin during highlight: clean cancel, no trails
- [ ] New spin during celebration: clean cancel, no trails
- [ ] Auto-spin rapid fire: no accumulation of overlays
- [ ] Component unmount: no console errors, no orphan audio

### Layout

- [ ] Desktop 1920x1080: grid ≤600px wide, centered
- [ ] iPhone 14 Pro (390x844): safe area respected
- [ ] iPhone SE (375x667): HUD readable, Heat Meter compact
- [ ] Landscape (844x390): layout doesn't break

### Settings Persistence

- [ ] Settings saved locally and applied without restart
- [ ] `REDUCE_MOTION=ON` → 0 frames of bounce animation
- [ ] `TURBO_SPIN=ON` → no decorative post-effects, timings enforced
