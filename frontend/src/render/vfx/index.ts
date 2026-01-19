/**
 * VFX Module - Coordinates all visual effects
 * Entry point for VFX initialization and access
 */

import type { Container } from 'pixi.js'
import type { WinTier } from '../../types/events'
import { WinLineHighlighter, type HighlightConfig } from './WinLineHighlighter'
import { ParticleEmitter } from './ParticleEmitter'
import { cameraFeedback } from './CameraFeedback'
import { MotionPrefs } from '../../ux/MotionPrefs'

/** VFX Manager state */
interface VFXState {
  initialized: boolean
  mainContainer: Container | null
  winLineHighlighter: WinLineHighlighter | null
  particleEmitter: ParticleEmitter | null
}

const state: VFXState = {
  initialized: false,
  mainContainer: null,
  winLineHighlighter: null,
  particleEmitter: null,
}

/**
 * Initialize VFX system with main container
 */
export function initVFX(mainContainer: Container): void {
  if (state.initialized) {
    console.warn('[VFX] Already initialized')
    return
  }

  state.mainContainer = mainContainer

  // Create VFX components
  state.winLineHighlighter = new WinLineHighlighter(mainContainer)
  state.particleEmitter = new ParticleEmitter(mainContainer)

  // Set up camera feedback with container
  cameraFeedback.setContainer(mainContainer)

  state.initialized = true
}

/**
 * Update VFX configuration (e.g., after resize)
 */
export function updateVFXConfig(config: Partial<HighlightConfig>): void {
  state.winLineHighlighter?.setConfig(config)
}

/**
 * Highlight winning cells
 */
export async function highlightWinLine(
  positions: number[],
  duration?: number
): Promise<void> {
  if (!state.winLineHighlighter) return
  await state.winLineHighlighter.highlight(positions, duration)
}

/**
 * Clear win line highlights
 */
export function clearHighlights(): void {
  state.winLineHighlighter?.clear()
}

/**
 * Emit particles at position
 */
export function emitParticles(x: number, y: number, count?: number): void {
  state.particleEmitter?.emit(x, y, count)
}

/**
 * Emit particle burst (for celebrations)
 */
export function burstParticles(x: number, y: number, count?: number): void {
  state.particleEmitter?.burst(x, y, count)
}

/**
 * Clear all particles
 */
export function clearParticles(): void {
  state.particleEmitter?.clear()
}

/**
 * Apply camera punch scale
 */
export async function punchScale(intensity?: number): Promise<void> {
  await cameraFeedback.punchScale(intensity)
}

/**
 * Apply camera micro shake
 */
export async function microShake(intensity?: number): Promise<void> {
  await cameraFeedback.microShake(intensity)
}

/**
 * Apply win tier camera effect
 */
export async function winTierEffect(tier: WinTier): Promise<void> {
  if (tier === 'none') return

  // Camera feedback for big wins
  await cameraFeedback.winEffect(tier as 'big' | 'mega' | 'epic')

  // Particles for celebrations (if enabled)
  if (state.particleEmitter?.isEnabled && state.mainContainer) {
    const centerX = state.mainContainer.width / 2
    const centerY = state.mainContainer.height / 2

    switch (tier) {
      case 'big':
        burstParticles(centerX, centerY, 30)
        break
      case 'mega':
        burstParticles(centerX, centerY, 50)
        break
      case 'epic':
        burstParticles(centerX, centerY, 80)
        break
    }
  }
}

/**
 * Clean up all VFX
 */
export function clearAllVFX(): void {
  clearHighlights()
  clearParticles()
  cameraFeedback.cancel()
}

/**
 * Destroy VFX system
 */
export function destroyVFX(): void {
  state.winLineHighlighter?.destroy()
  state.particleEmitter?.destroy()
  cameraFeedback.cancel()

  state.initialized = false
  state.mainContainer = null
  state.winLineHighlighter = null
  state.particleEmitter = null
}

/**
 * Check if VFX is initialized
 */
export function isVFXReady(): boolean {
  return state.initialized
}

/**
 * Get win line highlight duration based on current mode
 * Exposed for tests and external timing coordination
 */
export function getWinLineHighlightDuration(): number {
  if (MotionPrefs.turboEnabled) return 250
  if (MotionPrefs.reduceMotion) return 500
  return 550
}

// Re-export types
export type { HighlightConfig, CellPosition } from './WinLineHighlighter'
export type { EmitterConfig } from './ParticleEmitter'
export type { CameraFeedbackConfig } from './CameraFeedback'
