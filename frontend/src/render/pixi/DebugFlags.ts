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
}
