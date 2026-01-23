<script setup lang="ts">
/**
 * ReelCylinder - Minimal version for debugging
 */
const props = defineProps<{
  position: [number, number, number]
  reelIndex: number
  spinState: any
  symbols: number[]
  textures: any
}>()

const RADIUS = 1.8
const HEIGHT = 1.8
const SEGMENTS = 12
</script>

<template>
  <TresGroup :position="position">
    <TresMesh>
      <TresCylinderGeometry :args="[RADIUS, RADIUS, HEIGHT, SEGMENTS, 1, true]" />
      <TresMeshStandardMaterial color="#ff6b9d" />
    </TresMesh>
  </TresGroup>
</template>
