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
import { AssetLoader } from './assets/AssetLoader'
import { setPixiApp as setFallbackPixiApp } from './assets/FallbackSprite'
import { SymbolRenderer } from './pixi/SymbolRenderer'
import { initVFX, destroyVFX } from './vfx'
import ReelsView from './ReelsView.vue'
import Overlays from './Overlays.vue'
import HUD from './HUD.vue'

const props = defineProps<{
  controller: GameController
}>()

const canvasContainer = ref<HTMLDivElement | null>(null)
const pixiApp = ref<Application | null>(null)
const mainContainer = ref<Container | null>(null)
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
  const container = new Container()
  const safeArea = getSafeAreaOffset()
  container.x = safeArea.x
  container.y = safeArea.y
  app.stage.addChild(container)

  // Set up animation library
  Animations.setApp(app)
  Animations.setContainer(container)

  // Set up asset loading
  setFallbackPixiApp(app)
  await AssetLoader.init()

  // Initialize SymbolRenderer for VIP chip textures
  SymbolRenderer.setPixiApp(app)

  if (import.meta.env.DEV) {
    const canvas = app.canvas as HTMLCanvasElement
    console.log('[PixiStage] Renderer vs Canvas:', {
      rendererWidth: app.renderer.width,
      rendererHeight: app.renderer.height,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      canvasCSSWidth: canvas.style.width,
      canvasCSSHeight: canvas.style.height,
      windowInnerWidth: window.innerWidth,
      windowInnerHeight: window.innerHeight,
    })
    console.log('[PixiStage] SymbolRenderer initialized:', {
      isReady: SymbolRenderer.isReady,
      textureHits: SymbolRenderer.textureHits,
    })
  }

  // Initialize VFX system
  initVFX(container)

  pixiApp.value = app
  mainContainer.value = container
  isReady.value = true

  // Handle resize
  window.addEventListener('resize', handleResize)

  // Watch safe area changes
  unwatchSafeArea = watchSafeArea((insets) => {
    if (mainContainer.value) {
      mainContainer.value.x = insets.left
      mainContainer.value.y = insets.top
    }
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
  if (mainContainer.value) {
    mainContainer.value.x = safeArea.x
    mainContainer.value.y = safeArea.y
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
provide('mainContainer', mainContainer)
provide('getGameDimensions', getGameDimensions)

onMounted(async () => {
  await initPixi()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (unwatchSafeArea) {
    unwatchSafeArea()
  }
  destroyVFX()
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
