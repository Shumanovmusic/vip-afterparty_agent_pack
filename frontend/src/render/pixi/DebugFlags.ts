export const DEBUG_FLAGS = {
  overlays: import.meta.env.DEV,
  reelsAnchors: import.meta.env.DEV,
  reelsGrid: import.meta.env.DEV,
  /** Verbose layout logs (ReelFrame.draw, ReelStrip slots, PixiReelsRenderer init). Off by default. */
  verboseLayout: false,
  /** Log spin correctness checks (DEV only). Always logs errors, verbose logs all checks. */
  spinCorrectnessVerbose: false,
  /** Enable spin test mode (DEV only). Press T to run 100 automated spins. */
  spinTestEnabled: import.meta.env.DEV,
  /** Enable win test mode (DEV only). Press W to show debug win presentation. */
  winTestEnabled: import.meta.env.DEV,
  /** Verbose win presentation logs (stale timer guards, fallback positions). Off by default. */
  winVerbose: false,
  /** Verbose payline logs (mapping lineId -> positions). Off by default. */
  paylineVerbose: false,
  /** Verbose win cadence logs (cycling, timing, skip). Off by default. */
  cadenceVerbose: false,
  /** Enable win cadence test mode (DEV only). Press L to show test cadence. */
  cadenceTestEnabled: import.meta.env.DEV,
  /** Enable sparkle overlays on WILD/DIAMOND (DEV toggle with P key). */
  sparklesEnabled: import.meta.env.DEV,
  /** Verbose big win celebration logs. Off by default. */
  bigWinVerbose: false,
  /** Enable big win test mode (DEV only). Press B/M/E for Big/Mega/Epic. */
  bigWinTestEnabled: import.meta.env.DEV,
  /** Verbose big win polish logs (tier styles, hint timer). Off by default. */
  bigWinPolishVerbose: false,
  /** Verbose heat model logs (delta calculations, threshold crossings). Off by default. */
  heatVerbose: true,  // TEMP: enabled for testing
  /** Enable heat test mode (DEV only). Press H/Shift+H to add/remove heat. */
  heatTestEnabled: import.meta.env.DEV,
  /** Verbose spotlight sweep logs (play/cancel events). Off by default. */
  spotlightVerbose: true,  // TEMP: enabled for testing
  /** Enable spotlight test mode (DEV only). Press S to trigger spotlight. */
  spotlightTestEnabled: import.meta.env.DEV,
  /** Force juice effects (sparkles, spotlight) even in Turbo/ReduceMotion (DEV only). */
  forceJuiceFx: false,
}
