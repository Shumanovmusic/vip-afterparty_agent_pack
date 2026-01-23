/**
 * useReelStripSpin - Composable for PlaneGeometry strip-based reel spin
 * Animates Y position of symbol strips instead of cylinder rotation
 */
import { ref, computed, onUnmounted } from 'vue'

export interface StripSpinState {
  /** Current Y offset of the strip (negative = symbols scrolling down) */
  offsetY: number
  /** Current velocity (units per second, negative = downward) */
  velocity: number
  /** Current spin phase */
  phase: 'idle' | 'accelerating' | 'spinning' | 'decelerating' | 'settling'
  /** Target symbol indices for visible rows [top, mid, bottom] */
  targetSymbols: number[]
  /** Target Y offset to land on */
  targetOffsetY: number
  /** Quick stop requested */
  quickStop: boolean
}

// Layout constants
export const SYMBOL_HEIGHT = 1.8        // Height of one symbol plane
export const SYMBOL_WIDTH = 1.8         // Width of one symbol plane
export const VISIBLE_ROWS = 3           // Number of visible symbols per reel
export const SYMBOLS_PER_STRIP = 15     // Total symbols in strip for seamless loop
export const REEL_SPACING = 2.2         // Horizontal spacing between reels
export const REEL_COUNT = 5             // Number of reels

// Physics constants
const MAX_VELOCITY = 25                  // Max units per second
const ACCEL_DURATION_MS = 150           // Acceleration phase
const MIN_SPIN_DURATION_MS = 400        // Minimum time in spin phase
const DECEL_DURATION_MS = 400           // Deceleration phase
const SETTLE_DURATION_MS = 120          // Bounce settle phase
const BOUNCE_AMOUNT = 0.08              // Overshoot in units
const STAGGER_MS = 100                  // Delay between reel stops

