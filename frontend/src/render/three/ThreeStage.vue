<script setup lang="ts">
/**
 * ThreeStage - 3D Slot Machine with PlaneGeometry symbol strips
 * Uses vertical strips of planes instead of cylinders for better visuals
 */
import { ref, provide, onMounted, onUnmounted, computed } from 'vue'
import { TresCanvas } from '@tresjs/core'
import type { GameController } from '../../GameController'
import { useReelStripSpin, SYMBOL_HEIGHT, SYMBOL_WIDTH, VISIBLE_ROWS, SYMBOLS_PER_STRIP, REEL_SPACING } from './composables/useReelStripSpin'
import { useSymbolTextures, SYMBOL_IDS } from './composables/useSymbolTextures'
import { Animations } from '../../ux/animations/AnimationLibrary'
import Overlays from '../Overlays.vue'
import HUD from '../HUD.vue'

const props = defineProps<{
  controller: GameController
}>()

provide('gameController', props.controller)
const isReady = ref(false)

// Defer canvas rendering to ensure proper WebGL context initialization
const canvasMounted = ref(false)

// Reel configuration
const REEL_COUNT = 5

// Frame dimensions - adjusted for symbol strips
const FRAME_WIDTH = 11.5
const FRAME_HEIGHT = VISIBLE_ROWS * SYMBOL_HEIGHT + 0.4
const FRAME_DEPTH = 0.3
const BORDER_SIZE = 0.4

// Symbol textures
const { textures } = useSymbolTextures()

// Spin state (Y-position based)
const { spinStates, startAllSpins, stopAllReels, requestQuickStop, isSpinning } = useReelStripSpin(REEL_COUNT)

// Generate random symbol sequence for each reel
// Each reel has SYMBOLS_PER_STRIP symbols, duplicating first VISIBLE_ROWS for seamless wrap
function generateReelSymbols(reelIndex: number): number[] {
  const symbols: number[] = []
  const symbolCount = SYMBOL_IDS.length

  // Generate random symbols with slight bias per reel for variety
  for (let i = 0; i < SYMBOLS_PER_STRIP - VISIBLE_ROWS; i++) {
    // Use reel index to create different distributions
    const seed = (reelIndex * 17 + i * 31) % symbolCount
    symbols.push((seed + Math.floor(Math.random() * 3)) % symbolCount)
  }

  // Duplicate first VISIBLE_ROWS symbols at the end for seamless looping
  for (let i = 0; i < VISIBLE_ROWS; i++) {
    symbols.push(symbols[i])
  }

  return symbols
}

// Pre-generate symbol sequences for each reel (reactive for potential future updates)
const reelSymbols = ref<number[][]>(
  Array.from({ length: REEL_COUNT }, (_, i) => generateReelSymbols(i))
)

// Reel X positions (centered)
const reelXPositions = computed(() => {
  const totalWidth = (REEL_COUNT - 1) * REEL_SPACING
  const startX = -totalWidth / 2
  return Array.from({ length: REEL_COUNT }, (_, i) => startX + i * REEL_SPACING)
})

// Y offset for centering visible area (VISIBLE_ROWS symbols visible, centered at 0)
const centerOffsetY = computed(() => -(VISIBLE_ROWS - 1) * SYMBOL_HEIGHT / 2)

// Grid state
const currentGrid = ref<number[][]>([
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [0, 1, 2]
])

// Pending grid for reel stops (accumulates as reels stop one by one)
const pendingGrid = ref<(number[] | null)[]>([null, null, null, null, null])
const pendingStopCount = ref(0)

// Clipping planes for masking symbols outside visible area
const clipTop = computed(() => (VISIBLE_ROWS * SYMBOL_HEIGHT / 2) + 0.1)
const clipBottom = computed(() => -(VISIBLE_ROWS * SYMBOL_HEIGHT / 2) - 0.1)

// Controller subscriptions
let unsubSpinStart: (() => void) | null = null
let unsubQuickStop: (() => void) | null = null

