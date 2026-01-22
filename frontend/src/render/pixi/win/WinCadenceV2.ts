/**
 * WinCadenceV2 - Cycles through winning lines sequentially
 * Respects MotionPrefs for timing and skip behavior
 */

import type { CellPosition } from '../../../game/paylines/PAYLINES_TABLE'
import { getPaylinePositions } from '../../../game/paylines/PAYLINES_TABLE'
import { MotionPrefs } from '../../../ux/MotionPrefs'
import { DEBUG_FLAGS } from '../DebugFlags'

/** Win line data accumulated from events */
export interface WinLineData {
  lineId: number
  amount: number
  winX: number
}

/** Cadence timing configuration */
export interface CadenceTiming {
  highlightMs: number   // highlight duration per line
  fadeMs: number        // fade/transition duration
  maxLines: number      // cap to prevent long loops
}

/** Default timing for normal mode */
const TIMING_NORMAL: CadenceTiming = {
  highlightMs: 320,
  fadeMs: 260,
  maxLines: 8,
}

/** Timing for turbo mode */
const TIMING_TURBO: CadenceTiming = {
  highlightMs: 160,
  fadeMs: 0,
  maxLines: 4,
}

/** Timing for reduce motion */
const TIMING_REDUCED: CadenceTiming = {
  highlightMs: 400,
  fadeMs: 100,
  maxLines: 8,
}

/** Callbacks for presentation */
export interface CadenceCallbacks {
  presentLine: (positions: CellPosition[], amount: number, lineId: number) => void
  clearLine: () => void
  onCadenceComplete?: () => void
}

/** Options for run() method */
export interface CadenceRunOptions {
  /** Cap total cadence time (ms). If exceeded, breaks loop early. */
  maxDurationMs?: number
}

/** Result of cadence run */
export type CadenceRunResult = 'completed' | 'capped' | 'cancelled'

/**
 * WinCadenceV2 class - manages cycling through win lines
 */
export class WinCadenceV2 {
  private runId = 0
  private isRunning = false
  private skipRequested = false
  private winLines: WinLineData[] = []
  private callbacks: CadenceCallbacks | null = null

  /** Set callbacks for presentation */
  setCallbacks(callbacks: CadenceCallbacks): void {
    this.callbacks = callbacks
  }

  /** Accumulate a win line (called per winLine event) */
  addWinLine(lineId: number, amount: number, winX: number): void {
    this.winLines.push({ lineId, amount, winX })
  }

  /** Clear accumulated win lines */
  clear(): void {
    this.winLines = []
  }

  /** Request skip - stops cycling after current line */
  requestSkip(): void {
    this.skipRequested = true
  }

  /** Check if cadence is currently running */
  get running(): boolean {
    return this.isRunning
  }

  /** Get current win lines count */
  get lineCount(): number {
    return this.winLines.length
  }

  /**
   * Run the cadence cycle
   * @param options - Optional configuration (e.g., maxDurationMs cap)
   * @returns Promise with result: 'completed', 'capped', or 'cancelled'
   */
  async run(options?: CadenceRunOptions): Promise<CadenceRunResult> {
    if (this.isRunning) {
      if (DEBUG_FLAGS.cadenceVerbose) {
        console.log('[WinCadenceV2] Already running, skip')
      }
      return 'cancelled'
    }

    if (this.winLines.length === 0) {
      if (DEBUG_FLAGS.cadenceVerbose) {
        console.log('[WinCadenceV2] No win lines to cycle')
      }
      return 'completed'
    }

    this.runId++
    const myRunId = this.runId
    this.isRunning = true
    this.skipRequested = false

    const timing = this.getTiming()
    const linesToShow = this.winLines.slice(0, timing.maxLines)
    const maxDurationMs = options?.maxDurationMs
    const startTime = performance.now()

    if (DEBUG_FLAGS.cadenceVerbose) {
      console.log(`[WinCadenceV2] Starting cadence: ${linesToShow.length} lines, timing:`, timing,
        maxDurationMs ? `maxDurationMs: ${maxDurationMs}` : '')
    }

    let result: CadenceRunResult = 'completed'

    try {
      for (let i = 0; i < linesToShow.length; i++) {
        // Check for cancellation
        if (this.runId !== myRunId || this.skipRequested) {
          if (DEBUG_FLAGS.cadenceVerbose) {
            console.log(`[WinCadenceV2] Cancelled at line ${i}`)
          }
          result = 'cancelled'
          break
        }

        // Check for duration cap
        if (maxDurationMs !== undefined) {
          const elapsed = performance.now() - startTime
          if (elapsed >= maxDurationMs) {
            if (DEBUG_FLAGS.cadenceVerbose) {
              console.log(`[WinCadenceV2] Duration cap reached at line ${i} (${elapsed.toFixed(0)}ms >= ${maxDurationMs}ms)`)
            }
            result = 'capped'
            break
          }
        }

        const winLine = linesToShow[i]
        const positions = getPaylinePositions(winLine.lineId)

        if (!positions) {
          // Skip scatter or unknown lines
          if (DEBUG_FLAGS.cadenceVerbose) {
            console.log(`[WinCadenceV2] Skipping lineId ${winLine.lineId} (no positions)`)
          }
          continue
        }

        // Present this line
        this.callbacks?.presentLine(positions, winLine.amount, winLine.lineId)

        // Wait for highlight duration
        await this.delay(timing.highlightMs, myRunId)

        // Check cancellation before clearing
        if (this.runId !== myRunId || this.skipRequested) {
          result = 'cancelled'
          break
        }

        // Check duration cap after highlight
        if (maxDurationMs !== undefined) {
          const elapsed = performance.now() - startTime
          if (elapsed >= maxDurationMs) {
            if (DEBUG_FLAGS.cadenceVerbose) {
              console.log(`[WinCadenceV2] Duration cap reached after line ${i} (${elapsed.toFixed(0)}ms >= ${maxDurationMs}ms)`)
            }
            result = 'capped'
            break
          }
        }

        // Clear if not last line (or if there's fade time)
        if (i < linesToShow.length - 1 || timing.fadeMs > 0) {
          this.callbacks?.clearLine()
          if (timing.fadeMs > 0) {
            await this.delay(timing.fadeMs, myRunId)
          }
        }
      }
    } finally {
      this.isRunning = false
      this.callbacks?.onCadenceComplete?.()
    }

    return result
  }

  /** Cancel current cadence */
  cancel(): void {
    this.runId++
    this.isRunning = false
    this.skipRequested = false
    this.callbacks?.clearLine()
  }

  /** Get timing based on current motion prefs */
  private getTiming(): CadenceTiming {
    if (MotionPrefs.turboEnabled) {
      return TIMING_TURBO
    }
    if (MotionPrefs.reduceMotion) {
      return TIMING_REDUCED
    }
    return TIMING_NORMAL
  }

  /** Delay with cancellation support */
  private delay(ms: number, forRunId: number): Promise<void> {
    return new Promise(resolve => {
      const timeoutId = setTimeout(() => {
        resolve()
      }, ms)

      // Check periodically for cancellation
      const checkInterval = setInterval(() => {
        if (this.runId !== forRunId || this.skipRequested) {
          clearTimeout(timeoutId)
          clearInterval(checkInterval)
          resolve()
        }
      }, 50)

      // Clean up interval when timeout fires
      setTimeout(() => clearInterval(checkInterval), ms + 10)
    })
  }
}
