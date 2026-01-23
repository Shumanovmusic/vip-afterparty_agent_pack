<script setup lang="ts">
/**
 * SlotFrame3D - Decorative gold frame around the slot reels
 * Premium metallic border with subtle glow effect
 */
import { ref } from 'vue'

// Frame dimensions (matches reel layout)
const FRAME_WIDTH = 12      // Total width encompassing all 5 reels
const FRAME_HEIGHT = 6      // Height for 3 visible rows
const FRAME_DEPTH = 0.3     // Depth of frame border
const BORDER_SIZE = 0.4     // Width of the border

// Frame colors
const GOLD_COLOR = 0xffd700
const GOLD_DARK = 0xb8860b
const ACCENT_COLOR = 0xff6b9d

// Position (slightly in front of reels)
const framePosition = ref<[number, number, number]>([0, 0, 0.5])
</script>

<template>
  <TresGroup :position="framePosition">
    <!-- Top border bar -->
    <TresMesh :position="[0, FRAME_HEIGHT / 2 + BORDER_SIZE / 2, 0]">
      <TresBoxGeometry :args="[FRAME_WIDTH + BORDER_SIZE * 2, BORDER_SIZE, FRAME_DEPTH]" />
      <TresMeshStandardMaterial
        :color="GOLD_COLOR"
        :metalness="0.8"
        :roughness="0.2"
      />
    </TresMesh>

    <!-- Bottom border bar -->
    <TresMesh :position="[0, -FRAME_HEIGHT / 2 - BORDER_SIZE / 2, 0]">
      <TresBoxGeometry :args="[FRAME_WIDTH + BORDER_SIZE * 2, BORDER_SIZE, FRAME_DEPTH]" />
      <TresMeshStandardMaterial
        :color="GOLD_COLOR"
        :metalness="0.8"
        :roughness="0.2"
      />
    </TresMesh>

    <!-- Left border bar -->
    <TresMesh :position="[-FRAME_WIDTH / 2 - BORDER_SIZE / 2, 0, 0]">
      <TresBoxGeometry :args="[BORDER_SIZE, FRAME_HEIGHT, FRAME_DEPTH]" />
      <TresMeshStandardMaterial
        :color="GOLD_COLOR"
        :metalness="0.8"
        :roughness="0.2"
      />
    </TresMesh>

    <!-- Right border bar -->
    <TresMesh :position="[FRAME_WIDTH / 2 + BORDER_SIZE / 2, 0, 0]">
      <TresBoxGeometry :args="[BORDER_SIZE, FRAME_HEIGHT, FRAME_DEPTH]" />
      <TresMeshStandardMaterial
        :color="GOLD_COLOR"
        :metalness="0.8"
        :roughness="0.2"
      />
    </TresMesh>

    <!-- Corner accents (top-left) -->
    <TresMesh :position="[-FRAME_WIDTH / 2 - BORDER_SIZE / 2, FRAME_HEIGHT / 2 + BORDER_SIZE / 2, FRAME_DEPTH / 2]">
      <TresSphereGeometry :args="[BORDER_SIZE * 0.6, 16, 16]" />
      <TresMeshStandardMaterial
        :color="GOLD_DARK"
        :metalness="0.9"
        :roughness="0.1"
      />
    </TresMesh>

    <!-- Corner accents (top-right) -->
    <TresMesh :position="[FRAME_WIDTH / 2 + BORDER_SIZE / 2, FRAME_HEIGHT / 2 + BORDER_SIZE / 2, FRAME_DEPTH / 2]">
      <TresSphereGeometry :args="[BORDER_SIZE * 0.6, 16, 16]" />
      <TresMeshStandardMaterial
        :color="GOLD_DARK"
        :metalness="0.9"
        :roughness="0.1"
      />
    </TresMesh>

    <!-- Corner accents (bottom-left) -->
    <TresMesh :position="[-FRAME_WIDTH / 2 - BORDER_SIZE / 2, -FRAME_HEIGHT / 2 - BORDER_SIZE / 2, FRAME_DEPTH / 2]">
      <TresSphereGeometry :args="[BORDER_SIZE * 0.6, 16, 16]" />
      <TresMeshStandardMaterial
        :color="GOLD_DARK"
        :metalness="0.9"
        :roughness="0.1"
      />
    </TresMesh>

    <!-- Corner accents (bottom-right) -->
    <TresMesh :position="[FRAME_WIDTH / 2 + BORDER_SIZE / 2, -FRAME_HEIGHT / 2 - BORDER_SIZE / 2, FRAME_DEPTH / 2]">
      <TresSphereGeometry :args="[BORDER_SIZE * 0.6, 16, 16]" />
      <TresMeshStandardMaterial
        :color="GOLD_DARK"
        :metalness="0.9"
        :roughness="0.1"
      />
    </TresMesh>

    <!-- Background panel (dark behind reels) -->
    <TresMesh :position="[0, 0, -0.5]">
      <TresPlaneGeometry :args="[FRAME_WIDTH, FRAME_HEIGHT]" />
      <TresMeshStandardMaterial
        color="#0a0514"
        :metalness="0.1"
        :roughness="0.95"
      />
    </TresMesh>

    <!-- Decorative accent lights (top) -->
    <TresPointLight
      :position="[0, FRAME_HEIGHT / 2 + BORDER_SIZE, 1]"
      :color="ACCENT_COLOR"
      :intensity="0.3"
      :decay="2"
      :distance="5"
    />

    <!-- Decorative accent lights (bottom) -->
    <TresPointLight
      :position="[0, -FRAME_HEIGHT / 2 - BORDER_SIZE, 1]"
      :color="ACCENT_COLOR"
      :intensity="0.2"
      :decay="2"
      :distance="5"
    />
  </TresGroup>
</template>