/** Handle individual reel stop from AnimationLibrary */
async function handleReelStop(reelIndex: number, symbols: number[]): Promise<void> {
  console.log('[ThreeStage] handleReelStop', { reelIndex, symbols, count: pendingStopCount.value + 1 })

  // Store symbols for this reel
  pendingGrid.value[reelIndex] = [...symbols]
  pendingStopCount.value++

  // When all 5 reels have stopped, trigger the animation stop
  if (pendingStopCount.value === REEL_COUNT) {
    console.log('[ThreeStage] All reels received, stopping with grid:', pendingGrid.value)
    const finalGrid = pendingGrid.value.map(col => col || [0, 1, 2]) as number[][]
    currentGrid.value = finalGrid

    // Trigger stop animation
    console.log('[ThreeStage] Starting stop animation...')
    await stopAllReels(finalGrid)
    console.log('[ThreeStage] Stop animation complete')

    // After animation completes, update strip symbols with final result
    // Put final symbols at the start of each strip, then fill rest with randoms
    for (let r = 0; r < REEL_COUNT; r++) {
      const finalSymbols = finalGrid[r]
      const newStrip = [...finalSymbols] // Start with final 3 symbols

      // Fill remaining positions with random symbols for next spin
      while (newStrip.length < SYMBOLS_PER_STRIP) {
        newStrip.push(Math.floor(Math.random() * SYMBOL_IDS.length))
      }

      reelSymbols.value[r] = newStrip
    }

    // Reset offsets to 0 so final symbols (at positions 0,1,2) are visible
    for (let r = 0; r < REEL_COUNT; r++) {
      spinStates.value[r].offsetY = 0
    }

    console.log('[ThreeStage] Updated symbols and reset offsets', {
      reelSymbols: reelSymbols.value.map(r => r.slice(0, 3)),
      offsets: spinStates.value.map(s => s.offsetY)
    })

    // Reset pending state for next spin
    pendingGrid.value = [null, null, null, null, null]
    pendingStopCount.value = 0
  }
}

/** Reset pending state when spin starts */
function handleSpinStart(): void {
  pendingGrid.value = [null, null, null, null, null]
  pendingStopCount.value = 0
  startAllSpins()
}

onMounted(() => {
  console.log('[ThreeStage] Mounted')

  // Defer canvas mount to next frame to ensure DOM is ready for WebGL context
  requestAnimationFrame(() => {
    canvasMounted.value = true
    isReady.value = true
  })

  // Register reel-specific event handlers (now merges with existing handlers)
  console.log('[ThreeStage] Registering animation handlers')
  Animations.setEvents({
    onReelStop: handleReelStop
  })

  unsubSpinStart = props.controller.onSpinStart(() => {
    console.log('[ThreeStage] Spin start')
    handleSpinStart()
  })

  unsubQuickStop = props.controller.onQuickStop(() => {
    requestQuickStop()
  })
})

onUnmounted(() => {
  if (unsubSpinStart) unsubSpinStart()
  if (unsubQuickStop) unsubQuickStop()
})

async function handleStopReels(finalGrid: number[][]): Promise<void> {
  currentGrid.value = finalGrid.map(col => [...col])
  await stopAllReels(finalGrid)
}

defineExpose({
  setGrid: (newGrid: number[][]) => {
    currentGrid.value = newGrid.map(col => [...col])
  },
  resetHighlights: () => {},
  stopAllReels: handleStopReels,
  isSpinning: () => isSpinning.value
})
</script>

