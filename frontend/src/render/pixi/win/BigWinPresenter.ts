/**
 * BigWinPresenter - Full-screen overlay celebration for Big/Mega/Epic wins
 * Displays tier-based celebration with count-up animation, rays, and skip functionality
 */

import { Container, Graphics, Text, Ticker } from 'pixi.js'
import { MotionPrefs, WIN_TIER_THRESHOLDS } from '../../../ux/MotionPrefs'
import { DEBUG_FLAGS } from '../DebugFlags'

/** Win tier enum for internal use */
export enum WinTier {
  NONE = 'none',
  BIG = 'big',
  MEGA = 'mega',
  EPIC = 'epic'
}

/** Configuration for presenting a big win */
export interface BigWinConfig {
  totalWin: number
  tier: WinTier
  currencySymbol: string
  onComplete: () => void
}

/** Duration configuration by tier (ms) */
const DURATION = {
  BIG: { normal: 900, turbo: 350, reduced: 350 },
  MEGA: { normal: 1400, turbo: 500, reduced: 350 },
  EPIC: { normal: 2200, turbo: 700, reduced: 350 }
} as const

/** Colors for each tier */
const TIER_COLORS = {
  [WinTier.BIG]: 0xffd700,    // VIP Gold
  [WinTier.MEGA]: 0xff6b35,   // Orange
  [WinTier.EPIC]: 0xff1493    // Deep Pink / Magenta
} as const

/** Title text for each tier */
const TIER_TITLES = {
  [WinTier.BIG]: 'BIG WIN!',
  [WinTier.MEGA]: 'MEGA WIN!',
  [WinTier.EPIC]: 'EPIC WIN!'
} as const

const RAY_COUNT = 10
const BACKDROP_ALPHA = 0.6
const VIP_GOLD = 0xffd700

/**
 * BigWinPresenter - Handles tier-based win celebrations
 */
export class BigWinPresenter {
  public readonly container: Container

  private backdrop: Graphics
  private raysContainer: Container
  private rays: Graphics[] = []
  private titleText: Text
  private amountText: Text
  private skipHint: Text

  private currentAmount = 0
  private targetAmount = 0
  private isSkipped = false
  private isActive = false
  private onCompleteCallback: (() => void) | null = null

  private countUpStartTime = 0
  private countUpDuration = 0
  private rayRotationSpeed = 0.001 // radians per frame

  private viewportWidth = 800
  private viewportHeight = 600
  private currencySymbol = '$'

  // Ticker callbacks stored for cleanup
  private tickerCallback: ((ticker: Ticker) => void) | null = null

  constructor() {
    this.container = new Container()
    this.container.label = 'BigWinPresenter'
    this.container.eventMode = 'static' // Enable click capture
    this.container.visible = false

    // Create backdrop
    this.backdrop = new Graphics()
    this.backdrop.label = 'Backdrop'
    this.container.addChild(this.backdrop)

    // Create rays container (for rotation animation)
    this.raysContainer = new Container()
    this.raysContainer.label = 'RaysContainer'
    this.container.addChild(this.raysContainer)

    // Create rays
    this.createRays()

    // Create title text
    this.titleText = new Text({
      text: 'BIG WIN!',
      style: {
        fontFamily: 'Arial Black, Arial Bold, sans-serif',
        fontSize: 64,
        fill: VIP_GOLD,
        stroke: { color: 0x000000, width: 6 },
        dropShadow: {
          color: 0x000000,
          blur: 8,
          distance: 4,
          angle: Math.PI / 4
        },
        align: 'center'
      }
    })
    this.titleText.label = 'TitleText'
    this.titleText.anchor.set(0.5)
    this.container.addChild(this.titleText)

    // Create amount text
    this.amountText = new Text({
      text: '$0.00',
      style: {
        fontFamily: 'Arial Black, Arial Bold, sans-serif',
        fontSize: 80,
        fill: VIP_GOLD,
        stroke: { color: 0x000000, width: 6 },
        dropShadow: {
          color: 0x000000,
          blur: 8,
          distance: 4,
          angle: Math.PI / 4
        },
        align: 'center'
      }
    })
    this.amountText.label = 'AmountText'
    this.amountText.anchor.set(0.5)
    this.container.addChild(this.amountText)

    // Create skip hint text (initially hidden)
    this.skipHint = new Text({
      text: 'TAP TO SKIP',
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: 18,
        fill: 0xffffff,
        align: 'center'
      }
    })
    this.skipHint.label = 'SkipHint'
    this.skipHint.anchor.set(0.5)
    this.skipHint.alpha = 0.7
    this.skipHint.visible = false
    this.container.addChild(this.skipHint)

