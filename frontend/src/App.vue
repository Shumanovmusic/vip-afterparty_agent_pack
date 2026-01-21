<script setup lang="ts">
import { onMounted, shallowRef, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { GameController } from './GameController'
import PixiStage from './render/PixiStage.vue'
import type { ErrorCode } from './i18n/schema'
import { AssetLoader } from './render/assets/AssetLoader'
import { SymbolRenderer } from './render/pixi/SymbolRenderer'

// Build info (injected by Vite define)
declare const __BUILD_SHA__: string
declare const __BUILD_TIME__: string

const BUILD_INFO = {
  sha: typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev',
  time: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString(),
  mode: import.meta.env.MODE
}

// Atlas diagnostics (dev only)
const atlasDiag = ref<{ mode: string; atlasHits: number; fallbackHits: number } | null>(null)
const isDev = import.meta.env.DEV

// Log build info on boot
console.log(`[BUILD] sha=${BUILD_INFO.sha}, time=${BUILD_INFO.time}, mode=${BUILD_INFO.mode}`)

const { t } = useI18n()

const gameController = shallowRef<GameController | null>(null)
const errorCode = ref<ErrorCode | null>(null)
const errorMessage = ref<string | null>(null)
const loading = ref(true)
const canRetry = ref(false)

// Display localized error message
const displayError = computed(() => {
  if (errorCode.value) {
    return t(`errors.${errorCode.value}`)
  }
  return errorMessage.value
})

async function bootGame() {
  loading.value = true
  errorCode.value = null
  errorMessage.value = null
  canRetry.value = false

  try {
    const controller = new GameController()
    await controller.boot()
    gameController.value = controller
    loading.value = false

    // Collect atlas diagnostics after boot (dev only)
    // Poll until mode != idle (textures may be requested after Pixi init)
    if (isDev) {
      const pollDiagnostics = () => {
        const rawDiag = AssetLoader.getDiagnostics()

        // Override mode to 'mixed' if SymbolRenderer is active
        const symbolRendererActive = SymbolRenderer.isReady && SymbolRenderer.textureHits > 0
        const mode = symbolRendererActive ? 'mixed' : rawDiag.mode
        const diag = { ...rawDiag, mode }

        atlasDiag.value = diag
        if (rawDiag.mode === 'idle' && !symbolRendererActive) {
          // Keep polling until textures are actually requested
          setTimeout(pollDiagnostics, 250)
        } else {
          console.log(`[ATLAS] mode=${diag.mode}, atlas=${diag.atlasHits}, fallback=${diag.fallbackHits}, symbolRenderer=${SymbolRenderer.textureHits}`, diag)
        }
      }
      setTimeout(pollDiagnostics, 100)
    }
  } catch (e) {
    // Check if error has a known code
    if (e && typeof e === 'object' && 'code' in e) {
      errorCode.value = (e as { code: ErrorCode }).code
    } else {
      errorMessage.value = e instanceof Error ? e.message : t('errors.INTERNAL_ERROR')
    }
    loading.value = false
    canRetry.value = true // Allow retry on any init failure
    console.error('[App] Boot failed, retry available:', e)
  }
}

onMounted(() => {
  bootGame()
})
</script>

<template>
  <div class="app-container">
    <div
      v-if="loading"
      class="loading"
    >
      {{ t('common.loading') }}
    </div>
    <div
      v-else-if="displayError"
      class="error-container"
    >
      <div class="error">
        {{ displayError }}
      </div>
      <button
        v-if="canRetry"
        class="retry-btn"
        @click="bootGame"
      >
        {{ t('common.retry') || 'Retry' }}
      </button>
    </div>
    <PixiStage
      v-else-if="gameController"
      :controller="gameController!"
    />

    <!-- Debug badge (bottom-left) -->
    <div class="debug-badge">
      {{ BUILD_INFO.sha }} | {{ BUILD_INFO.mode }}
    </div>

    <!-- Atlas status badge (dev only, bottom-left above build badge) -->
    <div
      v-if="isDev && atlasDiag"
      class="atlas-badge"
      :class="atlasDiag.mode"
    >
      ATLAS: {{ atlasDiag.mode.toUpperCase() }}
      <span
        v-if="atlasDiag.mode === 'fallback'"
        class="atlas-warn"
      >
        ({{ atlasDiag.fallbackHits }} textures)
      </span>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a0a2e 0%, #0a0a1a 100%);
  position: relative;
}

.loading, .error {
  color: #fff;
  font-family: system-ui, sans-serif;
  font-size: 1.5rem;
}

.error {
  color: #ff4444;
}

.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.retry-btn {
  padding: 12px 24px;
  font-size: 1rem;
  font-weight: bold;
  color: #fff;
  background: #3498db;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.retry-btn:hover {
  background: #2980b9;
}

.debug-badge {
  position: fixed;
  bottom: 8px;
  left: 8px;
  padding: 4px 8px;
  font-size: 10px;
  font-family: monospace;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  pointer-events: none;
  z-index: 9999;
}

.atlas-badge {
  position: fixed;
  bottom: 28px;
  left: 8px;
  padding: 4px 8px;
  font-size: 10px;
  font-family: monospace;
  font-weight: bold;
  border-radius: 4px;
  pointer-events: none;
  z-index: 9999;
}

.atlas-badge.atlas {
  color: #2ecc71;
  background: rgba(46, 204, 113, 0.2);
  border: 1px solid rgba(46, 204, 113, 0.4);
}

.atlas-badge.fallback {
  color: #ff6b6b;
  background: rgba(255, 107, 107, 0.2);
  border: 1px solid rgba(255, 107, 107, 0.4);
}

.atlas-badge.mixed {
  color: #f39c12;
  background: rgba(243, 156, 18, 0.2);
  border: 1px solid rgba(243, 156, 18, 0.4);
}

.atlas-badge.idle {
  color: rgba(255, 255, 255, 0.5);
  background: rgba(0, 0, 0, 0.3);
}

.atlas-warn {
  font-weight: normal;
  opacity: 0.8;
}
</style>
