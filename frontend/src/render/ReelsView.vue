<script setup lang="ts">
/**
 * ReelsView - 5x3 reel grid component using Pixi.js sprites
 * Thin Vue wrapper around PixiReelsRenderer
 */
import { ref, computed, onMounted, onUnmounted, onBeforeUnmount, inject, watch, type Ref } from 'vue'
import type { Application, Container } from 'pixi.js'
import type { GameController } from '../GameController'
import { PixiReelsRenderer, type ReelsLayoutConfig, DEBUG_FLAGS, type SpinCorrectnessFailure } from './pixi'
import { GameModeStore } from '../state/GameModeStore'

const props = defineProps<{
  controller: GameController
}>()

const getGameDimensions = inject<() => { width: number; height: number }>('getGameDimensions')
const pixiApp = inject<Ref<Application | null>>('pixiApp')
const mainContainer = inject<Ref<Container | null>>('mainContainer')

// Renderer instance
const renderer = ref<PixiReelsRenderer | null>(null)
let layoutLogged = false

// Layout debounce state (rAF-based)
let layoutRaf = 0
let lastLayout: ReelsLayoutConfig | null = null

// Layout calculations
const layout = computed((): ReelsLayoutConfig => {
  const dims = getGameDimensions?.() || { width: 400, height: 600 }
  const gameWidth = dims.width
  const gameHeight = dims.height

  // Mobile-first: 9:16 aspect ratio target
  const gridWidth = Math.min(gameWidth * 0.9, 400)
  const gridHeight = gridWidth * 0.6  // 5x3 grid

  const symbolWidth = gridWidth / 5
  const symbolHeight = gridHeight / 3

  const offsetX = (gameWidth - gridWidth) / 2
  const offsetY = (gameHeight - gridHeight) / 2 - 50  // Shift up for HUD space

  if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout && !layoutLogged) {
    layoutLogged = true
    console.log('[ReelsView] layout', {
      gameWidth,
      gameHeight,
      gridWidth,
      gridHeight,
      symbolWidth,
      symbolHeight,
      offsetX,
      offsetY,
    })
  }

  return {
    gridWidth,
    gridHeight,
    symbolWidth,
    symbolHeight,
    offsetX,
    offsetY,
    gap: 4
  }
})

// Watch for layout changes and update renderer (rAF debounced)
watch(
  layout,
  (newLayout) => {
    lastLayout = newLayout
    if (layoutRaf) cancelAnimationFrame(layoutRaf)
    layoutRaf = requestAnimationFrame(() => {
      layoutRaf = 0
      if (renderer.value && lastLayout) {
        renderer.value.layout(lastLayout)
        pixiApp?.value?.render?.()
      }
    })
  },
  { deep: true, flush: 'post' }
)

onBeforeUnmount(() => {
  if (layoutRaf) cancelAnimationFrame(layoutRaf)
  layoutRaf = 0
  lastLayout = null
})

// Subscribe to controller events
let unsubscribeSpinStart: (() => void) | null = null
let unsubscribeQuickStop: (() => void) | null = null

// DEV spin test state
interface SpinTestResult {
  total: number
  failures: number
  failureExamples: Array<{ spinIndex: number; failures: SpinCorrectnessFailure[] }>
  durationMs: number
}

let spinTestRunning = false

/**
 * DEV ONLY: Run automated spin correctness test
 * Press T to trigger 100 spins with correctness validation
 */
