/**
 * Lightweight timeline helper for sequencing animations
 * Supports skip and time scale for turbo/reduce motion modes
 */

export type TimelineCallback = () => void | Promise<void>

interface TimelineEntry {
  delay: number
  callback: TimelineCallback
  label?: string
}

/**
 * Simple timeline for sequencing animation steps
 */
export class Timeline {
  private entries: TimelineEntry[] = []
  private isRunning = false
  private isSkipped = false
  private timeScale = 1
  private currentTimeout: number | null = null

  /** Set time scale (for turbo mode) */
  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0.1, scale)
  }

  /** Add a step to the timeline */
  add(callback: TimelineCallback, delay = 0, label?: string): this {
    this.entries.push({ delay, callback, label })
    return this
  }

  /** Add a delay step */
  wait(ms: number): this {
    return this.add(() => {}, ms, 'wait')
  }

  /** Run the timeline */
  async run(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Timeline already running')
    }

    this.isRunning = true
    this.isSkipped = false

    try {
      for (let i = 0; i < this.entries.length; i++) {
        if (this.isSkipped) {
          // Run remaining callbacks immediately without delay
          for (let j = i; j < this.entries.length; j++) {
            await this.entries[j].callback()
          }
          break
        }

        const entry = this.entries[i]

        // Wait for delay (scaled)
        if (entry.delay > 0) {
          const scaledDelay = entry.delay / this.timeScale
          await this.delay(scaledDelay)
        }

        if (this.isSkipped) {
          // Skip was called during delay, run remaining immediately
          for (let j = i; j < this.entries.length; j++) {
            await this.entries[j].callback()
          }
          break
        }

        // Execute callback
        await entry.callback()
      }
    } finally {
      this.isRunning = false
      this.currentTimeout = null
    }
  }

  /** Skip remaining delays, execute all callbacks immediately */
  skip(): void {
    this.isSkipped = true
    // Cancel any pending delay
    if (this.currentTimeout !== null) {
      clearTimeout(this.currentTimeout)
      this.currentTimeout = null
    }
  }

  /** Check if timeline is running */
  get running(): boolean {
    return this.isRunning
  }

  /** Check if timeline was skipped */
  get skipped(): boolean {
    return this.isSkipped
  }

  /** Clear all entries */
  clear(): void {
    if (this.isRunning) {
      this.skip()
    }
    this.entries = []
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.currentTimeout = window.setTimeout(resolve, ms)
    })
  }
}

/**
 * Factory function for creating timelines
 */
export function createTimeline(): Timeline {
  return new Timeline()
}

/**
 * Run a simple sequential timeline
 */
export async function runSequence(
  steps: Array<{ callback: TimelineCallback; delay?: number }>,
  timeScale = 1
): Promise<void> {
  const timeline = new Timeline()
  timeline.setTimeScale(timeScale)

  for (const step of steps) {
    timeline.add(step.callback, step.delay ?? 0)
  }

  await timeline.run()
}

/**
 * Create a cancellable delay promise
 */
export function cancellableDelay(ms: number): {
  promise: Promise<void>
  cancel: () => void
} {
  let timeoutId: number
  let rejectFn: () => void

  const promise = new Promise<void>((resolve, reject) => {
    rejectFn = reject
    timeoutId = window.setTimeout(resolve, ms)
  })

  return {
    promise,
    cancel: () => {
      clearTimeout(timeoutId)
      rejectFn()
    }
  }
}
