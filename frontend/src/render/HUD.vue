<script setup lang="ts">
/**
 * HUD - Spin button, bet selector, toggles
 * Controls for the slot game interface
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GameController } from '../GameController'
import { GameModeStore } from '../state/GameModeStore'
import { MotionPrefs } from '../ux/MotionPrefs'
import { audioService } from '../audio/AudioService'

const { t } = useI18n()

const props = defineProps<{
  controller: GameController
}>()

// State
const selectedBetIndex = ref(0)
const isSpinning = ref(false)
const turboEnabled = ref(MotionPrefs.turboEnabled)
const hypeModeEnabled = ref(false)
const reduceMotion = ref(MotionPrefs.reduceMotion)
const showSettings = ref(false)

// Game mode state (from GameModeStore)
const gameMode = ref(GameModeStore.mode)
const spinsRemaining = ref(GameModeStore.spinsRemaining)
const isInFreeSpins = computed(() => gameMode.value === 'FREE_SPINS')

// Configuration from controller
const config = computed(() => props.controller.configuration)
const allowedBets = computed(() => config.value?.allowedBets || [1.00])
const currentBet = computed(() => allowedBets.value[selectedBetIndex.value])
const canSpin = computed(() => props.controller.canSpin() && !isSpinning.value)

// Feature flags
const enableTurbo = computed(() => config.value?.enableTurbo ?? true)
const enableBuyFeature = computed(() => config.value?.enableBuyFeature ?? false)
const enableHypeMode = computed(() => config.value?.enableHypeModeAnteBet ?? false)

// Buy feature disabled during FREE_SPINS mode
const canBuyFeature = computed(() =>
  enableBuyFeature.value && !isSpinning.value && !isInFreeSpins.value
)

// Hype mode disabled during FREE_SPINS mode
const canToggleHypeMode = computed(() =>
  enableHypeMode.value && !isInFreeSpins.value
)

// Formatted bet display
const betDisplay = computed(() => {
  return `$${currentBet.value.toFixed(2)}`
})

// Handle spin button click
async function handleSpin() {
  if (import.meta.env.DEV) {
    console.log('SPIN POINTERDOWN', { canSpin: canSpin.value, bet: currentBet.value, hype: hypeModeEnabled.value })
  }

  if (!canSpin.value) {
    if (import.meta.env.DEV) {
      console.warn('[HUD] Spin blocked: canSpin=false')
    }
    return
  }

  // UI click sound
  audioService.playUIClick()

  isSpinning.value = true

  try {
    await props.controller.requestSpin(currentBet.value, hypeModeEnabled.value)
  } finally {
    isSpinning.value = false
  }
}

// Handle buy feature
async function handleBuyFeature() {
  if (!canBuyFeature.value) return

  // UI click sound
  audioService.playUIClick()

  isSpinning.value = true

  try {
    await props.controller.requestBuyFeature(currentBet.value)
  } finally {
    isSpinning.value = false
  }
}

// Adjust bet
function adjustBet(delta: number) {
  const newIndex = selectedBetIndex.value + delta
  if (newIndex >= 0 && newIndex < allowedBets.value.length) {
    audioService.playUIClick()
    selectedBetIndex.value = newIndex
  }
}

// Toggle turbo
function toggleTurbo() {
  audioService.playUIClick()
  turboEnabled.value = !turboEnabled.value
  MotionPrefs.turboEnabled = turboEnabled.value
}

// Toggle hype mode
function toggleHypeMode() {
  audioService.playUIClick()
  hypeModeEnabled.value = !hypeModeEnabled.value
}

// Toggle reduce motion
function toggleReduceMotion() {
  audioService.playUIClick()
  reduceMotion.value = !reduceMotion.value
  MotionPrefs.reduceMotion = reduceMotion.value
}

// Toggle settings panel
function toggleSettings() {
  audioService.playUIClick()
  showSettings.value = !showSettings.value
}

// Watch for external preference changes
let unsubscribePrefs: (() => void) | null = null
let unsubscribeGameMode: (() => void) | null = null

onMounted(() => {
  unsubscribePrefs = MotionPrefs.onChange((prefs) => {
    turboEnabled.value = prefs.turboEnabled
    reduceMotion.value = prefs.reduceMotion
  })

  // Subscribe to game mode changes
  unsubscribeGameMode = GameModeStore.onChange((state) => {
    gameMode.value = state.mode
    spinsRemaining.value = state.spinsRemaining
  })
})

onUnmounted(() => {
  if (unsubscribePrefs) unsubscribePrefs()
  if (unsubscribeGameMode) unsubscribeGameMode()
})

// Watch for spin state changes
watch(() => props.controller.stateMachine.state, (state) => {
  isSpinning.value = state !== 'IDLE' && state !== 'BOOT'
})
</script>

<template>
  <div class="hud">
    <!-- Top bar: Settings toggle -->
    <div class="top-bar">
      <button
        class="settings-btn"
        @click="toggleSettings"
      >
        <span class="icon">&#9881;</span>
      </button>
    </div>

    <!-- Settings panel -->
    <Transition name="slide-up">
      <div
        v-if="showSettings"
        class="settings-panel"
      >
        <div class="setting-row">
          <span class="setting-label">{{ t('hud.turbo') }}</span>
          <button
            class="toggle-btn"
            :class="{ active: turboEnabled }"
            :disabled="!enableTurbo"
            @click="toggleTurbo"
          >
            {{ turboEnabled ? t('common.on') : t('common.off') }}
          </button>
        </div>

        <div class="setting-row">
          <span class="setting-label">{{ t('hud.reduceMotion') }}</span>
          <button
            class="toggle-btn"
            :class="{ active: reduceMotion }"
            @click="toggleReduceMotion"
          >
            {{ reduceMotion ? t('common.on') : t('common.off') }}
          </button>
        </div>

        <div
          v-if="enableHypeMode"
          class="setting-row"
        >
          <span class="setting-label">{{ t('hud.hype') }}</span>
          <button
            class="toggle-btn hype"
            :class="{ active: hypeModeEnabled }"
            :disabled="!canToggleHypeMode"
            @click="toggleHypeMode"
          >
            {{ hypeModeEnabled ? t('common.on') : t('common.off') }}
          </button>
        </div>
      </div>
    </Transition>

    <!-- Control dock with safe area padding -->
    <div class="control-dock">
      <div class="bottom-controls">
        <!-- Bet selector -->
        <div class="bet-selector">
          <button
            class="bet-btn"
            :disabled="selectedBetIndex <= 0"
            @click="adjustBet(-1)"
          >
            -
          </button>
          <div class="bet-display">
            <span class="bet-label">{{ t('hud.bet') }}</span>
            <span class="bet-value">{{ betDisplay }}</span>
          </div>
          <button
            class="bet-btn"
            :disabled="selectedBetIndex >= allowedBets.length - 1"
            @click="adjustBet(1)"
          >
            +
          </button>
        </div>

        <!-- Spin button -->
        <button
          class="spin-btn"
          :class="{
            spinning: isSpinning,
            turbo: turboEnabled,
            hype: hypeModeEnabled
          }"
          :disabled="!canSpin"
          @click="handleSpin"
        >
          <span
            v-if="!isSpinning"
            class="spin-text"
          >{{ t('hud.spin') }}</span>
          <span
            v-else
            class="spin-text spinning"
          >{{ t('hud.spinning') }}</span>
        </button>

        <!-- Buy Feature button (disabled during FREE_SPINS) -->
        <button
          v-if="enableBuyFeature"
          class="buy-btn"
          :disabled="!canBuyFeature"
          @click="handleBuyFeature"
        >
          <span class="buy-label">{{ t('hud.buy') }}</span>
          <span class="buy-cost">{{ t('hud.buyCost', { cost: 100 }) }}</span>
        </button>
      </div>
    </div>

    <!-- FREE_SPINS mode indicator -->
    <div
      v-if="isInFreeSpins"
      class="free-spins-indicator"
    >
      <span class="fs-label">{{ t('bonus.freeSpins') }}</span>
      <span class="fs-remaining">{{ t('bonus.spinsRemaining', { count: spinsRemaining }) }}</span>
    </div>

    <!-- Hype mode indicator -->
    <div
      v-if="hypeModeEnabled && !isInFreeSpins"
      class="hype-indicator"
    >
      {{ t('hud.hypeModeActive') }}
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  pointer-events: none;
  z-index: 200;
}

.hud > * {
  pointer-events: auto;
}

/* Top bar */
.top-bar {
  position: absolute;
  top: 16px;
  left: 16px;
}

