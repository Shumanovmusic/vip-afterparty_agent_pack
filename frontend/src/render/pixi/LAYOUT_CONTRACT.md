# Layout Contract (Pixi Reels)

## Coordinate Spaces (Screen, Stage, Reels Local)
- **Screen**: CSS pixels (browser viewport) used by Vue layout.
- **Stage**: Pixi root coordinates (app.stage), safe-area offset applied once by `PixiStage`.
- **Reels Local**: `reelsRoot` local coordinates, where reels grid, frame, and mask live.

## Single Source of Truth (only PixiReelsRenderer.layout may set positions/mask/frame)
- The only method that positions reels or updates the frame/mask is `PixiReelsRenderer.layout()`.
- Other code may request layout via `updateLayout()`, which delegates to `layout()`.

## Offsets Rule (offsetX/offsetY applied ONLY to reelsRoot.position)
- `offsetX` / `offsetY` are applied exactly once: `reelsRoot.position.set(offsetX, offsetY)`.
- `reelsViewport` and `reelsContainer` stay in reels-local space (no extra centering).

## Resizing Rule (layout called once per resize; no re-entrancy)
- Layout changes flow through a single call to `layout()`.
- Re-entrant calls are guarded and logged.

## Mask Rule (mask rect = reelCount*symbolW by visibleRows*symbolH, in reelsViewport coords)
- Mask rect dimensions are `reelCount * symbolWidth` by `visibleRows * symbolHeight`.
- Mask is drawn at `(0, 0)` in `reelsViewport` coordinates.

## Manual Smoke Checklist
- Resize the window continuously for 5 seconds (drag edge rapidly).
- Orientation change (mobile emulation in DevTools: toggle portrait ↔ landscape).
- Toggle motion prefs (if available).
- Run 20 spins.
- Enter bonus (scatter).
- Verify frame/reels remain centered and mask shows 5 reels.
- **Console gate**: Verify no `[LAYOUT GUARD]` or `[LAYOUT ASSERT FAILED]` warnings/errors.
