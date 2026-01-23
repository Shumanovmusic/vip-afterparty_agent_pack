/**
 * useReelSpin - Composable for managing 3D reel spin physics
 * Handles acceleration, steady spin, deceleration, and bounce settle phases
 */
import { ref, computed, onUnmounted } from 'vue'

export interface SpinState {
  /** Current rotation angle in radians */
  rotation: number
  /** Current angular velocity (radians per second) */
  velocity: number
  /** Current spin phase */
  phase: 'idle' | 'accelerating' | 'spinning' | 'decelerating' | 'settling'
  /** Target symbol positions after stop */
  targetSymbols: number[]
  /** Target rotation angle to land on */
  targetRotation: number
  /** Quick stop requested */
  quickStop: boolean
}

// Physics constants
const SYMBOL_ANGLE = Math.PI / 6  // 30 degrees per symbol (12 sides = 360/12)
const MAX_VELOCITY = Math.PI * 8   // 4 full rotations per second
const ACCEL_DURATION_MS = 120      // Acceleration phase duration
const DECEL_DURATION_MS = 350      // Deceleration phase duration
const SETTLE_DURATION_MS = 150     // Bounce settle duration
const BOUNCE_ANGLE = 0.05          // Overshoot in radians
const STAGGER_MS = 120             // Delay between reel stops

export function useReelSpin(reelCount: number) {
  // Initialize spin states for each reel
  const spinStates = ref<SpinState[]>(
    Array.from({ length: reelCount }, () => ({
      rotation: 0,
      velocity: 0,
      phase: 'idle',
      targetSymbols: [0, 0, 0],
      targetRotation: 0,
      quickStop: false
    }))
  )

  // Timing trackers
  const phaseStartTimes = ref<number[]>(Array(reelCount).fill(0))

  // Computed spinning state
  const isSpinning = computed(() =>
    spinStates.value.some(s => s.phase !== 'idle')
  )

  /**
   * Calculate target rotation for symbol alignment
   * Ensures the target symbols land at the visible positions (top 3 of 12)
   */
  function calculateTargetRotation(currentRotation: number, targetSymbols: number[]): number {
    // We need the middle symbol to align with row=1 position
    // On a 12-sided cylinder, visible rows are indices 0, 1, 2 (top of cylinder)
    const middleSymbolIndex = targetSymbols[1]

    // Calculate the base rotation needed for this symbol to be at front
    const baseRotation = middleSymbolIndex * SYMBOL_ANGLE

    // Add full rotations to ensure we spin forward (at least 2 full rotations)
    const fullRotations = Math.ceil((currentRotation + Math.PI * 4) / (Math.PI * 2)) * Math.PI * 2

    return fullRotations + baseRotation
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
   * Start all reels spinning
   */
  function startAllSpins() {
    const now = performance.now()

    for (let i = 0; i < reelCount; i++) {
      spinStates.value[i] = {
        ...spinStates.value[i],
        phase: 'accelerating',
        velocity: 0,
        quickStop: false
      }
      phaseStartTimes.value[i] = now
    }
  }

  /**
   * Stop all reels with staggered timing
   * @param finalGrid - Final symbol positions [reel][row]
   */
  async function stopAllReels(finalGrid: number[][]): Promise<void> {
    const promises: Promise<void>[] = []

    for (let i = 0; i < reelCount; i++) {
      promises.push(
        new Promise(resolve => {
          setTimeout(() => {
            const state = spinStates.value[i]
            state.targetSymbols = [...finalGrid[i]]
            state.targetRotation = calculateTargetRotation(state.rotation, finalGrid[i])
            state.phase = 'decelerating'
            phaseStartTimes.value[i] = performance.now()

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
   * Update spin physics (called each frame via render loop)
   */
  function updateSpinPhysics(deltaTime: number) {
    const now = performance.now()

    for (let i = 0; i < reelCount; i++) {
      const state = spinStates.value[i]
      const phaseElapsed = now - phaseStartTimes.value[i]

      switch (state.phase) {
        case 'accelerating': {
          // Quadratic acceleration
          const t = Math.min(phaseElapsed / ACCEL_DURATION_MS, 1)
          state.velocity = MAX_VELOCITY * t * t
          state.rotation += state.velocity * deltaTime

          // Transition to spinning after acceleration
          if (t >= 1) {
            state.phase = 'spinning'
            state.velocity = MAX_VELOCITY
            phaseStartTimes.value[i] = now
          }
          break
        }

        case 'spinning': {
          // Constant velocity
          state.rotation += state.velocity * deltaTime

          // Auto-transition to decel if spinning too long (safety)
          if (phaseElapsed > 5000) {
            state.phase = 'decelerating'
            phaseStartTimes.value[i] = now
          }
          break
        }

        case 'decelerating': {
          const duration = state.quickStop ? DECEL_DURATION_MS * 0.5 : DECEL_DURATION_MS
          const t = Math.min(phaseElapsed / duration, 1)

          // Ease from current rotation to target
          const startRotation = state.rotation
          const progress = easeOutBack(t)

          // Interpolate rotation
          state.rotation = startRotation + (state.targetRotation - startRotation) * progress
          state.velocity = MAX_VELOCITY * (1 - t)

          // Transition to settling
          if (t >= 1) {
            state.phase = 'settling'
            state.rotation = state.targetRotation
            phaseStartTimes.value[i] = now
          }
          break
        }

        case 'settling': {
          // Bounce settle effect
          const t = Math.min(phaseElapsed / SETTLE_DURATION_MS, 1)
          const bounce = Math.sin(t * Math.PI) * BOUNCE_ANGLE * (1 - t)
          state.rotation = state.targetRotation + bounce
          state.velocity = 0

          // Complete
          if (t >= 1) {
            state.phase = 'idle'
            state.rotation = state.targetRotation
          }
          break
        }
      }
    }
  }

  // Animation frame tracking
  let animationFrameId: number | null = null
  let lastTime = performance.now()

  /**
   * Internal animation loop using requestAnimationFrame
   * TresJS useLoop requires being inside TresCanvas context,
   * so we use raw rAF for standalone composable usage
   */
  function tick() {
    if (!isSpinning.value) {
      animationFrameId = null
      return
    }

    const now = performance.now()
    const deltaSeconds = (now - lastTime) / 1000
    lastTime = now

    updateSpinPhysics(deltaSeconds)
    animationFrameId = requestAnimationFrame(tick)
  }

  /**
   * Start animation loop when spinning begins
   */
  function startAnimationLoop() {
    if (animationFrameId !== null) return
    lastTime = performance.now()
    animationFrameId = requestAnimationFrame(tick)
  }

  // Watch for spinning state changes
  const originalStartAllSpins = startAllSpins
  function startAllSpinsWithLoop() {
    originalStartAllSpins()
    startAnimationLoop()
  }

  // Cleanup on unmount
  onUnmounted(() => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
  })

  return {
    spinStates,
    startAllSpins: startAllSpinsWithLoop,
    stopAllReels,
    requestQuickStop,
    isSpinning
  }
}