.settings-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: white;
  font-size: 1.5rem;
  cursor: pointer;
  transition: background 0.2s;
}

.settings-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Settings panel */
.settings-panel {
  position: absolute;
  top: 70px;
  left: 16px;
  background: rgba(0, 0, 0, 0.9);
  border-radius: 12px;
  padding: 16px;
  min-width: 200px;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.setting-row:not(:last-child) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.setting-label {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.875rem;
}

.toggle-btn {
  padding: 6px 16px;
  border-radius: 16px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.75rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn.active {
  background: #3498db;
  color: white;
}

.toggle-btn.hype.active {
  background: linear-gradient(135deg, #e74c3c, #ff6b00);
}

.toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(-20px);
  opacity: 0;
}

/* Control dock - VIP styled bottom area with safe area */
.control-dock {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px 16px calc(env(safe-area-inset-bottom, 34px) + 16px);
  background: linear-gradient(
    to top,
    rgba(42, 11, 63, 0.95) 0%,
    rgba(42, 11, 63, 0.8) 60%,
    rgba(42, 11, 63, 0) 100%
  );
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* Bottom controls */
.bottom-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

/* Bet selector */
.bet-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bet-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 20px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bet-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.bet-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.bet-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 80px;
}

.bet-label {
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
}

.bet-value {
  font-size: 1.25rem;
  color: white;
  font-weight: bold;
}

/* Spin button */
.spin-btn {
  width: 92px;
  height: 92px;
  border-radius: 50%;
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  border: 4px solid rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 1.25rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 20px rgba(231, 76, 60, 0.4);
}

.spin-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 6px 30px rgba(231, 76, 60, 0.6);
}

.spin-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.spin-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spin-btn.turbo {
  background: linear-gradient(135deg, #3498db, #2980b9);
  box-shadow: 0 4px 20px rgba(52, 152, 219, 0.4);
}

.spin-btn.hype {
  background: linear-gradient(135deg, #ff6b00, #e74c3c);
  box-shadow: 0 4px 20px rgba(255, 107, 0, 0.4);
  animation: pulse-hype 1s ease-in-out infinite;
}

@keyframes pulse-hype {
  0%, 100% { box-shadow: 0 4px 20px rgba(255, 107, 0, 0.4); }
  50% { box-shadow: 0 4px 40px rgba(255, 107, 0, 0.8); }
}

.spin-btn.spinning {
  animation: spin-pulse 0.5s ease-in-out infinite;
}

@keyframes spin-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.spin-text {
  display: block;
}

/* Buy Feature button */
.buy-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 20px;
  border-radius: 12px;
  background: linear-gradient(135deg, #9b59b6, #8e44ad);
  border: none;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.buy-btn:hover:not(:disabled) {
  transform: scale(1.05);
}

.buy-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.buy-label {
  font-size: 0.75rem;
  font-weight: bold;
}

.buy-cost {
  font-size: 1rem;
  color: #ffd700;
}

/* Hype mode indicator */
.hype-indicator {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 24px;
  background: linear-gradient(135deg, #ff6b00, #e74c3c);
  border-radius: 20px;
  color: white;
  font-size: 0.75rem;
  font-weight: bold;
  animation: pulse-hype 1s ease-in-out infinite;
}

/* FREE_SPINS mode indicator */
.free-spins-indicator {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 32px;
  background: linear-gradient(135deg, #9b59b6, #8e44ad);
  border-radius: 24px;
  color: white;
  text-align: center;
  box-shadow: 0 4px 20px rgba(155, 89, 182, 0.4);
  animation: pulse-bonus 1.5s ease-in-out infinite;
}

.free-spins-indicator .fs-label {
  display: block;
  font-size: 0.875rem;
  font-weight: bold;
  color: #ffd700;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
}

.free-spins-indicator .fs-remaining {
  display: block;
  font-size: 0.75rem;
  margin-top: 4px;
}

@keyframes pulse-bonus {
  0%, 100% { box-shadow: 0 4px 20px rgba(155, 89, 182, 0.4); }
  50% { box-shadow: 0 4px 40px rgba(155, 89, 182, 0.7); }
}
</style>
