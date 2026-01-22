/**
 * Payline definitions for 5x3 slot grid
 * Maps lineId -> array of 5 CellPositions (one per reel)
 * Row order: 0=TOP, 1=MIDDLE, 2=BOTTOM
 * Source of truth: backend/app/logic/engine.py PAYLINES
 */

export interface CellPosition {
  reel: number  // 0-4
  row: number   // 0-2
}

/** 10 paylines matching backend engine.py */
export const PAYLINES_TABLE: Record<number, CellPosition[]> = {
  0: [{ reel: 0, row: 1 }, { reel: 1, row: 1 }, { reel: 2, row: 1 }, { reel: 3, row: 1 }, { reel: 4, row: 1 }], // middle
  1: [{ reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 2, row: 0 }, { reel: 3, row: 0 }, { reel: 4, row: 0 }], // top
  2: [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }, { reel: 3, row: 2 }, { reel: 4, row: 2 }], // bottom
  3: [{ reel: 0, row: 0 }, { reel: 1, row: 1 }, { reel: 2, row: 2 }, { reel: 3, row: 1 }, { reel: 4, row: 0 }], // V
  4: [{ reel: 0, row: 2 }, { reel: 1, row: 1 }, { reel: 2, row: 0 }, { reel: 3, row: 1 }, { reel: 4, row: 2 }], // inverted V
  5: [{ reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 2, row: 1 }, { reel: 3, row: 2 }, { reel: 4, row: 2 }], // diagonal down
  6: [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 1 }, { reel: 3, row: 0 }, { reel: 4, row: 0 }], // diagonal up
  7: [{ reel: 0, row: 1 }, { reel: 1, row: 0 }, { reel: 2, row: 0 }, { reel: 3, row: 0 }, { reel: 4, row: 1 }], // top curve
  8: [{ reel: 0, row: 1 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }, { reel: 3, row: 2 }, { reel: 4, row: 1 }], // bottom curve
  9: [{ reel: 0, row: 0 }, { reel: 1, row: 1 }, { reel: 2, row: 1 }, { reel: 3, row: 1 }, { reel: 4, row: 0 }], // shallow V
}

/** Get positions for a lineId, returns null for unknown/scatter lines */
export function getPaylinePositions(lineId: number): CellPosition[] | null {
  if (lineId === -1) return null  // scatter - no specific line
  return PAYLINES_TABLE[lineId] ?? null
}

/** DEV validation - call once at module load in DEV */
export function validatePaylines(): boolean {
  const REEL_COUNT = 5
  const VISIBLE_ROWS = 3

  for (const [lineId, positions] of Object.entries(PAYLINES_TABLE)) {
    if (positions.length !== REEL_COUNT) {
      console.error(`[PAYLINES] Line ${lineId} has ${positions.length} positions, expected ${REEL_COUNT}`)
      return false
    }
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i]
      if (pos.reel !== i) {
        console.error(`[PAYLINES] Line ${lineId} position ${i} has reel=${pos.reel}, expected ${i}`)
        return false
      }
      if (pos.row < 0 || pos.row >= VISIBLE_ROWS) {
        console.error(`[PAYLINES] Line ${lineId} position ${i} has invalid row=${pos.row}`)
        return false
      }
    }
  }
  return true
}

// Validate on module load in DEV
if (import.meta.env.DEV) {
  validatePaylines()
}
