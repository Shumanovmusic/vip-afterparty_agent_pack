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

## Mobile-First Layout Rules (Batch 6)

### Layout Constants
```
HORIZONTAL_MARGIN = 15px   // Each side (30px total)
TOP_MARGIN = 100px         // Fixed top margin
BOTTOM_HUD_RESERVE = 180px // Reserve for control dock
MAX_GRID_WIDTH = 560px     // Desktop cap to prevent "giant" symbols
```

### Grid Sizing Formula
```
gridWidthRaw = viewportWidth - (HORIZONTAL_MARGIN * 2)
gridWidth = min(gridWidthRaw, MAX_GRID_WIDTH)  // Mobile fills width, desktop capped
symbolWidth = floor(gridWidth / 5)
symbolHeight = symbolWidth  // Square symbols
gridHeight = symbolHeight * 3
```

**Note:** On mobile (e.g., 390px wide), `gridWidthRaw = 360px` which is under the cap, so the grid fills the screen. On desktop (e.g., 1440px wide), `gridWidthRaw = 1410px` but gets capped to 560px, keeping symbols at a reasonable size and centering the grid.

### Positioning Formula
```
offsetX = (viewportWidth - (symbolWidth * 5)) / 2  // Center horizontally
maxGridBottom = viewportHeight - BOTTOM_HUD_RESERVE
minOffsetY = 20  // Minimum safe margin from top (edge case small screens)
idealOffsetY = TOP_MARGIN
offsetY = max(minOffsetY, min(idealOffsetY, maxGridBottom - gridHeight))
```

Note: The `minOffsetY` clamp ensures the grid doesn't overlap the header on very small screens where `maxGridBottom - gridHeight` could be smaller than the safe area top.

### Coordinate Space Diagram
```
+--------------------------------------------------+
|                TOP_MARGIN (100px)                |
+--------------------------------------------------+
|  MARGIN  |         REELS GRID         |  MARGIN |
|  (15px)  |    (symbolWidth * 5)        |  (15px)  |
|          |    (symbolHeight * 3)       |          |
+--------------------------------------------------+
|          BOTTOM_HUD_RESERVE (180px)              |
|              (Spin button, balance)              |
+--------------------------------------------------+
```

## Manual Smoke Checklist
- Resize the window continuously for 5 seconds (drag edge rapidly).
- Orientation change (mobile emulation in DevTools: toggle portrait ↔ landscape).
- Toggle motion prefs (if available).
- Run 20 spins.
- Enter bonus (scatter).
- Verify frame/reels remain centered and mask shows 5 reels.
- **Console gate**: Verify no `[LAYOUT GUARD]` or `[LAYOUT ASSERT FAILED]` warnings/errors.

### Mobile Layout Tests (Batch 6)
- iPhone 12/13 (390×844): Grid fills width with margins, HUD dock clear.
- Tablet (768×1024): Grid centered, reasonable symbol size.
- Desktop (1920×1080): Grid centered, symbols not oversized.
