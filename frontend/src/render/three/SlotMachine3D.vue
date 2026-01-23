<script setup lang="ts">
/**
 * SlotMachine3D - Premium 3D slot machine renderer using TresJS
 * Replaces 2D Pixi.js rendering with Three.js for Hacksaw/Nolimit-style visuals
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import ReelCylinder from './components/ReelCylinder.vue'
import SlotFrame3D from './components/SlotFrame3D.vue'
import type { GameController } from '../../GameController'
import { useReelSpin } from './composables/useReelSpin'
import { useSymbolTextures } from './composables/useSymbolTextures'

const props = defineProps<{
  controller: GameController
}>()

// Reel configuration
const REEL_COUNT = 5
const REEL_SPACING = 2.2  // Spacing between reels in world units

// Camera setup
const cameraPosition = ref<[number, number, number]>([0, 0, 14])
const cameraFov = ref(40)

// Reel positions (centered around origin)
const reelPositions = computed(() => {
  const positions: [number, number, number][] = []
  const totalWidth = (REEL_COUNT - 1) * REEL_SPACING
  const startX = -totalWidth / 2

  for (let i = 0; i < REEL_COUNT; i++) {
    positions.push([startX + i * REEL_SPACING, 0, 0])
  }
  return positions
})

// Spin state management
const {
  spinStates,
  startAllSpins,
  stopAllReels,
  requestQuickStop,
  isSpinning
} = useReelSpin(REEL_COUNT)

// Symbol textures
const { textures } = useSymbolTextures()

// Grid state (matches backend format: grid[reel][row])
const currentGrid = ref<number[][]>([
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [9, 10, 11],
  [0, 1, 2]
])

// Subscribe to controller events
let unsubscribeSpinStart: (() => void) | null = null
let unsubscribeQuickStop: (() => void) | null = null

onMounted(() => {
  // Listen for spin start to reset highlights and start spinning
  unsubscribeSpinStart = props.controller.onSpinStart(() => {
    startAllSpins()
  })

  // Listen for quick stop to accelerate reel stopping
  unsubscribeQuickStop = props.controller.onQuickStop(() => {
    requestQuickStop()
  })
})

onUnmounted(() => {
  if (unsubscribeSpinStart) unsubscribeSpinStart()
  if (unsubscribeQuickStop) unsubscribeQuickStop()
})

// Expose for parent (matches ReelsView interface)
defineExpose({
  setGrid: (newGrid: number[][]) => {
    currentGrid.value = newGrid.map(col => [...col])
  },
  resetHighlights: () => {
    // TODO: Implement highlight reset
  },
  stopAllReels: async (finalGrid: number[][]) => {
    currentGrid.value = finalGrid.map(col => [...col])
    await stopAllReels(finalGrid)
  },
  isSpinning: () => isSpinning.value
})

// Development mode check
const isDev = import.meta.env.DEV
</script>

<template>
  <TresCanvas
    clear-color="#1a0b2e"
    :shadows="true"
    :alpha="false"
    window-size
  >
    <!-- Camera -->
    <TresPerspectiveCamera
      :position="cameraPosition"
      :fov="cameraFov"
      :near="0.1"
      :far="100"
    />

    <!-- Premium Lighting Setup -->
    <!-- Ambient base -->
    <TresAmbientLight :intensity="0.3" color="#ffffff" />

    <!-- Key Light (45 degrees, warm) -->
    <TresDirectionalLight
      :position="[5, 8, 5]"
      :intensity="1.2"
      color="#fff5e6"
      :cast-shadow="true"
    />

    <!-- Fill Light (soft, cool tint from left) -->
    <TresPointLight
      :position="[-6, 2, 4]"
      :intensity="0.4"
      color="#ff6b9d"
      :decay="2"
    />

    <!-- Rim/Back Light (accent for depth) -->
    <TresPointLight
      :position="[0, -3, -5]"
      :intensity="0.6"
      color="#9d4edd"
      :decay="2"
    />

    <!-- 5 Reel Cylinders -->
    <ReelCylinder
      v-for="(pos, index) in reelPositions"
      :key="index"
      :position="pos"
      :reel-index="index"
      :spin-state="spinStates[index]"
      :symbols="currentGrid[index]"
      :textures="textures"
    />

    <!-- Slot Frame (gold decorative border) -->
    <SlotFrame3D />

    <!-- Development Controls -->
    <OrbitControls v-if="isDev" :enable-damping="true" />
  </TresCanvas>
</template>
