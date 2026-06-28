import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useViewport } from '@xyflow/react'
import { type ZoomLevel, zoomToLevel } from './zoom'

const ZoomContext = createContext<ZoomLevel>('preview')

function ZoomTrackerInner({ children }: { children: ReactNode }) {
  const { zoom } = useViewport()
  const [level, setLevel] = useState<ZoomLevel>(() => zoomToLevel(zoom))
  const lastLevelRef = useRef<ZoomLevel>(level)

  useEffect(() => {
    const next = zoomToLevel(zoom)
    if (next !== lastLevelRef.current) {
      lastLevelRef.current = next
      setLevel(next)
    }
  }, [zoom])

  const value = useMemo(() => level, [level])
  return <ZoomContext.Provider value={value}>{children}</ZoomContext.Provider>
}

export const ZoomTracker = memo(ZoomTrackerInner)

export function useZoomLevel(): ZoomLevel {
  return useContext(ZoomContext)
}
