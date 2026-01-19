/**
 * ParticleEmitter - Simple Graphics-based particle system
 * Pure Graphics circles (no textures)
 * OFF in Turbo and ReduceMotion modes
 */

import { Container, Graphics } from 'pixi.js'
import { MotionPrefs } from '../../ux/MotionPrefs'

/** Single particle data */
interface Particle {
  graphic: Graphics
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  scale: number
  color: number
}

/** Emitter configuration */
export interface EmitterConfig {
  /** Maximum active particles */
  maxActive: number
  /** Maximum particle lifetime in ms */
  maxDuration: number
  /** Gravity applied to particles */
  gravity: number
  /** Friction applied to velocity */
  friction: number
  /** Colors to randomly choose from */
  colors: number[]
  /** Min/max particle size */
  sizeMin: number
  sizeMax: number
  /** Min/max initial speed */
  speedMin: number
  speedMax: number
}

/** Default configuration */
const DEFAULT_CONFIG: EmitterConfig = {
  maxActive: 120,
  maxDuration: 400,
  gravity: 0.3,
  friction: 0.98,
  colors: [0xffd700, 0xffec8b, 0xffa500, 0xff6347, 0xffffff],
  sizeMin: 3,
  sizeMax: 8,
  speedMin: 2,
  speedMax: 8,
}

/**
 * ParticleEmitter class
 * Manages particle lifecycle and rendering
 */
export class ParticleEmitter {
  private container: Container
  private config: EmitterConfig
  private particles: Particle[] = []
  private animationFrame: number | null = null
  private lastTime: number = 0

  constructor(parent: Container, config: Partial<EmitterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.container = new Container()
    this.container.label = 'particle-emitter'
    parent.addChild(this.container)
  }

  /**
   * Check if particles are enabled based on motion prefs
   */
  get isEnabled(): boolean {
    return !MotionPrefs.turboEnabled && !MotionPrefs.reduceMotion
  }

  /**
   * Emit particles at a position
   * @param x X position
   * @param y Y position
   * @param count Number of particles to emit
   */
  emit(x: number, y: number, count: number = 20): void {
    // Skip if disabled
    if (!this.isEnabled) return

    // Limit count based on available slots
    const available = this.config.maxActive - this.particles.length
    const toEmit = Math.min(count, available)

    for (let i = 0; i < toEmit; i++) {
      this.createParticle(x, y)
    }

    // Start animation loop if not running
    this.startAnimation()
  }

  /**
   * Emit burst of particles (celebration effect)
   */
  burst(x: number, y: number, count: number = 50): void {
    if (!this.isEnabled) return
    this.emit(x, y, count)
  }

  /**
   * Clear all particles immediately
   */
  clear(): void {
    this.stopAnimation()
    for (const particle of this.particles) {
      particle.graphic.destroy()
    }
    this.particles = []
    this.container.removeChildren()
  }

  /**
   * Destroy the emitter
   */
  destroy(): void {
    this.clear()
    this.container.destroy()
  }

  /**
   * Get current particle count
   */
  get activeCount(): number {
    return this.particles.length
  }

  /**
   * Create a single particle
   */
  private createParticle(x: number, y: number): void {
    const { colors, sizeMin, sizeMax, speedMin, speedMax, maxDuration } = this.config

    // Random properties
    const color = colors[Math.floor(Math.random() * colors.length)]
    const size = sizeMin + Math.random() * (sizeMax - sizeMin)
    const speed = speedMin + Math.random() * (speedMax - speedMin)
    const angle = Math.random() * Math.PI * 2

    // Create graphic
    const graphic = new Graphics()
    graphic.circle(0, 0, size)
    graphic.fill({ color, alpha: 1 })
    graphic.x = x
    graphic.y = y
    this.container.addChild(graphic)

    // Create particle data
    const particle: Particle = {
      graphic,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - speed * 0.5, // Bias upward
      life: maxDuration,
      maxLife: maxDuration,
      scale: 1,
      color,
    }

    this.particles.push(particle)
  }

  /**
   * Update all particles
   */
  private update(deltaTime: number): void {
    const { gravity, friction } = this.config
    const dt = deltaTime / 16.67 // Normalize to ~60fps

    const toRemove: Particle[] = []

    for (const particle of this.particles) {
      // Update physics
      particle.vy += gravity * dt
      particle.vx *= friction
      particle.vy *= friction
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt

      // Update life
      particle.life -= deltaTime

      // Update visual
      const lifeRatio = particle.life / particle.maxLife
      particle.graphic.x = particle.x
      particle.graphic.y = particle.y
      particle.graphic.alpha = lifeRatio
      particle.graphic.scale.set(lifeRatio * particle.scale)

      // Mark for removal if dead
      if (particle.life <= 0) {
        toRemove.push(particle)
      }
    }

    // Remove dead particles
    for (const particle of toRemove) {
      const index = this.particles.indexOf(particle)
      if (index !== -1) {
        this.particles.splice(index, 1)
        particle.graphic.destroy()
      }
    }

    // Stop animation if no particles
    if (this.particles.length === 0) {
      this.stopAnimation()
    }
  }

  /**
   * Start animation loop
   */
  private startAnimation(): void {
    if (this.animationFrame !== null) return

    this.lastTime = performance.now()

    const animate = (time: number) => {
      const deltaTime = time - this.lastTime
      this.lastTime = time

      this.update(deltaTime)

      if (this.particles.length > 0) {
        this.animationFrame = requestAnimationFrame(animate)
      } else {
        this.animationFrame = null
      }
    }

    this.animationFrame = requestAnimationFrame(animate)
  }

  /**
   * Stop animation loop
   */
  private stopAnimation(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
  }
}

/**
 * Factory function for creating a ParticleEmitter
 */
export function createParticleEmitter(
  parent: Container,
  config?: Partial<EmitterConfig>
): ParticleEmitter {
  return new ParticleEmitter(parent, config)
}
