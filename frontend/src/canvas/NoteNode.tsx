import { createContext, useContext, type ReactNode } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { NoteRecord, StatsResponse } from '../types'
import { getRenderer } from './renderers/registry'
import { useZoomLevel } from './ZoomContext'
import { useCanvasMode } from './CanvasModeContext'
import type { RendererContext } from './renderers/types'

export interface NoteNodeData extends Record<string, unknown> {
  note: NoteRecord
}

const RendererCtx = createContext<RendererContext>({ allNotes: [], stats: null })

export function RendererContextProvider({
  allNotes,
  stats,
  children,
}: {
  allNotes: NoteRecord[]
  stats: StatsResponse | null
  children: ReactNode
}) {
  return <RendererCtx.Provider value={{ allNotes, stats }}>{children}</RendererCtx.Provider>
}

/** Read the renderer context outside React Flow's node tree (the overlay uses this). */
export function useRendererContext(): RendererContext {
  return useContext(RendererCtx)
}

export function NoteNode({ data, selected }: NodeProps) {
  const note = (data as NoteNodeData).note
  const level = useZoomLevel()
  const ctx = useContext(RendererCtx)
  const { mode } = useCanvasMode()

  // When this node is the one being shown by the overlay layer, render an
  // invisible placeholder. The overlay owns the visual, so we don't want a
  // duplicate card sitting underneath (it would show through the overlay
  // animation as a ghost). Keep the DOM element with data-id intact so the
  // overlay's source-rect measurement still works at exit time.
  if (
    (mode.kind === 'focused' || mode.kind === 'immersive') &&
    mode.nodeId === note.id
  ) {
    return (
      <div className="opacity-0">
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
        <div style={{ width: 260, height: 160 }} />
      </div>
    )
  }

  const set = getRenderer(note.node_type)
  const Renderer = level === 'compact' ? set.compact : set.preview
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <Renderer note={note} selected={selected ?? false} ctx={ctx} />
    </div>
  )
}
