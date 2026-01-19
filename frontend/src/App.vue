<script setup lang="ts">
import { onMounted, shallowRef, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { GameController } from './GameController'
import PixiStage from './render/PixiStage.vue'
import type { ErrorCode } from './i18n/schema'

const { t } = useI18n()

const gameController = shallowRef<GameController | null>(null)
const errorCode = ref<ErrorCode | null>(null)
const errorMessage = ref<string | null>(null)
const loading = ref(true)

// Display localized error message
const displayError = computed(() => {
  if (errorCode.value) {
    return t(`errors.${errorCode.value}`)
  }
  return errorMessage.value
})

onMounted(async () => {
  try {
    const controller = new GameController()
    await controller.boot()
    gameController.value = controller
    loading.value = false
  } catch (e) {
    // Check if error has a known code
    if (e && typeof e === 'object' && 'code' in e) {
      errorCode.value = (e as { code: ErrorCode }).code
    } else {
      errorMessage.value = e instanceof Error ? e.message : t('errors.INTERNAL_ERROR')
    }
    loading.value = false
  }
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
      class="error"
    >
      {{ displayError }}
    </div>
    <PixiStage
      v-else-if="gameController"
      :controller="gameController!"
    />
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
}

.loading, .error {
  color: #fff;
  font-family: system-ui, sans-serif;
  font-size: 1.5rem;
}

.error {
  color: #ff4444;
}
</style>
