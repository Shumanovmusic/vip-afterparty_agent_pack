/**
 * Safe Area utility for mobile devices
 * Handles notches, home indicators, and rounded corners
 */

export interface SafeAreaInsets {
  top: number
  bottom: number
  left: number
  right: number
}

// Default insets commented - using dynamic detection instead
// const DEFAULT_INSETS: SafeAreaInsets = { top: 0, bottom: 34, left: 0, right: 0 }

/**
 * Get current safe area insets
 * Uses CSS env() where available, fallback to defaults
 */
export function getSafeAreaInsets(): SafeAreaInsets {
  // Check if CSS env() is supported
  if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('padding-top: env(safe-area-inset-top)')) {
    // Create a temporary element to read computed values
    const el = document.createElement('div')
    el.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      padding-top: env(safe-area-inset-top, 0px);
      padding-bottom: env(safe-area-inset-bottom, 0px);
      padding-left: env(safe-area-inset-left, 0px);
      padding-right: env(safe-area-inset-right, 0px);
      visibility: hidden;
      pointer-events: none;
    `
    document.body.appendChild(el)

    const computed = getComputedStyle(el)
    const insets: SafeAreaInsets = {
      top: parseFloat(computed.paddingTop) || 0,
      bottom: parseFloat(computed.paddingBottom) || 0,
      left: parseFloat(computed.paddingLeft) || 0,
      right: parseFloat(computed.paddingRight) || 0
    }

    document.body.removeChild(el)

    // If all zeros, assume we're not on a notched device
    if (insets.top === 0 && insets.bottom === 0 && insets.left === 0 && insets.right === 0) {
      return detectDefaultInsets()
    }

    return insets
  }

  return detectDefaultInsets()
}

/**
 * Detect default insets based on device/user agent
 */
function detectDefaultInsets(): SafeAreaInsets {
  const ua = navigator.userAgent.toLowerCase()

  // iOS detection
  const isIOS = /iphone|ipad|ipod/.test(ua)
  const isIOSSafari = isIOS && /safari/.test(ua) && !/crios|fxios/.test(ua)

  // Check for notched iPhone (X and later)
  if (isIOS) {
    const screenHeight = window.screen.height
    const screenWidth = window.screen.width
    const ratio = Math.max(screenHeight, screenWidth) / Math.min(screenHeight, screenWidth)

    // iPhone X and later have ~2.16 ratio, older phones ~1.77
    if (ratio > 2) {
      return {
        top: isIOSSafari ? 0 : 44,  // Safari handles top notch
        bottom: 34,  // Home indicator
        left: 0,
        right: 0
      }
    }
  }

  // Android with display cutout
  const isAndroid = /android/.test(ua)
  if (isAndroid && 'windowControlsOverlay' in navigator) {
    // Modern Android with display cutout API
    return {
      top: 24,  // Status bar
      bottom: 0,
      left: 0,
      right: 0
    }
  }

  // Default: no insets needed
  return {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0
  }
}

/**
 * Apply safe area padding to an element
 */
export function applySafeAreaPadding(element: HTMLElement, sides: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom']): void {
  const insets = getSafeAreaInsets()

  sides.forEach(side => {
    const value = insets[side]
    element.style.setProperty(`padding-${side}`, `${value}px`)
  })
}

/**
 * Get CSS string for safe area padding
 */
export function getSafeAreaCSSPadding(): string {
  return `
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 34px);
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
  `
}

/**
 * Get safe area as Pixi-compatible offset values
 */
export function getSafeAreaOffset(): { x: number; y: number; width: number; height: number } {
  const insets = getSafeAreaInsets()

  return {
    x: insets.left,
    y: insets.top,
    width: insets.left + insets.right,
    height: insets.top + insets.bottom
  }
}

/**
 * Watch for safe area changes (orientation, resize)
 */
export function watchSafeArea(callback: (insets: SafeAreaInsets) => void): () => void {
  let lastInsets = getSafeAreaInsets()

  const checkInsets = () => {
    const newInsets = getSafeAreaInsets()
    if (
      newInsets.top !== lastInsets.top ||
      newInsets.bottom !== lastInsets.bottom ||
      newInsets.left !== lastInsets.left ||
      newInsets.right !== lastInsets.right
    ) {
      lastInsets = newInsets
      callback(newInsets)
    }
  }

  window.addEventListener('resize', checkInsets)
  window.addEventListener('orientationchange', checkInsets)

  // Initial callback
  callback(lastInsets)

  return () => {
    window.removeEventListener('resize', checkInsets)
    window.removeEventListener('orientationchange', checkInsets)
  }
}
