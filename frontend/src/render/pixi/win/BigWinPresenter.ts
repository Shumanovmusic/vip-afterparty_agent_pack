/**
 * BigWinPresenter - Full-screen overlay celebration for Big/Mega/Epic wins
 * Displays tier-based celebration with count-up animation, rays, and skip functionality
 */

import { Container, Graphics, Text, Ticker } from 'pixi.js'
import { MotionPrefs, WIN_TIER_THRESHOLDS } from '../../../ux/MotionPrefs'
import { DEBUG_FLAGS } from '../DebugFlags'
import { audioService } from '../../../audio/AudioService'
import { i18n } from '../../../i18n'

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

/** VIP Palette colors */
const VIP_PURPLE = 0x2a0b3f
const VIP_GOLD = 0xffd36e
const VIP_CYAN = 0x47e6ff
const VIP_MAGENTA = 0xff4bd8
const TEXT_DARK = 0x12061c

/** Style configuration for each tier */
const TIER_STYLES = {
  [WinTier.BIG]: {
    titleFill: VIP_GOLD, titleShadow: VIP_PURPLE,
    amountFill: VIP_GOLD, amountShadow: VIP_PURPLE,
    raysColor: VIP_PURPLE, raysAlpha: 0.18
  },
  [WinTier.MEGA]: {
    titleFill: VIP_CYAN, titleShadow: TEXT_DARK,
    amountFill: VIP_GOLD, amountShadow: TEXT_DARK,
    raysColor: VIP_CYAN, raysAlpha: 0.15
  },
  [WinTier.EPIC]: {
    titleFill: VIP_MAGENTA, titleShadow: TEXT_DARK,
    amountFill: VIP_GOLD, amountShadow: TEXT_DARK,
    raysColor: VIP_MAGENTA, raysAlpha: 0.18
  }
} as const

/** Get translated title for tier */
function getTierTitle(tier: WinTier): string {
  switch (tier) {
    case WinTier.BIG: return i18n.global.t('win.big')
    case WinTier.MEGA: return i18n.global.t('win.mega')
    case WinTier.EPIC: return i18n.global.t('win.epic')
    default: return 'WIN!'
  }
}

/** Get translated skip hint text */
function getSkipHintText(): string {
  return i18n.global.t('win.tapToSkip')
}

const RAY_COUNT = 10
const BACKDROP_ALPHA = 0.6
const HINT_AUTO_HIDE_MS = 1200
const HUD_DIM_HEIGHT_RATIO = 0.25
const HUD_DIM_ALPHA = 0.30

/**
 * BigWinPresenter - Handles tier-based win celebrations
 */
export class BigWinPresenter {
  public readonly container: Container

  private backdrop: Graphics
  private hudDimOverlay: Graphics
  private raysContainer: Container
  private rays: Graphics[] = []
  private titleShadowText: Text
  private titleText: Text
  private amountShadowText: Text
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

  // Hint auto-hide timer
  private hintTimerId: number | null = null
  private presentId = 0

