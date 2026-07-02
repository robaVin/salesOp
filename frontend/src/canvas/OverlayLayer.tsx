import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCanvasMode } from './CanvasModeContext'
import { useRendererContext } from './NoteNode'
import { getRenderer } from './renderers/registry'
import {
  focusedTargetRect,
  immersiveTargetRect,
  measureNodeRect,
  type ScreenRect,
} from './measureNodeRect'
import type { NoteRecord } from '../types'
import { canCreateWorkspaceFrom, isClaimedByWorkspace, isWorkspace, workspaceIdSet } from './relations'

interface OverlayLayerProps {
  notes: NoteRecord[]
  onPatch: (
    id: string,
    patch: { title?: string; body?: string; status?: NoteRecord['status'] }
  ) => void
  onOpenNode: (nodeId: string) => void
  onDelete: (id: string) => void
  onCreateWorkspace: (id: string) => void
  onAddNote: (workspaceId: string) => void
  onRemoveFromWorkspace: (id: string) => void
}

/**
 * Renders the focused / immersive overlay. Lives in viewport coordinates,
 * outside React Flow's render tree. Animates from the source node's
 * on-screen rect (measured by data-id) to the target rect using Framer
 * Motion springs.
 *
 * Mounted once at the top of CanvasApp. Exits cleanly when mode → canvas.
 */
export function OverlayLayer({ notes, onPatch, onOpenNode, onDelete, onCreateWorkspace, onAddNote, onRemoveFromWorkspace }: OverlayLayerProps) {
  const { mode, exit } = useCanvasMode()
  const ctx = useRendererContext()

  // The note in the overlay (if any).
  const note = useMemo(() => {
    if (mode.kind === 'canvas') return null
    return notes.find((n) => n.id === mode.nodeId) ?? null
  }, [mode, notes])

  // Source rect: where the original node sits on screen. Captured at the
  // moment the overlay opens and again at the moment it closes (so the exit
  // animation flies back to wherever the card now is, accounting for any
  // pan the user did underneath).
  const sourceRectRef = useRef<ScreenRect | null>(null)
  const [_, setRectVersion] = useState(0)
  void _

  useEffect(() => {
    if (mode.kind === 'canvas') return
    const id = mode.nodeId
    // Defer one frame so React Flow has flushed any layout from a recent
    // selection/flyTo before we measure.
    let raf = requestAnimationFrame(() => {
      const r = measureNodeRect(id) ?? {
        top: window.innerHeight / 2 - 80,
        left: window.innerWidth / 2 - 130,
        width: 260,
        height: 160,
      }
      sourceRectRef.current = r
      setRectVersion((v) => v + 1)
    })
    return () => cancelAnimationFrame(raf)
  }, [mode])

  const targetRect = useMemo<ScreenRect | null>(() => {
    if (mode.kind === 'focused') return focusedTargetRect()
    if (mode.kind === 'immersive') return immersiveTargetRect()
    return null
  }, [mode])

  // Refresh target rect on window resize.
  const [, setSize] = useState(0)
  useEffect(() => {
    function onResize() {
      setSize((v) => v + 1)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (mode.kind === 'canvas' || !note || !targetRect) return null

  const sourceRect = sourceRectRef.current ?? targetRect

  const set = getRenderer(note.node_type)
  const DetailRenderer = set.detail

  const isImmersive = mode.kind === 'immersive'

  return (
    <AnimatePresence>
      <motion.div
        key="overlay-root"
        className="fixed inset-0 z-30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        {/* Backdrop: catches clicks to exit (focused only — immersive uses scroll/esc). */}
        <motion.div
          className="absolute inset-0 bg-slate-950/30"
          initial={{ opacity: 0 }}
          animate={{ opacity: isImmersive ? 0.55 : 0.32 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24 }}
          onClick={() => {
            if (mode.kind === 'focused') exit()
          }}
        />

        {/* Animated overlay card. Springs from source rect → target rect. */}
        <motion.div
          key={`overlay-card-${mode.kind}-${note.id}`}
          className="absolute"
          initial={{
            top: sourceRect.top,
            left: sourceRect.left,
            width: sourceRect.width,
            height: sourceRect.height,
            borderRadius: 12,
            boxShadow: '0 0 0 rgba(0,0,0,0)',
            opacity: 0.95,
          }}
          animate={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            borderRadius: isImmersive ? 0 : 18,
            boxShadow: isImmersive
              ? '0 0 0 rgba(0,0,0,0)'
              : '0 30px 80px -20px rgba(15, 23, 42, 0.35), 0 10px 30px -10px rgba(15, 23, 42, 0.25)',
            opacity: 1,
          }}
          exit={{
            // Re-measure source on exit so we fly back to wherever the
            // card currently is on the canvas.
            top: measureNodeRect(note.id)?.top ?? sourceRect.top,
            left: measureNodeRect(note.id)?.left ?? sourceRect.left,
            width: measureNodeRect(note.id)?.width ?? sourceRect.width,
            height: measureNodeRect(note.id)?.height ?? sourceRect.height,
            borderRadius: 12,
            boxShadow: '0 0 0 rgba(0,0,0,0)',
            opacity: 0,
          }}
          transition={{
            type: 'spring',
            stiffness: 260,
            damping: 30,
            opacity: { duration: 0.18 },
            borderRadius: { duration: 0.24 },
            boxShadow: { duration: 0.24 },
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <DetailRenderer
            note={note}
            selected
            ctx={ctx}
            mode={mode.kind}
            onPatch={(p) => onPatch(note.id, p)}
            onExit={exit}
            onOpenNode={onOpenNode}
            onDelete={() => {
              // Close the overlay first so mode resets to canvas, then trash.
              exit()
              onDelete(note.id)
            }}
            onCreateWorkspace={
              canCreateWorkspaceFrom(note)
                ? () => {
                    // Back to canvas so the create modal + fly-to aren't behind the overlay.
                    exit()
                    onCreateWorkspace(note.id)
                  }
                : undefined
            }
            onAddNote={isWorkspace(note) ? () => onAddNote(note.id) : undefined}
            onRemoveFromWorkspace={
              isClaimedByWorkspace(note, workspaceIdSet(notes))
                ? () => {
                    exit()
                    onRemoveFromWorkspace(note.id)
                  }
                : undefined
            }
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
