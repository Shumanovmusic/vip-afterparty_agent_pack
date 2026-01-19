<script setup lang="ts">
/**
 * Overlays - Win texts, BOOM, celebration layers, event banners
 * Source of truth: UX_ANIMATION_SPEC.md
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GameController } from '../GameController'
import type { WinTier, EventType } from '../types/events'
import { Animations } from '../ux/animations/AnimationLibrary'
import { MotionPrefs } from '../ux/MotionPrefs'
import { formatWinAmount, formatHeatLevel } from '../i18n/format'

const { t } = useI18n()

const props = defineProps<{
  controller: GameController
}>()

// Overlay states
const showWinPopup = ref(false)
const winAmount = ref(0)
const winPosition = ref({ x: 0, y: 0 })

const showEventBanner = ref(false)
const eventBannerType = ref<EventType | null>(null)
const eventBannerMultiplier = ref<number | null>(null)

const showCelebration = ref(false)
const celebrationTier = ref<WinTier>('none')

const showBoom = ref(false)

const showFreeSpinsEntry = ref(false)
const freeSpinsCount = ref(0)

const showHeatMeter = ref(true)
const heatLevel = ref(0)

// Event banner text
const eventBannerText = computed(() => {
  switch (eventBannerType.value) {
    case 'boost':
      return t('events.boost')
    case 'rage':
      return eventBannerMultiplier.value
        ? t('events.rageMultiplier', { multiplier: eventBannerMultiplier.value })
        : t('events.rage')
    case 'explosive':
      return t('events.explosive')
    case 'bonus':
      return t('events.bonus')
    case 'finale':
      return t('events.finale')
    default:
      return ''
  }
})

// Celebration text
const celebrationText = computed(() => {
  switch (celebrationTier.value) {
    case 'big':
      return t('win.big')
    case 'mega':
      return t('win.mega')
    case 'epic':
      return t('win.epic')
    default:
      return ''
  }
})

// Set up animation event handlers
function setupAnimationHandlers() {
  Animations.setEvents({
    ...Animations,
    onWinTextPopup: (amount, position) => {
      winAmount.value = amount
      winPosition.value = position
      showWinPopup.value = true

      // Auto-hide after duration
      const duration = MotionPrefs.getWinPopupDuration(amount)
      setTimeout(() => {
        showWinPopup.value = false
      }, duration)
    },
    onEventBanner: (type, multiplier) => {
      eventBannerType.value = type
      eventBannerMultiplier.value = multiplier ?? null
      showEventBanner.value = true
    },
    onEnterFreeSpins: (count) => {
      freeSpinsCount.value = count
      showFreeSpinsEntry.value = true

      // Auto-hide
      const duration = MotionPrefs.turboEnabled ? 300 : 1500
      setTimeout(() => {
        showFreeSpinsEntry.value = false
      }, duration)
    },
    onHeatMeterUpdate: (level) => {
      heatLevel.value = level
    },
    onCelebration: (tier) => {
      celebrationTier.value = tier
      showCelebration.value = true

      // Auto-hide after duration
      const duration = MotionPrefs.getCelebrationDuration(tier)
      setTimeout(() => {
        showCelebration.value = false
        celebrationTier.value = 'none'
      }, duration)
    },
    onBoomOverlay: () => {
      if (MotionPrefs.turboEnabled) return

      showBoom.value = true

      const duration = MotionPrefs.reduceMotion ? 200 : 500
      setTimeout(() => {
        showBoom.value = false
      }, duration)
    }
  })
}

// Hide event banner (called by EventRouter)
function hideEventBanner() {
  showEventBanner.value = false
  eventBannerType.value = null
}

// Skip current celebration
function skipCelebration() {
  if (!MotionPrefs.allowSkip) return

  showCelebration.value = false
  showBoom.value = false
  props.controller.skip()
}

let unsubscribe: (() => void) | null = null

onMounted(() => {
  setupAnimationHandlers()

  // Reset on spin start
  unsubscribe = props.controller.onSpinStart(() => {
    showWinPopup.value = false
    showCelebration.value = false
    showBoom.value = false
  })
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})

defineExpose({
  hideEventBanner
})
</script>

<template>
  <div
    class="overlays"
    @click="skipCelebration"
  >
    <!-- Win Amount Popup -->
    <Transition name="pop">
      <div
        v-if="showWinPopup"
        class="win-popup"
        :style="{
          left: `${winPosition.x}px`,
          top: `${winPosition.y}px`
        }"
      >
        {{ formatWinAmount(winAmount) }}
      </div>
    </Transition>

    <!-- Event Banner (BOOST/RAGE/EXPLOSIVE) -->
    <Transition name="slide-down">
      <div
        v-if="showEventBanner"
        class="event-banner"
        :class="`event-${eventBannerType}`"
      >
        {{ eventBannerText }}
      </div>
    </Transition>

    <!-- Free Spins Entry -->
    <Transition name="zoom">
      <div
        v-if="showFreeSpinsEntry"
        class="free-spins-entry"
      >
        <div class="fs-title">
          {{ t('bonus.freeSpins') }}
        </div>
        <div class="fs-count">
          {{ t('bonus.spinsCount', { count: freeSpinsCount }) }}
        </div>
      </div>
    </Transition>

    <!-- Heat Meter -->
    <div
      v-if="showHeatMeter"
      class="heat-meter"
    >
      <div class="heat-label">
        {{ t('events.heat') }}
      </div>
      <div class="heat-bar">
        <div
          class="heat-fill"
          :style="{ width: `${heatLevel * 10}%` }"
        />
      </div>
      <div class="heat-level">
        {{ formatHeatLevel(heatLevel) }}
      </div>
    </div>

    <!-- BOOM Overlay -->
    <Transition name="boom">
      <div
        v-if="showBoom"
        class="boom-overlay"
      >
        {{ t('events.boom') }}
      </div>
    </Transition>

    <!-- Celebration Overlay -->
    <Transition name="celebration">
      <div
        v-if="showCelebration && celebrationTier !== 'none'"
        class="celebration"
        :class="`celebration-${celebrationTier}`"
      >
        <div class="celebration-text">
          {{ celebrationText }}
        </div>
        <div
          v-if="!MotionPrefs.reduceMotion && !MotionPrefs.turboEnabled"
          class="celebration-particles"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.overlays {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 100;
}

/* Win Popup */
.win-popup {
  position: absolute;
  transform: translate(-50%, -50%);
  color: #ffd700;
  font-size: 2rem;
  font-weight: bold;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}