async function runSpinTest(numSpins: number = 100, quickStopPercent: number = 50): Promise<SpinTestResult> {
  if (spinTestRunning) {
    console.warn('[SPIN TEST] Already running')
    return { total: 0, failures: 0, failureExamples: [], durationMs: 0 }
  }

  const rendererInstance = renderer.value
  if (!rendererInstance) {
    console.error('[SPIN TEST] Renderer not available')
    return { total: 0, failures: 0, failureExamples: [], durationMs: 0 }
  }

  spinTestRunning = true
  rendererInstance.setSpinTestRunning(true)

  console.log(`[SPIN TEST] Starting ${numSpins} spin correctness test (quickStop ${quickStopPercent}% of spins)`)
  const startTime = performance.now()

  const failureExamples: Array<{ spinIndex: number; failures: SpinCorrectnessFailure[] }> = []
  let failureCount = 0

  for (let i = 0; i < numSpins; i++) {
    try {
      // Only spin in IDLE state
      if (!props.controller.canSpin()) {
        // Wait a bit and retry
        await delay(100)
        if (!props.controller.canSpin()) {
          console.warn(`[SPIN TEST] Spin ${i + 1}: Cannot spin, skipping`)
          continue
        }
      }

      // Get current bet from config
      const bet = props.controller.allowedBets[0] ?? 1.0

      // Trigger spin (same path as clicking SPIN button)
      const spinPromise = props.controller.requestSpin(bet, false)

      // Optionally trigger quick stop after a short delay
      // Only in BASE mode (FREE_SPINS auto-spins should not be interrupted)
      const shouldQuickStop = Math.random() * 100 < quickStopPercent
      if (shouldQuickStop && GameModeStore.mode === 'BASE') {
        // Wait a bit for reels to start spinning, then request quick stop
        await delay(120)
        if (rendererInstance.isSpinning()) {
          props.controller.requestQuickStop()
        }
      }

      // Wait for spin to complete
      await spinPromise

      // Check correctness result
      const correctnessResult = rendererInstance.getLastCorrectnessResult()
      if (correctnessResult && !correctnessResult.passed) {
        failureCount++
        if (failureExamples.length < 3) {
          failureExamples.push({
            spinIndex: i + 1,
            failures: correctnessResult.failures
          })
        }
      }

      // Small delay between spins to keep UI responsive
      await delay(50)
    } catch (error) {
      console.error(`[SPIN TEST] Spin ${i + 1} error:`, error)
    }
  }

  const durationMs = performance.now() - startTime

  spinTestRunning = false
  rendererInstance.setSpinTestRunning(false)

  const result: SpinTestResult = {
    total: numSpins,
    failures: failureCount,
    failureExamples,
    durationMs
  }

  // Print summary
  console.log('[SPIN TEST DONE]', {
    totalSpins: result.total,
    failures: result.failures,
    successRate: `${((result.total - result.failures) / result.total * 100).toFixed(1)}%`,
    durationMs: result.durationMs.toFixed(0),
    durationPerSpin: (result.durationMs / result.total).toFixed(1) + 'ms'
  })

  if (result.failures > 0) {
    console.error('[SPIN TEST FAILURES]', result.failureExamples)
  }

  return result
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// DEV hotkey handler
function onKeyDown(event: KeyboardEvent): void {
  // 'T' key triggers 100-spin test (DEV only)
  if ((event.key === 't' || event.key === 'T') && DEBUG_FLAGS.spinTestEnabled) {
    event.preventDefault()
    event.stopPropagation()
    runSpinTest(100, 50)
    return
  }

  // 'W' key triggers debug win presentation (DEV only)
  if ((event.key === 'w' || event.key === 'W') && DEBUG_FLAGS.winTestEnabled) {
    event.preventDefault()
    event.stopPropagation()

    const rendererInstance = renderer.value
    if (!rendererInstance) return

    // Don't interfere with running spin test
    if (rendererInstance.isSpinTestRunning()) {
      console.log('[WIN TEST] Ignored: spin test is running')
      return
    }

    // Show debug win presentation with zigzag pattern for visual variety
    const zigzagPositions = [
      { reel: 0, row: 0 },
      { reel: 1, row: 1 },
      { reel: 2, row: 2 },
      { reel: 3, row: 1 },
      { reel: 4, row: 0 },
    ]
    rendererInstance.debugPresentWin({ amount: 1.23, positions: zigzagPositions })
    return
  }

  // 'L' key triggers debug cadence test (DEV only)
  if ((event.key === 'l' || event.key === 'L') && DEBUG_FLAGS.cadenceTestEnabled) {
    event.preventDefault()
    event.stopPropagation()

    const rendererInstance = renderer.value
    if (!rendererInstance) return

    // Don't interfere with running spin test
    if (rendererInstance.isSpinTestRunning()) {
      console.log('[CADENCE TEST] Ignored: spin test is running')
      return
    }

    console.log('[CADENCE TEST] Running debug cadence with 3 test lines')
    rendererInstance.debugTestCadence()
  }
}

onMounted(() => {
  // Get the main Pixi container
  const container = mainContainer?.value
  if (!container) {
    console.warn('[ReelsView] mainContainer not available')
    return
  }

  const layoutValue = layout.value
  if (import.meta.env.DEV && DEBUG_FLAGS.verboseLayout) {
    console.log('[ReelsView] onMounted layout:', {
      offsetX: layoutValue.offsetX,
      offsetY: layoutValue.offsetY,
      gridWidth: layoutValue.gridWidth,
      symbolWidth: layoutValue.symbolWidth,
    })
  }

  // Create renderer
  renderer.value = new PixiReelsRenderer(container)
  renderer.value.init(layoutValue)
  pixiApp?.value?.render?.()

  // Listen for spin start to reset highlights and start spinning
  unsubscribeSpinStart = props.controller.onSpinStart(() => {
    renderer.value?.resetHighlights()
    renderer.value?.startAllSpins()
  })

  // Listen for quick stop to accelerate reel stopping
  unsubscribeQuickStop = props.controller.onQuickStop(() => {
    renderer.value?.requestQuickStop()
  })

  // DEV: Register hotkeys (spin test T, win test W, cadence test L)
  if (import.meta.env.DEV && (DEBUG_FLAGS.spinTestEnabled || DEBUG_FLAGS.winTestEnabled || DEBUG_FLAGS.cadenceTestEnabled)) {
    window.addEventListener('keydown', onKeyDown)
  }
})

onUnmounted(() => {
  if (unsubscribeSpinStart) unsubscribeSpinStart()
  if (unsubscribeQuickStop) unsubscribeQuickStop()

  // DEV: Unregister hotkeys (spin test T, win test W, cadence test L)
  if (import.meta.env.DEV && (DEBUG_FLAGS.spinTestEnabled || DEBUG_FLAGS.winTestEnabled || DEBUG_FLAGS.cadenceTestEnabled)) {
    window.removeEventListener('keydown', onKeyDown)
  }

  if (renderer.value) {
    renderer.value.destroy()
    renderer.value = null
  }
})

// Expose for parent
defineExpose({
  setGrid: (newGrid: number[][]) => {
    renderer.value?.setGrid(newGrid)
  },
  resetHighlights: () => {
    renderer.value?.resetHighlights()
  }
})
</script>

<template>
  <!-- Pixi rendering handled in canvas, this is just a placeholder for Vue slot -->
  <div class="reels-view-placeholder" />
</template>

<style scoped>
.reels-view-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
