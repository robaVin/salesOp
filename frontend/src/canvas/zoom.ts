export type ZoomLevel = 'compact' | 'preview'

/**
 * Continuous viewport zoom → categorical canvas-tile level.
 * Two buckets only: zoomed-out (small icon + label) and zoomed-in (full
 * preview card). Anything closer is handled by the focused/immersive
 * overlay layer, not by per-node renderers in the canvas.
 */
export function zoomToLevel(zoom: number): ZoomLevel {
  if (zoom < 0.55) return 'compact'
  return 'preview'
}

/** Target zoom used when programmatically zooming to a level. */
export const LEVEL_TARGET_ZOOM: Record<ZoomLevel, number> = {
  compact: 0.4,
  preview: 0.9,
}
