<script setup lang="ts">
/**
 * ReelsView - 5x3 reel grid component using Pixi.js sprites
 * Thin Vue wrapper around PixiReelsRenderer
 */
import { ref, computed, onMounted, onUnmounted, inject, watch, type Ref } from 'vue'
import type { Application, Container } from 'pixi.js'
import type { GameController } from '../GameController'
import { PixiReelsRenderer, type ReelsLayoutConfig } from './pixi'

const props = defineProps<{
  controller: GameController
}>()

const getGameDimensions = inject<() => { width: number; height: number }>('getGameDimensions')
const pixiApp = inject<Ref<Application | null>>('pixiApp')
const mainContainer = inject<Ref<Container | null>>('mainContainer')

// Renderer instance
const renderer = ref<PixiReelsRenderer | null>(null)
let layoutLogged = false

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

  if (import.meta.env.DEV && !layoutLogged) {
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

// Watch for layout changes and update renderer
watch(layout, (newLayout) => {
  if (renderer.value) {
    renderer.value.updateLayout(newLayout)
    pixiApp?.value?.render?.()
  }
}, { deep: true })

// Subscribe to controller events
let unsubscribe: (() => void) | null = null

onMounted(() => {
  // Get the main Pixi container
  const container = mainContainer?.value
  if (!container) {
    console.warn('[ReelsView] mainContainer not available')
    return
  }

  const layoutValue = layout.value
  if (import.meta.env.DEV) {
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

  // Listen for spin start to reset highlights
  unsubscribe = props.controller.onSpinStart(() => {
    renderer.value?.resetHighlights()
    renderer.value?.startAllSpins()
  })
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
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