export function useReelStripSpin(reelCount: number = REEL_COUNT) {
  // Initialize spin states for each reel
  const spinStates = ref<StripSpinState[]>(
    Array.from({ length: reelCount }, () => ({
      offsetY: 0,
      velocity: 0,
      phase: 'idle',
      targetSymbols: [0, 1, 2],
      targetOffsetY: 0,
      quickStop: false
    }))
  )

  // Track phase start times and spin start time
  const phaseStartTimes = ref<number[]>(Array(reelCount).fill(0))
  const spinStartTime = ref<number>(0)

  // Total strip height (for wrapping)
  const STRIP_HEIGHT = SYMBOLS_PER_STRIP * SYMBOL_HEIGHT

  // Computed spinning state
  const isSpinning = computed(() =>
    spinStates.value.some(s => s.phase !== 'idle')
  )

  /**
   * Calculate target Y offset for landing on specific symbols
   * @param currentOffsetY - Current Y offset
   * @param targetSymbols - Target symbol indices for visible rows
   */
  function calculateTargetOffsetY(currentOffsetY: number, targetSymbols: number[]): number {
    // The middle symbol (index 1) should align with center (Y=0)
    // Target offset = negative of (middleSymbolIndex * SYMBOL_HEIGHT)
    const middleSymbolIndex = targetSymbols[1]

    // Base offset to show this symbol in the middle
    // Symbol 0 at offsetY=0 means symbol 0 is at top visible position
    // We want middleSymbol at the middle position (offset by 1 symbol from top)
    const baseOffset = -(middleSymbolIndex - 1) * SYMBOL_HEIGHT

    // Ensure we complete at least 2 full strips of travel
    const minTravel = STRIP_HEIGHT * 2
    const currentTravel = Math.abs(currentOffsetY)

    // Calculate how many full strips we need to add
    const additionalStrips = Math.ceil((currentTravel + minTravel - Math.abs(baseOffset)) / STRIP_HEIGHT)
    const totalOffset = baseOffset - additionalStrips * STRIP_HEIGHT

    return totalOffset
  }

  /**
   * Wrap offset to keep within strip bounds for seamless loop
   */
  function wrapOffset(offset: number): number {
    // Keep offset in reasonable range while maintaining visual continuity
    const wrapped = offset % STRIP_HEIGHT
    return wrapped > 0 ? wrapped - STRIP_HEIGHT : wrapped
  }

  /**
   * Easing function for deceleration (backOut for bounce effect)
   */
  function easeOutBack(t: number): number {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  }

  /**
   * Easing function for acceleration
   */
  function easeInQuad(t: number): number {
    return t * t
  }

  /**
   * Start all reels spinning
   */
  function startAllSpins() {
    const now = performance.now()
    spinStartTime.value = now

    for (let i = 0; i < reelCount; i++) {
      spinStates.value[i] = {
        ...spinStates.value[i],
        phase: 'accelerating',
        velocity: 0,
        quickStop: false
      }
      phaseStartTimes.value[i] = now
    }

    startAnimationLoop()
  }

  /**
   * Stop all reels with staggered timing
   * @param finalGrid - Final symbol positions [reel][row] where row 0=top, 1=mid, 2=bottom
   */
  async function stopAllReels(finalGrid: number[][]): Promise<void> {
    const now = performance.now()
    const timeSinceStart = now - spinStartTime.value

    // Ensure minimum spin time before stopping
    const waitTime = Math.max(0, MIN_SPIN_DURATION_MS - timeSinceStart)

    await new Promise(resolve => setTimeout(resolve, waitTime))

    const promises: Promise<void>[] = []

    for (let i = 0; i < reelCount; i++) {
      promises.push(
        new Promise(resolve => {
          setTimeout(() => {
            const state = spinStates.value[i]
            state.targetSymbols = [...finalGrid[i]]
            state.targetOffsetY = calculateTargetOffsetY(state.offsetY, finalGrid[i])
            state.phase = 'decelerating'
            phaseStartTimes.value[i] = performance.now()

            // Store the starting offset for interpolation
            ;(state as any)._decelStartOffset = state.offsetY

            // Resolve after settle completes
            setTimeout(resolve, DECEL_DURATION_MS + SETTLE_DURATION_MS + 50)
          }, i * STAGGER_MS)
        })
      )
    }

    await Promise.all(promises)
  }

  /**
   * Request quick stop on all reels
   */
  function requestQuickStop() {
    for (const state of spinStates.value) {
      state.quickStop = true
    }
  }

  /**
   * Update spin physics (called each frame)
   */
  function updateSpinPhysics(deltaTime: number) {
    const now = performance.now()

    for (let i = 0; i < reelCount; i++) {
      const state = spinStates.value[i]
      const phaseElapsed = now - phaseStartTimes.value[i]

      switch (state.phase) {
        case 'accelerating': {
          const t = Math.min(phaseElapsed / ACCEL_DURATION_MS, 1)
          state.velocity = -MAX_VELOCITY * easeInQuad(t)
          state.offsetY += state.velocity * deltaTime

          // Wrap for seamless loop
          state.offsetY = wrapOffset(state.offsetY)

          if (t >= 1) {
            state.phase = 'spinning'
            state.velocity = -MAX_VELOCITY
            phaseStartTimes.value[i] = now
          }
          break
        }

        case 'spinning': {
          state.offsetY += state.velocity * deltaTime
          state.offsetY = wrapOffset(state.offsetY)

          // Safety timeout
          if (phaseElapsed > 10000) {
            state.phase = 'decelerating'
            state.targetOffsetY = state.offsetY - STRIP_HEIGHT
            ;(state as any)._decelStartOffset = state.offsetY
            phaseStartTimes.value[i] = now
          }
          break
        }

        case 'decelerating': {
          const duration = state.quickStop ? DECEL_DURATION_MS * 0.5 : DECEL_DURATION_MS
          const t = Math.min(phaseElapsed / duration, 1)
          const startOffset = (state as any)._decelStartOffset ?? state.offsetY

          // Interpolate from start to target with easing
          const progress = easeOutBack(t)
          state.offsetY = startOffset + (state.targetOffsetY - startOffset) * progress

          if (t >= 1) {
            state.phase = 'settling'
            state.offsetY = state.targetOffsetY
            phaseStartTimes.value[i] = now
          }
          break
        }

        case 'settling': {
          const t = Math.min(phaseElapsed / SETTLE_DURATION_MS, 1)
          // Damped oscillation
          const bounce = Math.sin(t * Math.PI * 2) * BOUNCE_AMOUNT * (1 - t)
          state.offsetY = state.targetOffsetY + bounce
          state.velocity = 0

          if (t >= 1) {
            state.phase = 'idle'
            state.offsetY = state.targetOffsetY
          }
          break
        }
      }
    }
  }

  // Animation frame tracking
  let animationFrameId: number | null = null
  let lastTime = performance.now()

  function tick() {
    if (!isSpinning.value) {
      animationFrameId = null
      return
    }

    const now = performance.now()
    const deltaSeconds = Math.min((now - lastTime) / 1000, 0.1) // Cap delta
    lastTime = now

    updateSpinPhysics(deltaSeconds)
    animationFrameId = requestAnimationFrame(tick)
  }

  function startAnimationLoop() {
    if (animationFrameId !== null) return
    lastTime = performance.now()
    animationFrameId = requestAnimationFrame(tick)
  }

  onUnmounted(() => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
  })

  return {
    spinStates,
    startAllSpins,
    stopAllReels,
    requestQuickStop,
    isSpinning,
    // Export constants for use in templates
    SYMBOL_HEIGHT,
    SYMBOL_WIDTH,
    VISIBLE_ROWS,
    SYMBOLS_PER_STRIP,
    REEL_SPACING
  }
}
