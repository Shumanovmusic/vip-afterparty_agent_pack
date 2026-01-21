export const DEBUG_FLAGS = {
  overlays: import.meta.env.DEV,
  reelsAnchors: import.meta.env.DEV,
  reelsGrid: import.meta.env.DEV,
  /** Verbose layout logs (ReelFrame.draw, ReelStrip slots, PixiReelsRenderer init). Off by default. */
  verboseLayout: false,
}