    // Set up click handler for skip
    this.container.on('pointerdown', () => {
      this.skip()
    })
  }

  /**
   * Create ray graphics for background animation
   */
  private createRays(): void {
    for (let i = 0; i < RAY_COUNT; i++) {
      const ray = new Graphics()
      ray.label = `Ray${i}`
      this.rays.push(ray)
      this.raysContainer.addChild(ray)
    }
  }

  /**
   * Draw rays at current viewport size
   */
  private drawRays(color: number): void {
    const centerX = 0
    const centerY = 0
    const maxRadius = Math.max(this.viewportWidth, this.viewportHeight) * 1.5
    const angleStep = (Math.PI * 2) / RAY_COUNT
    const halfAngle = angleStep / 4 // Half width of each ray

    for (let i = 0; i < RAY_COUNT; i++) {
      const ray = this.rays[i]
      ray.clear()

      const angle = i * angleStep

      // Draw triangle ray from center
      ray.moveTo(centerX, centerY)
      ray.lineTo(
        centerX + Math.cos(angle - halfAngle) * maxRadius,
        centerY + Math.sin(angle - halfAngle) * maxRadius
      )
      ray.lineTo(
        centerX + Math.cos(angle + halfAngle) * maxRadius,
        centerY + Math.sin(angle + halfAngle) * maxRadius
      )
      ray.closePath()
      ray.fill({ color, alpha: 0.15 })
    }
  }

  /**
   * Update viewport dimensions
   */
  setViewport(width: number, height: number): void {
    this.viewportWidth = width
    this.viewportHeight = height
    this.updateLayout()
  }

  /**
   * Update positions after viewport change
   */
  private updateLayout(): void {
    const centerX = this.viewportWidth / 2
    const centerY = this.viewportHeight / 2

    // Update backdrop
    this.backdrop.clear()
    this.backdrop.rect(0, 0, this.viewportWidth, this.viewportHeight)
    this.backdrop.fill({ color: 0x000000, alpha: BACKDROP_ALPHA })

    // Position rays container at center
    this.raysContainer.position.set(centerX, centerY)

    // Position title above center
    this.titleText.position.set(centerX, centerY - 80)

    // Position amount below title
    this.amountText.position.set(centerX, centerY + 30)

    // Position skip hint at bottom
    this.skipHint.position.set(centerX, this.viewportHeight - 60)
  }

  /**
   * Present a big win celebration
   */
  async present(config: BigWinConfig): Promise<void> {
    if (config.tier === WinTier.NONE) {
      config.onComplete()
      return
    }

    this.isActive = true
    this.isSkipped = false
    this.currentAmount = 0
    this.targetAmount = config.totalWin
    this.currencySymbol = config.currencySymbol
    this.onCompleteCallback = config.onComplete

    // Update visuals for tier
    const tierColor = TIER_COLORS[config.tier] ?? VIP_GOLD
    this.titleText.text = TIER_TITLES[config.tier] ?? 'WIN!'
    this.titleText.style.fill = tierColor
    this.amountText.style.fill = tierColor

    // Draw rays with tier color
    this.drawRays(tierColor)

    // Show skip hint only for Mega/Epic in normal mode
    const showSkipHint = (config.tier === WinTier.MEGA || config.tier === WinTier.EPIC) &&
      !MotionPrefs.turboEnabled && !MotionPrefs.reduceMotion
    this.skipHint.visible = showSkipHint

    // Get duration based on tier and motion prefs
    const duration = this.getDuration(config.tier)
    this.countUpDuration = duration * 0.85 // Count-up is 85% of total duration
    this.countUpStartTime = performance.now()

    // Update layout and show
    this.updateLayout()
    this.container.visible = true

    // Handle reduce motion - instant display
    if (MotionPrefs.reduceMotion) {
      this.currentAmount = this.targetAmount
      this.updateAmountDisplay()
      this.raysContainer.visible = false

      await this.delay(duration)

      if (!this.isSkipped) {
        this.hide()
      }
      return
    }

    // Start ticker for animations
    this.startAnimationTicker()

    // Wait for duration unless skipped
    await this.waitForCompletion(duration)
  }

  /**
   * Get duration based on tier and motion prefs
   */
  private getDuration(tier: WinTier): number {
    if (tier === WinTier.NONE) return 0

    const durations = DURATION[tier.toUpperCase() as keyof typeof DURATION]
    if (!durations) return 900

    if (MotionPrefs.reduceMotion) return durations.reduced
    if (MotionPrefs.turboEnabled) return durations.turbo
    return durations.normal
  }

  /**
   * Start the animation ticker
   */
  private startAnimationTicker(): void {
    this.stopAnimationTicker()

    this.tickerCallback = () => {
      if (!this.isActive || this.isSkipped) return

      const elapsed = performance.now() - this.countUpStartTime

      // Count-up animation with ease-out-cubic
      if (elapsed < this.countUpDuration) {
        const t = elapsed / this.countUpDuration
        const eased = 1 - Math.pow(1 - t, 3) // ease-out-cubic
        this.currentAmount = this.targetAmount * eased
        this.updateAmountDisplay()
      } else if (this.currentAmount !== this.targetAmount) {
        this.currentAmount = this.targetAmount
        this.updateAmountDisplay()
      }

      // Ray rotation (only in normal mode)
      if (!MotionPrefs.turboEnabled) {
        this.raysContainer.rotation += this.rayRotationSpeed
      }
    }

    Ticker.shared.add(this.tickerCallback)
  }

  /**
   * Stop the animation ticker
   */
  private stopAnimationTicker(): void {
    if (this.tickerCallback) {
      Ticker.shared.remove(this.tickerCallback)
      this.tickerCallback = null
    }
  }

  /**
   * Update the amount display text
   */
  private updateAmountDisplay(): void {
    const formatted = this.formatAmount(this.currentAmount)
    this.amountText.text = `${this.currencySymbol}${formatted}`
  }

  /**
   * Format amount with appropriate decimal places
   */
  private formatAmount(amount: number): string {
    if (amount >= 1000) {
      return amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    }
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  /**
   * Wait for celebration to complete or be skipped
   */
  private waitForCompletion(durationMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const startTime = performance.now()

      const check = () => {
        if (this.isSkipped || !this.isActive) {
          resolve()
          return
        }

        const elapsed = performance.now() - startTime
        if (elapsed >= durationMs) {
          this.hide()
          resolve()
          return
        }

        requestAnimationFrame(check)
      }

      requestAnimationFrame(check)
    })
  }

  /**
   * Skip the current celebration
   */
  skip(): void {
    if (!this.isActive || this.isSkipped) return

    if (DEBUG_FLAGS.bigWinVerbose) {
      console.log('[BigWinPresenter] Skip requested')
    }

    this.isSkipped = true

    // Show final amount instantly
    this.currentAmount = this.targetAmount
    this.updateAmountDisplay()

    // Hide overlay
    this.hide()
  }

  /**
   * Hide the celebration overlay
   */
  hide(): void {
    this.stopAnimationTicker()
    this.container.visible = false
    this.isActive = false
    this.raysContainer.visible = true

    // Invoke callback
    if (this.onCompleteCallback) {
      const callback = this.onCompleteCallback
      this.onCompleteCallback = null
      callback()
    }
  }

  /**
   * Check if celebration is currently active
   */
  get active(): boolean {
    return this.isActive
  }

  /**
   * Utility delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopAnimationTicker()
    this.container.off('pointerdown')
    this.container.destroy({ children: true })
  }
}

/**
 * Compute win tier from total win and bet amount
 */
export function computeWinTier(totalWin: number, bet: number): WinTier {
  if (bet <= 0 || totalWin <= 0) return WinTier.NONE

  const winX = totalWin / bet

  if (winX >= WIN_TIER_THRESHOLDS.EPIC) return WinTier.EPIC
  if (winX >= WIN_TIER_THRESHOLDS.MEGA) return WinTier.MEGA
  if (winX >= WIN_TIER_THRESHOLDS.BIG) return WinTier.BIG

  return WinTier.NONE
}
