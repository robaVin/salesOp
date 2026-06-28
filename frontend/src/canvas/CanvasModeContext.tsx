import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type CanvasMode =
  | { kind: 'canvas' }
  | { kind: 'focused'; nodeId: string }
  | { kind: 'immersive'; nodeId: string }

interface CanvasModeContextValue {
  mode: CanvasMode
  focus: (nodeId: string) => void
  immerse: (nodeId: string) => void
  exit: () => void
}

const Ctx = createContext<CanvasModeContextValue | null>(null)

export function CanvasModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<CanvasMode>({ kind: 'canvas' })

  const focus = useCallback((nodeId: string) => {
    setMode({ kind: 'focused', nodeId })
  }, [])

  const immerse = useCallback((nodeId: string) => {
    setMode({ kind: 'immersive', nodeId })
  }, [])

  const exit = useCallback(() => {
    setMode((prev) => {
      if (prev.kind === 'immersive') return { kind: 'focused', nodeId: prev.nodeId }
      return { kind: 'canvas' }
    })
  }, [])

  const value = useMemo<CanvasModeContextValue>(
    () => ({ mode, focus, immerse, exit }),
    [mode, focus, immerse, exit]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCanvasMode(): CanvasModeContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCanvasMode must be used inside CanvasModeProvider')
  return v
}