  constructor() {
    this.container = new Container()
    this.container.label = 'BigWinPresenter'
    this.container.eventMode = 'static' // Enable click capture
    this.container.visible = false

    // Create backdrop
    this.backdrop = new Graphics()
    this.backdrop.label = 'Backdrop'
    this.container.addChild(this.backdrop)

    // Create HUD dim overlay (bottom portion)
    this.hudDimOverlay = new Graphics()
    this.hudDimOverlay.label = 'HudDimOverlay'
    this.container.addChild(this.hudDimOverlay)

    // Create rays container (for rotation animation)
    this.raysContainer = new Container()
    this.raysContainer.label = 'RaysContainer'
    this.container.addChild(this.raysContainer)

    // Create rays
    this.createRays()

    // Create title shadow text
    this.titleShadowText = new Text({
      text: 'BIG WIN!',
      style: {
        fontFamily: 'Arial Black, Arial Bold, sans-serif',
        fontSize: 64,
        fill: VIP_PURPLE,
        align: 'center'
      }
    })
    this.titleShadowText.label = 'TitleShadowText'
    this.titleShadowText.anchor.set(0.5)
    this.titleShadowText.alpha = 0.35
    this.container.addChild(this.titleShadowText)

    // Create title text
    this.titleText = new Text({
      text: 'BIG WIN!',
      style: {
        fontFamily: 'Arial Black, Arial Bold, sans-serif',
        fontSize: 64,
        fill: VIP_GOLD,
        stroke: { color: 0x000000, width: 2 },
        align: 'center'
      }
    })
    this.titleText.label = 'TitleText'
    this.titleText.anchor.set(0.5)
    this.container.addChild(this.titleText)

    // Create amount shadow text
    this.amountShadowText = new Text({
      text: '$0.00',
      style: {
        fontFamily: 'Arial Black, Arial Bold, sans-serif',
        fontSize: 80,
        fill: VIP_PURPLE,
        align: 'center'
      }
    })
    this.amountShadowText.label = 'AmountShadowText'
    this.amountShadowText.anchor.set(0.5)
    this.amountShadowText.alpha = 0.45
    this.container.addChild(this.amountShadowText)

    // Create amount text
    this.amountText = new Text({
      text: '$0.00',
      style: {
        fontFamily: 'Arial Black, Arial Bold, sans-serif',
        fontSize: 80,
        fill: VIP_GOLD,
        stroke: { color: 0x000000, width: 2 },
        align: 'center'
      }
    })
    this.amountText.label = 'AmountText'
    this.amountText.anchor.set(0.5)
    this.container.addChild(this.amountText)

    // Create skip hint text (initially hidden) - use i18n key
    this.skipHint = new Text({
      text: getSkipHintText(),
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
  private drawRays(color: number, alpha: number): void {
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
      ray.fill({ color, alpha })
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

    // Update HUD dim overlay (bottom portion)
    const hudDimY = this.viewportHeight * (1 - HUD_DIM_HEIGHT_RATIO)
    this.hudDimOverlay.clear()
    this.hudDimOverlay.rect(0, hudDimY, this.viewportWidth, this.viewportHeight * HUD_DIM_HEIGHT_RATIO)
    this.hudDimOverlay.fill({ color: 0x000000, alpha: HUD_DIM_ALPHA })

    // Position rays container at center
    this.raysContainer.position.set(centerX, centerY)

    // Position title shadow (offset 3,3)
    this.titleShadowText.position.set(centerX + 3, centerY - 80 + 3)

    // Position title above center
    this.titleText.position.set(centerX, centerY - 80)

    // Position amount shadow (offset 3,4)
    this.amountShadowText.position.set(centerX + 3, centerY + 30 + 4)

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

    // Increment presentId for stale timer guard
    this.presentId++
    const currentPresentId = this.presentId

    // Cancel any existing hint timer
    this.cancelHintTimer()

    this.isActive = true
    this.isSkipped = false
    this.currentAmount = 0
    this.targetAmount = config.totalWin
    this.currencySymbol = config.currencySymbol
    this.onCompleteCallback = config.onComplete

    // Get tier style (fallback to BIG style if tier not found)
    const style = TIER_STYLES[config.tier] ?? TIER_STYLES[WinTier.BIG]

    // Update title text and shadow using i18n
    const titleContent = getTierTitle(config.tier)
    this.titleText.text = titleContent
    this.titleShadowText.text = titleContent
    this.titleText.style.fill = style.titleFill
    this.titleShadowText.style.fill = style.titleShadow

    // Update amount text and shadow colors
    this.amountText.style.fill = style.amountFill
    this.amountShadowText.style.fill = style.amountShadow

    // Draw rays with tier color and alpha
    this.drawRays(style.raysColor, style.raysAlpha)

    // Show skip hint only for Mega/Epic in normal mode
    const showSkipHint = (config.tier === WinTier.MEGA || config.tier === WinTier.EPIC) &&
      !MotionPrefs.turboEnabled && !MotionPrefs.reduceMotion
    // Update hint text in case locale changed
    this.skipHint.text = getSkipHintText()
    this.skipHint.visible = showSkipHint

    // Schedule hint auto-hide after 1200ms
    if (showSkipHint) {
      this.hintTimerId = window.setTimeout(() => {
        // Guard against stale timer
        if (this.presentId === currentPresentId && this.isActive) {
          this.skipHint.visible = false
          if (DEBUG_FLAGS.bigWinVerbose) {
            console.log('[BigWinPresenter] Hint auto-hidden')
          }
        }
      }, HINT_AUTO_HIDE_MS)
    }

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

    // Start coin roll audio (only in normal mode with count-up)
    const coinRollStarted = !MotionPrefs.turboEnabled
    if (coinRollStarted) {
      audioService.startCoinRoll()
    }

    try {
      // Start ticker for animations
      this.startAnimationTicker()

      // Wait for duration unless skipped
      await this.waitForCompletion(duration)
    } finally {
      // ALWAYS stop coin roll - guaranteed cleanup
      if (coinRollStarted) {
        audioService.stopCoinRoll()
      }
    }
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
    const displayText = `${this.currencySymbol}${formatted}`
    this.amountText.text = displayText
    this.amountShadowText.text = displayText
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

    // Stop coin roll audio immediately
    audioService.stopCoinRoll()

    // Cancel hint timer and hide hint immediately
    this.cancelHintTimer()
    this.skipHint.visible = false

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
    this.cancelHintTimer()

    // Stop coin roll audio (safe to call even if not playing)
    audioService.stopCoinRoll()

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
   * Cancel hint auto-hide timer
   */
  private cancelHintTimer(): void {
    if (this.hintTimerId !== null) {
      window.clearTimeout(this.hintTimerId)
      this.hintTimerId = null
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
    // Stop all audio first
    audioService.stopCoinRoll()

    this.stopAnimationTicker()
    this.cancelHintTimer()

    // If active, invoke completion callback to release any waiters
    if (this.isActive) {
      this.isActive = false
      if (this.onCompleteCallback) {
        const callback = this.onCompleteCallback
        this.onCompleteCallback = null
        try {
          callback()
        } catch (e) {
          if (import.meta.env.DEV) {
            console.warn('[BigWinPresenter] Callback error during destroy:', e)
          }
        }
      }
    }

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
