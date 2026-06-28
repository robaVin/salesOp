import { useCallback, useMemo } from 'react'
import { useReactFlow } from '@xyflow/react'
import { LEVEL_TARGET_ZOOM, type ZoomLevel } from './zoom'

export interface FlyToOptions {
  /** Optional level to zoom into after centering. */
  zoomLevel?: ZoomLevel
  duration?: number
  padding?: number
}

export interface CameraController {
  flyTo: (nodeId: string, opts?: FlyToOptions) => void
}

export function useCameraController(): CameraController {
  const rf = useReactFlow()

  const flyTo = useCallback(
    (nodeId: string, opts: FlyToOptions = {}) => {
      try {
        if (opts.zoomLevel) {
          const node = rf.getNode(nodeId)
          if (!node) return
          const w = (node.width as number | undefined) ?? 260
          const h = (node.height as number | undefined) ?? 160
          const cx = node.position.x + w / 2
          const cy = node.position.y + h / 2
          rf.setCenter(cx, cy, {
            zoom: LEVEL_TARGET_ZOOM[opts.zoomLevel],
            duration: opts.duration ?? 600,
          })
        } else {
          rf.fitView({
            nodes: [{ id: nodeId }],
            duration: opts.duration ?? 600,
            padding: opts.padding ?? 0.5,
            maxZoom: 1.2,
          })
        }
      } catch {
        /* node not yet measurable — safe to skip */
      }
    },
    [rf]
  )

  // Stabilize the returned object so it isn't a new reference each render.
  return useMemo(() => ({ flyTo }), [flyTo])
}