<template>
  <div class="three-stage">
    <TresCanvas v-if="canvasMounted" clear-color="#1a0b2e">
      <!-- Camera -->
      <TresPerspectiveCamera :position="[0, 0, 14]" :fov="40" />

      <!-- Lighting -->
      <TresAmbientLight :intensity="0.4" />
      <TresDirectionalLight :position="[5, 8, 5]" :intensity="1.0" color="#fff5e6" />
      <TresPointLight :position="[-6, 2, 4]" :intensity="0.5" color="#ff6b9d" />
      <TresPointLight :position="[0, -3, 5]" :intensity="0.4" color="#9d4edd" />

      <!-- Symbol Strips - one per reel -->
      <TresGroup
        v-for="(reelX, reelIndex) in reelXPositions"
        :key="'reel-' + reelIndex"
        :position="[reelX, centerOffsetY + spinStates[reelIndex].offsetY, 0]"
      >
        <!-- Each symbol in the strip -->
        <TresMesh
          v-for="(symbolId, symIndex) in reelSymbols[reelIndex]"
          :key="'sym-' + reelIndex + '-' + symIndex"
          :position="[0, symIndex * SYMBOL_HEIGHT, 0.01 * symIndex]"
        >
          <TresPlaneGeometry :args="[SYMBOL_WIDTH, SYMBOL_HEIGHT]" />
          <TresMeshBasicMaterial
            :map="textures[symbolId] || null"
            :color="textures[symbolId] ? 0xffffff : 0xff00ff"
            :transparent="true"
            :side="2"
          />
        </TresMesh>
      </TresGroup>

      <!-- Mask - dark planes to hide symbols outside visible area -->
      <!-- Top mask -->
      <TresMesh :position="[0, clipTop + 2, 0.2]">
        <TresPlaneGeometry :args="[FRAME_WIDTH + 2, 4]" />
        <TresMeshBasicMaterial color="#1a0b2e" />
      </TresMesh>
      <!-- Bottom mask -->
      <TresMesh :position="[0, clipBottom - 2, 0.2]">
        <TresPlaneGeometry :args="[FRAME_WIDTH + 2, 4]" />
        <TresMeshBasicMaterial color="#1a0b2e" />
      </TresMesh>

      <!-- Frame (golden border) -->
      <TresGroup :position="[0, 0, 0.5]">
        <!-- Top bar -->
        <TresMesh :position="[0, FRAME_HEIGHT / 2 + BORDER_SIZE / 2, 0]">
          <TresBoxGeometry :args="[FRAME_WIDTH + BORDER_SIZE * 2, BORDER_SIZE, FRAME_DEPTH]" />
          <TresMeshStandardMaterial color="#ffd700" :metalness="0.8" :roughness="0.2" />
        </TresMesh>
        <!-- Bottom bar -->
        <TresMesh :position="[0, -FRAME_HEIGHT / 2 - BORDER_SIZE / 2, 0]">
          <TresBoxGeometry :args="[FRAME_WIDTH + BORDER_SIZE * 2, BORDER_SIZE, FRAME_DEPTH]" />
          <TresMeshStandardMaterial color="#ffd700" :metalness="0.8" :roughness="0.2" />
        </TresMesh>
        <!-- Left bar -->
        <TresMesh :position="[-FRAME_WIDTH / 2 - BORDER_SIZE / 2, 0, 0]">
          <TresBoxGeometry :args="[BORDER_SIZE, FRAME_HEIGHT, FRAME_DEPTH]" />
          <TresMeshStandardMaterial color="#ffd700" :metalness="0.8" :roughness="0.2" />
        </TresMesh>
        <!-- Right bar -->
        <TresMesh :position="[FRAME_WIDTH / 2 + BORDER_SIZE / 2, 0, 0]">
          <TresBoxGeometry :args="[BORDER_SIZE, FRAME_HEIGHT, FRAME_DEPTH]" />
          <TresMeshStandardMaterial color="#ffd700" :metalness="0.8" :roughness="0.2" />
        </TresMesh>

        <!-- Corner spheres -->
        <TresMesh :position="[-FRAME_WIDTH / 2 - BORDER_SIZE / 2, FRAME_HEIGHT / 2 + BORDER_SIZE / 2, FRAME_DEPTH / 2]">
          <TresSphereGeometry :args="[BORDER_SIZE * 0.6, 16, 16]" />
          <TresMeshStandardMaterial color="#b8860b" :metalness="0.9" :roughness="0.1" />
        </TresMesh>
        <TresMesh :position="[FRAME_WIDTH / 2 + BORDER_SIZE / 2, FRAME_HEIGHT / 2 + BORDER_SIZE / 2, FRAME_DEPTH / 2]">
          <TresSphereGeometry :args="[BORDER_SIZE * 0.6, 16, 16]" />
          <TresMeshStandardMaterial color="#b8860b" :metalness="0.9" :roughness="0.1" />
        </TresMesh>
        <TresMesh :position="[-FRAME_WIDTH / 2 - BORDER_SIZE / 2, -FRAME_HEIGHT / 2 - BORDER_SIZE / 2, FRAME_DEPTH / 2]">
          <TresSphereGeometry :args="[BORDER_SIZE * 0.6, 16, 16]" />
          <TresMeshStandardMaterial color="#b8860b" :metalness="0.9" :roughness="0.1" />
        </TresMesh>
        <TresMesh :position="[FRAME_WIDTH / 2 + BORDER_SIZE / 2, -FRAME_HEIGHT / 2 - BORDER_SIZE / 2, FRAME_DEPTH / 2]">
          <TresSphereGeometry :args="[BORDER_SIZE * 0.6, 16, 16]" />
          <TresMeshStandardMaterial color="#b8860b" :metalness="0.9" :roughness="0.1" />
        </TresMesh>

        <!-- Background -->
        <TresMesh :position="[0, 0, -0.5]">
          <TresPlaneGeometry :args="[FRAME_WIDTH, FRAME_HEIGHT]" />
          <TresMeshStandardMaterial color="#0a0514" />
        </TresMesh>

        <!-- Accent lights -->
        <TresPointLight :position="[0, FRAME_HEIGHT / 2 + BORDER_SIZE, 1]" color="#ff6b9d" :intensity="0.3" />
        <TresPointLight :position="[0, -FRAME_HEIGHT / 2 - BORDER_SIZE, 1]" color="#ff6b9d" :intensity="0.2" />
      </TresGroup>

      <!-- Reel dividers (subtle vertical lines between reels) -->
      <TresGroup v-for="(reelX, idx) in reelXPositions.slice(0, -1)" :key="'divider-' + idx">
        <TresMesh :position="[(reelX + reelXPositions[idx + 1]) / 2, 0, 0.3]">
          <TresBoxGeometry :args="[0.05, FRAME_HEIGHT - 0.2, 0.1]" />
          <TresMeshStandardMaterial color="#2a1a4e" :metalness="0.5" :roughness="0.5" />
        </TresMesh>
      </TresGroup>
    </TresCanvas>

    <template v-if="isReady">
      <Overlays :controller="controller" />
      <HUD :controller="controller" />
    </template>
  </div>
</template>

<style scoped>
.three-stage {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>
