<script setup lang="ts">
import { onMounted, shallowRef, ref } from 'vue'
import { GameController } from './GameController'
import PixiStage from './render/PixiStage.vue'

const gameController = shallowRef<GameController | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const controller = new GameController()
    await controller.boot()
    gameController.value = controller
    loading.value = false
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to initialize game'
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
      Loading...
    </div>
    <div
      v-else-if="error"
      class="error"
    >
      {{ error }}
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
