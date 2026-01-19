<script setup lang="ts">
/**
 * ReelsView - 5x3 reel grid component
 * Renders symbols and handles reel animations
 */
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import type { GameController } from '../GameController'
import { Animations } from '../ux/animations/AnimationLibrary'
import { flatToGrid } from '../ux/animations/AnimationLibrary'
import { getSymbolKey, SYMBOL_FALLBACK_COLORS } from './assets/AssetManifest'

const props = defineProps<{
  controller: GameController
}>()

const getGameDimensions = inject<() => { width: number; height: number }>('getGameDimensions')

// Grid state: 5 reels x 3 rows = 15 symbols
const grid = ref<number[][]>([
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0]
])

// Animation states
const reelSpinning = ref<boolean[]>([false, false, false, false, false])
const highlightedPositions = ref<Set<number>>(new Set())
const wildPositions = ref<Set<number>>(new Set())
const dimmedSymbols = ref(false)

/**
 * Get symbol color from centralized manifest
 * Converts numeric color to CSS hex string
 */
function getSymbolColor(symbolId: number): string {
  const key = getSymbolKey(symbolId)
  const color = SYMBOL_FALLBACK_COLORS[key] ?? 0x666666
  return '#' + color.toString(16).padStart(6, '0')
}

// Layout calculations
const layout = computed(() => {
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

// Get symbol position
function getSymbolStyle(reelIndex: number, rowIndex: number) {
  const l = layout.value
  const flatIndex = reelIndex * 3 + rowIndex
  const symbolId = grid.value[reelIndex][rowIndex]

  return {
    left: `${l.offsetX + reelIndex * l.symbolWidth}px`,
    top: `${l.offsetY + rowIndex * l.symbolHeight}px`,
    width: `${l.symbolWidth - l.gap}px`,
    height: `${l.symbolHeight - l.gap}px`,
    backgroundColor: getSymbolColor(symbolId),
    opacity: dimmedSymbols.value && !highlightedPositions.value.has(flatIndex) ? 0.3 : 1,
    transform: reelSpinning.value[reelIndex] ? 'scaleY(0.8)' : 'scaleY(1)',
    boxShadow: wildPositions.value.has(flatIndex) ? '0 0 20px #ffd700' : 'none',
    border: highlightedPositions.value.has(flatIndex) ? '3px solid #ffd700' : '2px solid rgba(255,255,255,0.1)'
  }
}

// Set up animation event handlers
function setupAnimationHandlers() {
  Animations.setEvents({
    onReelSpinStart: (reelIndex) => {
      reelSpinning.value[reelIndex] = true
    },
    onReelStop: (reelIndex, symbols) => {
      reelSpinning.value[reelIndex] = false
      grid.value[reelIndex] = symbols
    },
    onRevealComplete: () => {
      reelSpinning.value = [false, false, false, false, false]
    },
    onWinLineHighlight: (_lineId, positions) => {
      dimmedSymbols.value = true
      positions.forEach(pos => {
        const flatIndex = pos.reel * 3 + pos.row
        highlightedPositions.value.add(flatIndex)
      })
    },
    onSpotlightWilds: (positions) => {
      positions.forEach(pos => {
        wildPositions.value.add(pos)
        // Also set symbol to wild (8)
        const gridPos = flatToGrid(pos)
        grid.value[gridPos.reel][gridPos.row] = 8
      })
    }
  })
}

// Reset highlights
function resetHighlights() {
  highlightedPositions.value.clear()
  wildPositions.value.clear()
  dimmedSymbols.value = false
}

// Subscribe to controller events
let unsubscribe: (() => void) | null = null

onMounted(() => {
  setupAnimationHandlers()

  // Listen for spin start to reset
  unsubscribe = props.controller.onSpinStart(() => {
    resetHighlights()
    reelSpinning.value = [true, true, true, true, true]
  })
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})

// Expose for parent
defineExpose({
  setGrid: (newGrid: number[][]) => {
    grid.value = newGrid
  },
  resetHighlights
})
</script>

<template>
  <div class="reels-view">
    <!-- Symbol grid -->
    <div
      v-for="(reel, reelIndex) in grid"
      :key="`reel-${reelIndex}`"
      class="reel"
    >
      <div
        v-for="(symbol, rowIndex) in reel"
        :key="`symbol-${reelIndex}-${rowIndex}`"
        class="symbol"
        :style="getSymbolStyle(reelIndex, rowIndex)"
      >
        <span class="symbol-id">{{ symbol }}</span>
      </div>
    </div>

    <!-- Win line overlay would go here -->
  </div>
</template>

<style scoped>
.reels-view {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.reel {
  position: absolute;
}

.symbol {
  position: absolute;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 0.15s ease-out,
    opacity 0.2s ease-out,
    box-shadow 0.3s ease-out;
}

.symbol-id {
  color: rgba(255, 255, 255, 0.8);
  font-size: 1.5rem;
  font-weight: bold;
  font-family: system-ui, sans-serif;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

/* Spinning animation */
.symbol[style*="scaleY(0.8)"] {
  animation: spin-blur 0.1s linear infinite;
}

@keyframes spin-blur {
  0%, 100% {
    filter: blur(0px);
  }
  50% {
    filter: blur(2px);
  }
}
</style>