.pop-enter-active {
  animation: pop-in 0.3s ease-out;
}

.pop-leave-active {
  animation: pop-out 0.2s ease-in;
}

@keyframes pop-in {
  from {
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
  }
  to {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
}

@keyframes pop-out {
  from {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  to {
    transform: translate(-50%, -100%) scale(0.8);
    opacity: 0;
  }
}

/* Event Banner */
.event-banner {
  position: absolute;
  top: 15%;
  left: 50%;
  transform: translateX(-50%);
  padding: 16px 48px;
  border-radius: 8px;
  font-size: 2rem;
  font-weight: bold;
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.event-boost {
  background: linear-gradient(135deg, #3498db, #2980b9);
}

.event-rage {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  animation: pulse-red 0.5s ease-in-out infinite;
}

.event-explosive {
  background: linear-gradient(135deg, #f39c12, #e67e22);
}

.event-bonus {
  background: linear-gradient(135deg, #9b59b6, #8e44ad);
}

.event-finale {
  background: linear-gradient(135deg, #ffd700, #ff8c00);
  color: #1a0a2e;
}

@keyframes pulse-red {
  0%, 100% { box-shadow: 0 0 20px rgba(231, 76, 60, 0.5); }
  50% { box-shadow: 0 0 40px rgba(231, 76, 60, 0.8); }
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from {
  transform: translateX(-50%) translateY(-100%);
  opacity: 0;
}

.slide-down-leave-to {
  transform: translateX(-50%) translateY(-50%);
  opacity: 0;
}

/* Free Spins Entry */
.free-spins-entry {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: white;
  pointer-events: all;
}

.fs-title {
  font-size: 3rem;
  font-weight: bold;
  color: #ffd700;
  text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
  margin-bottom: 16px;
}

.fs-count {
  font-size: 2rem;
  color: white;
}

.zoom-enter-active {
  animation: zoom-in 0.5s ease-out;
}

.zoom-leave-active {
  animation: zoom-out 0.3s ease-in;
}

@keyframes zoom-in {
  from {
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
  }
  to {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
}

@keyframes zoom-out {
  from {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  to {
    transform: translate(-50%, -50%) scale(1.2);
    opacity: 0;
  }
}

/* Heat Meter */
.heat-meter {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.heat-label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
  font-weight: bold;
}

.heat-bar {
  width: 100px;
  height: 12px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  overflow: hidden;
}

.heat-fill {
  height: 100%;
  background: linear-gradient(90deg, #f39c12, #e74c3c);
  transition: width 0.3s ease-out;
}

.heat-level {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
}

/* BOOM Overlay */
.boom-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 6rem;
  font-weight: bold;
  color: #ff6b00;
  text-shadow:
    0 0 20px rgba(255, 107, 0, 0.8),
    0 0 40px rgba(255, 107, 0, 0.6);
  pointer-events: none;
}

.boom-enter-active {
  animation: boom-in 0.2s ease-out;
}

.boom-leave-active {
  animation: boom-out 0.3s ease-in;
}

@keyframes boom-in {
  from {
    transform: translate(-50%, -50%) scale(0.5);
    opacity: 0;
  }
  to {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
}

@keyframes boom-out {
  from {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  to {
    transform: translate(-50%, -50%) scale(1.5);
    opacity: 0;
  }
}

/* Celebrations */
.celebration {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: all;
}

.celebration-big {
  background: radial-gradient(circle, rgba(255, 215, 0, 0.3) 0%, transparent 70%);
}

.celebration-mega {
  background: radial-gradient(circle, rgba(255, 107, 0, 0.4) 0%, transparent 70%);
}

.celebration-epic {
  background: radial-gradient(circle, rgba(255, 0, 128, 0.4) 0%, transparent 70%);
}

.celebration-text {
  font-size: 4rem;
  font-weight: bold;
  text-shadow: 0 0 30px currentColor;
}

.celebration-big .celebration-text {
  color: #ffd700;
}

.celebration-mega .celebration-text {
  color: #ff6b00;
}

.celebration-epic .celebration-text {
  color: #ff0080;
  animation: epic-pulse 0.5s ease-in-out infinite;
}

@keyframes epic-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.celebration-enter-active {
  animation: celebration-in 0.5s ease-out;
}

.celebration-leave-active {
  animation: celebration-out 0.3s ease-in;
}

@keyframes celebration-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes celebration-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
</style>
