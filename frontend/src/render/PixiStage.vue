<script setup lang="ts">
/**
 * PixiStage - Root Pixi.js stage component
 * Initializes Pixi Application and handles resize/safe area
 */
import { ref, onMounted, onUnmounted, provide } from 'vue'
import { Application, Container } from 'pixi.js'
import type { GameController } from '../GameController'
import { getSafeAreaOffset, watchSafeArea } from '../ux/SafeArea'
import { Animations } from '../ux/animations/AnimationLibrary'
import ReelsView from './ReelsView.vue'
import Overlays from './Overlays.vue'
import HUD from './HUD.vue'

const props = defineProps<{
  controller: GameController
}>()

const canvasContainer = ref<HTMLDivElement | null>(null)
const pixiApp = ref<Application | null>(null)
const isReady = ref(false)

// Provide controller to child components
provide('gameController', props.controller)

let unwatchSafeArea: (() => void) | null = null

/** Initialize Pixi Application */
async function initPixi() {
  if (!canvasContainer.value) return

  const app = new Application()

  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x0a0a1a,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: true,
    powerPreference: 'high-performance'
  })

  canvasContainer.value.appendChild(app.canvas as HTMLCanvasElement)

  // Create main container with safe area offset
  const mainContainer = new Container()
  const safeArea = getSafeAreaOffset()
  mainContainer.x = safeArea.x
  mainContainer.y = safeArea.y
  app.stage.addChild(mainContainer)

  // Set up animation library
  Animations.setApp(app)
  Animations.setContainer(mainContainer)

  pixiApp.value = app
  isReady.value = true

  // Handle resize
  window.addEventListener('resize', handleResize)

  // Watch safe area changes
  unwatchSafeArea = watchSafeArea((insets) => {
    mainContainer.x = insets.left
    mainContainer.y = insets.top
    handleResize()
  })
}

/** Handle window resize */
function handleResize() {
  if (!pixiApp.value) return

  const app = pixiApp.value
  app.renderer.resize(window.innerWidth, window.innerHeight)

  // Update main container bounds
  const safeArea = getSafeAreaOffset()
  const mainContainer = app.stage.children[0] as Container
  if (mainContainer) {
    mainContainer.x = safeArea.x
    mainContainer.y = safeArea.y
  }
}

/** Get game dimensions (accounting for safe area) */
function getGameDimensions(): { width: number; height: number } {
  const safeArea = getSafeAreaOffset()
  return {
    width: window.innerWidth - safeArea.width,
    height: window.innerHeight - safeArea.height
  }
}

// Expose for child components
provide('pixiApp', pixiApp)
provide('getGameDimensions', getGameDimensions)

onMounted(async () => {
  await initPixi()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (unwatchSafeArea) {
    unwatchSafeArea()
  }
  if (pixiApp.value) {
    pixiApp.value.destroy(true, { children: true })
  }
})
</script>

<template>
  <div class="pixi-stage">
    <div
      ref="canvasContainer"
      class="canvas-container"
    />

    <!-- Vue overlay components (positioned over canvas) -->
    <template v-if="isReady">
      <ReelsView :controller="controller" />
      <Overlays :controller="controller" />
      <HUD :controller="controller" />
    </template>
  </div>
</template>

<style scoped>
.pixi-stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.canvas-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.canvas-container canvas {
  display: block;
  width: 100% !important;
  height: 100% !important;
}
</style>
