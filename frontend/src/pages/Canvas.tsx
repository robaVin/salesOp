import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { api } from '../api/client'
import { NoteNode, type NoteNodeData, RendererContextProvider } from '../canvas/NoteNode'
import { ZoomTracker } from '../canvas/ZoomContext'
import { useCameraController } from '../canvas/CameraController'
import { CanvasModeProvider, useCanvasMode } from '../canvas/CanvasModeContext'
import { OverlayLayer } from '../canvas/OverlayLayer'
import { CommandPalette, type CommandKey } from '../components/CommandPalette'
import { ErrorBanner } from '../components/ErrorBanner'
import { Inspector } from '../components/Inspector'
import { RunHistory } from '../components/RunHistory'
import { SummarizeModal } from '../components/SummarizeModal'
import { TopBar } from '../components/TopBar'
import { useChord } from '../hotkeys/chord'
import { useCanvasData } from '../state/canvasStore'
import type { NoteRecord, NoteStatus, NoteType } from '../types'

const nodeTypes = { note: NoteNode }

function CanvasApp() {
  const {
    notes,
    edges: edgeRows,
    runs,
    stats,
    loading,
    error,
    selectedNoteId,
    setSelectedNoteId,
    refetch,
    refetchRunsAndStats,
  } = useCanvasData()

  const camera = useCameraController()
  const rfInstance = useReactFlow()
  const { mode, focus, immerse, exit } = useCanvasMode()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [summarizeOpen, setSummarizeOpen] = useState(false)
  const [summarizeBusy, setSummarizeBusy] = useState(false)
  const [summarizeInitial, setSummarizeInitial] = useState<string | undefined>()
  const [toast, setToast] = useState<string | null>(null)

  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const seenNoteIdsRef = useRef<Set<string> | null>(null)
  const flewToHomeRef = useRef(false)
  const [rfNodes, setRfNodes] = useState<Node<NoteNodeData>[]>([])

  const homeNoteId = useMemo(
    () => notes.find((n) => n.node_type === 'daily_briefing')?.id ?? null,
    [notes]
  )

  useEffect(() => {
    const next: Node<NoteNodeData>[] = notes.map((note) => ({
      id: note.id,
      type: 'note',
      position: { x: note.position_x, y: note.position_y },
      data: { note },
      selected: note.id === selectedNoteId,
    }))
    setRfNodes(next)
    notes.forEach((n) => {
      positionsRef.current.set(n.id, { x: n.position_x, y: n.position_y })
    })

    if (seenNoteIdsRef.current === null) {
      seenNoteIdsRef.current = new Set(notes.map((n) => n.id))
      return
    }
    const seen = seenNoteIdsRef.current
    const newCaptures = notes.filter((n) => {
      if (seen.has(n.id)) return false
      const meta = n.metadata_json as Record<string, unknown> | undefined
      return Boolean(meta && meta.captured === true)
    })
    notes.forEach((n) => seen.add(n.id))

    if (newCaptures.length > 0) {
      const newest = newCaptures.reduce((latest, n) =>
        new Date(n.created_at).getTime() > new Date(latest.created_at).getTime() ? n : latest
      )
      window.requestAnimationFrame(() => {
        camera.flyTo(newest.id, { zoomLevel: 'preview' })
      })
      setSelectedNoteId(newest.id)
    }
  }, [notes, selectedNoteId, camera, setSelectedNoteId])

  useEffect(() => {
    if (flewToHomeRef.current) return
    if (loading || notes.length === 0) return
    flewToHomeRef.current = true
    const NEIGHBORHOOD_RADIUS = 2200
    const inNeighborhood = notes.filter(
      (n) => Math.abs(n.position_x) < NEIGHBORHOOD_RADIUS && Math.abs(n.position_y) < NEIGHBORHOOD_RADIUS
    )
    const fitNodes = inNeighborhood.length > 0 ? inNeighborhood : notes.slice(0, 1)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try {
          rfInstance.fitView({
            nodes: fitNodes.map((n) => ({ id: n.id })),
            padding: 0.25,
            duration: 500,
            minZoom: 0.45,
            maxZoom: 1.0,
          })
        } catch {
          /* not yet measurable */
        }
      })
    })
  }, [loading, notes, rfInstance])

  const rfEdges: Edge[] = useMemo(
    () =>
      edgeRows.map((e) => ({
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        label: e.label ?? undefined,
        type: 'smoothstep',
      })),
    [edgeRows]
  )

  const onNodesChange: OnNodesChange<Node<NoteNodeData>> = useCallback(
    (changes) => {
      setRfNodes((prev) => applyNodeChanges(changes, prev))
      const selectChange = changes.find((c) => c.type === 'select')
      if (selectChange && 'selected' in selectChange) {
        if (selectChange.selected) {
          setSelectedNoteId(selectChange.id)
        } else if (selectedNoteId === selectChange.id) {
          setSelectedNoteId(null)
        }
      }
      for (const c of changes) {
        if (c.type === 'position' && c.dragging === false && c.position) {
          const prev = positionsRef.current.get(c.id)
          const next = c.position
          if (!prev || Math.abs(prev.x - next.x) > 0.5 || Math.abs(prev.y - next.y) > 0.5) {
            positionsRef.current.set(c.id, { x: next.x, y: next.y })
            void api.patchPosition(c.id, next.x, next.y).catch((err) => {
              setToast(`Position save failed: ${err.message}`)
            })
          }
        }
      }
    },
    [selectedNoteId, setSelectedNoteId]
  )

  const onEdgesChange: OnEdgesChange = useCallback(() => {}, [])

  const onConnect: OnConnect = useCallback(
    (params) => {
      if (!params.source || !params.target) return
      void (async () => {
        try {
          await api.createEdge(params.source!, params.target!)
          await refetch()
        } catch (err) {
          setToast(err instanceof Error ? err.message : 'Edge create failed')
        }
      })()
    },
    [refetch]
  )

  const selectedNote: NoteRecord | null = useMemo(() => {
    if (!selectedNoteId) return null
    return notes.find((n) => n.id === selectedNoteId) ?? null
  }, [notes, selectedNoteId])

  // ---- actions ----

  const createNote = useCallback(
    async (type: NoteType, overrides: Partial<NoteRecord> = {}) => {
      try {
        const note = await api.createNote({
          node_type: type,
          title: overrides.title ?? `New ${type.replace('_', ' ')}`,
          body: overrides.body ?? '',
          status: overrides.status ?? 'open',
          position_x: overrides.position_x ?? 200 + Math.random() * 600,
          position_y: overrides.position_y ?? 200 + Math.random() * 400,
          ...overrides,
        })
        await refetch()
        setSelectedNoteId(note.id)
        camera.flyTo(note.id, { zoomLevel: 'preview' })
      } catch (err) {
        setToast(err instanceof Error ? err.message : String(err))
      }
    },
    [refetch, setSelectedNoteId, camera]
  )

  const handleSummarize = useCallback(
    async (text: string) => {
      setSummarizeBusy(true)
      try {
        const result = await api.summarize(text)
        await createNote(result.node_type, {
          title: result.title,
          body: result.body,
          tags_json: result.tags,
          position_x: 200 + Math.random() * 400,
          position_y: 200 + Math.random() * 200,
        })
        setSummarizeOpen(false)
        setToast(result.mocked ? 'Note created (no OPENAI_API_KEY → fallback summary).' : 'Note created from pasted text.')
      } catch (err) {
        setToast(err instanceof Error ? err.message : String(err))
      } finally {
        setSummarizeBusy(false)
      }
    },
    [createNote]
  )

  const handleDraft = useCallback(
    async (sourceId: string, channel: 'email' | 'linkedin') => {
      try {
        const source = notes.find((n) => n.id === sourceId)
        if (!source) return
        const result = await api.draftReply(sourceId, channel)
        const noteType: NoteType = channel === 'email' ? 'email_draft' : 'linkedin_draft'
        const draftNote = await api.createNote({
          node_type: noteType,
          title:
            channel === 'email'
              ? `Draft email: ${result.subject ?? source.title}`
              : `LI draft: ${source.title.slice(0, 60)}`,
          body: result.draft,
          status: 'open',
          source_type: source.node_type,
          source_id: source.id,
          position_x: source.position_x + 380,
          position_y: source.position_y + 30,
          tags_json: ['draft'],
        })
        await api.createEdge(source.id, draftNote.id, 'draft')
        await refetch()
        setSelectedNoteId(draftNote.id)
        camera.flyTo(draftNote.id, { zoomLevel: 'preview' })
        setToast(
          result.mocked
            ? `${channel === 'email' ? 'Email' : 'LinkedIn'} draft created (fallback — set OPENAI_API_KEY).`
            : `${channel === 'email' ? 'Email' : 'LinkedIn'} draft created.`
        )
      } catch (err) {
        setToast(err instanceof Error ? err.message : String(err))
      }
    },
    [notes, refetch, setSelectedNoteId, camera]
  )

  const handleStripeCheck = useCallback(async () => {
    try {
      const result = await api.runAutomation(
        'stripe.connection.check',
        'hotkey',
        {},
        { x: 2740, y: 80 + Math.random() * 600 }
      )
      await refetch()
      if (result.created_note_id) {
        setSelectedNoteId(result.created_note_id)
        camera.flyTo(result.created_note_id, { zoomLevel: 'preview' })
      }
      setToast(
        result.status === 'success'
          ? 'Stripe connection verified. Note added.'
          : result.status === 'needs_review'
            ? 'Stripe check needs review. Note added.'
            : `Stripe check failed: ${result.error ?? 'unknown'}`
      )
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    }
  }, [refetch, setSelectedNoteId, camera])

  const handlePatch = useCallback(
    async (id: string, patch: { title?: string; body?: string; status?: NoteStatus }) => {
      try {
        await api.updateNote(id, patch)
        await refetch()
        await refetchRunsAndStats()
      } catch (err) {
        setToast(err instanceof Error ? err.message : String(err))
      }
    },
    [refetch, refetchRunsAndStats]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await api.deleteNote(id)
        setSelectedNoteId(null)
        await refetch()
      } catch (err) {
        setToast(err instanceof Error ? err.message : String(err))
      }
    },
    [refetch, setSelectedNoteId]
  )

  const handleOpenNode = useCallback(
    (nodeId: string) => {
      setSelectedNoteId(nodeId)
      camera.flyTo(nodeId, { zoomLevel: 'preview' })
      // If we're already in a mode, jump there directly. Otherwise focus.
      if (mode.kind === 'focused') focus(nodeId)
      else if (mode.kind === 'immersive') immerse(nodeId)
      else focus(nodeId)
    },
    [camera, focus, immerse, mode.kind, setSelectedNoteId]
  )

  // ---- hotkeys ----

  // Cmd+K palette
  useHotkeys(['meta+k', 'ctrl+k'], (e) => {
    e.preventDefault()
    setPaletteOpen(true)
  })

  // N — new note (canvas mode only; in focused/immersive the user is editing)
  useHotkeys(
    'n',
    (e) => {
      if (mode.kind !== 'canvas') return
      e.preventDefault()
      void createNote('general_note')
    },
    { preventDefault: false }
  )

  // Ctrl+Q — summarize modal (canvas mode only)
  useHotkeys(['ctrl+q', 'meta+q'], (e) => {
    if (mode.kind !== 'canvas') return
    e.preventDefault()
    setSummarizeInitial(undefined)
    setSummarizeOpen(true)
  })

  // H — fly home (works in any mode, exits overlay first)
  useHotkeys(
    'h',
    (e) => {
      if (!homeNoteId) return
      e.preventDefault()
      if (mode.kind !== 'canvas') exit()
      camera.flyTo(homeNoteId, { zoomLevel: 'preview' })
      setSelectedNoteId(homeNoteId)
    },
    { preventDefault: false }
  )

  // Enter — escalate. canvas + selected → focused. focused → immersive.
  useHotkeys(
    'enter',
    (e) => {
      if (mode.kind === 'canvas') {
        if (!selectedNoteId) return
        e.preventDefault()
        focus(selectedNoteId)
      } else if (mode.kind === 'focused') {
        e.preventDefault()
        immerse(mode.nodeId)
      }
    },
    { enableOnFormTags: false }
  )

  // Esc — step back: immersive → focused → canvas
  useHotkeys('esc', () => {
    if (mode.kind !== 'canvas') {
      exit()
      return
    }
    setPaletteOpen(false)
    setSummarizeOpen(false)
  })

  useChord({
    modifiers: { shift: true },
    firstKey: 'a',
    secondKey: 'c',
    onFire: () => {
      if (mode.kind !== 'canvas') return
      void handleStripeCheck()
    },
  })

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (mode.kind !== 'canvas') return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      )
        return
      const text = e.clipboardData?.getData('text/plain')
      if (!text || text.trim().length < 20) return
      e.preventDefault()
      setSummarizeInitial(text)
      setSummarizeOpen(true)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [mode.kind])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') void refetch()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [refetch])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(t)
  }, [toast])

  const goHome = useCallback(() => {
    if (homeNoteId) {
      if (mode.kind !== 'canvas') exit()
      camera.flyTo(homeNoteId, { zoomLevel: 'preview' })
      setSelectedNoteId(homeNoteId)
    }
  }, [homeNoteId, camera, setSelectedNoteId, mode.kind, exit])

  const goCommandCenter = useCallback(() => {
    const id = notes.find((n) => n.node_type === 'command_center')?.id
    if (id) {
      if (mode.kind !== 'canvas') exit()
      camera.flyTo(id, { zoomLevel: 'preview' })
      setSelectedNoteId(id)
    }
  }, [notes, camera, setSelectedNoteId, mode.kind, exit])

  const onCommand = useCallback(
    (key: CommandKey, arg?: { nodeId?: string }) => {
      switch (key) {
        case 'go_home':
          goHome()
          break
        case 'go_command_center':
          goCommandCenter()
          break
        case 'go_node':
          if (arg?.nodeId) {
            if (mode.kind !== 'canvas') exit()
            camera.flyTo(arg.nodeId, { zoomLevel: 'preview' })
            setSelectedNoteId(arg.nodeId)
          }
          break
        case 'create_note':
          void createNote('general_note')
          break
        case 'create_prospect':
          void createNote('prospect', { title: 'New prospect' })
          break
        case 'create_account':
          void createNote('account', { title: 'New account' })
          break
        case 'create_followup':
          void createNote('followup', { title: 'New followup' })
          break
        case 'create_call_summary':
          void createNote('call_summary', { title: 'New call summary' })
          break
        case 'summarize_clipboard':
          setSummarizeInitial(undefined)
          setSummarizeOpen(true)
          break
        case 'run_stripe_check':
          void handleStripeCheck()
          break
        case 'draft_email_reply':
          if (selectedNote) void handleDraft(selectedNote.id, 'email')
          break
        case 'draft_linkedin_reply':
          if (selectedNote) void handleDraft(selectedNote.id, 'linkedin')
          break
        case 'mark_resolved':
          if (selectedNote) void handlePatch(selectedNote.id, { status: 'resolved' })
          break
        case 'search_notes':
          setPaletteOpen(true)
          setToast('Type to filter nodes — the palette doubles as search.')
          break
      }
    },
    [createNote, handleDraft, handlePatch, handleStripeCheck, selectedNote, camera, setSelectedNoteId, goHome, goCommandCenter, mode.kind, exit]
  )

  // ---- chrome opacity by mode ----
  const topBarOpacity = mode.kind === 'canvas' ? 1 : mode.kind === 'focused' ? 0.4 : 0
  const inspectorTranslate = mode.kind === 'canvas' ? 0 : 320
  const canvasBlur = mode.kind === 'canvas' ? 0 : mode.kind === 'focused' ? 6 : 10
  const canvasOpacity = mode.kind === 'canvas' ? 1 : mode.kind === 'focused' ? 0.55 : 0.25

  return (
    <div className="flex h-screen w-screen flex-col">
      <motion.div
        animate={{ opacity: topBarOpacity, y: mode.kind === 'immersive' ? -12 : 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        style={{ pointerEvents: mode.kind === 'immersive' ? 'none' : 'auto' }}
      >
        <TopBar
          stats={stats}
          onCommandPalette={() => setPaletteOpen(true)}
          onSummarize={() => {
            setSummarizeInitial(undefined)
            setSummarizeOpen(true)
          }}
          onStripe={handleStripeCheck}
        />
      </motion.div>

      {error ? <ErrorBanner message={error} onDismiss={() => void refetch()} /> : null}
      {toast ? (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-800 shadow-lg">
          {toast}
        </div>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading canvas…</div>
          ) : (
            <motion.div
              className="absolute inset-0"
              animate={{ filter: `blur(${canvasBlur}px)`, opacity: canvasOpacity }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              style={{ pointerEvents: mode.kind === 'canvas' ? 'auto' : 'none' }}
            >
              <ZoomTracker>
                <RendererContextProvider allNotes={notes} stats={stats}>
                  <ReactFlow
                    nodes={rfNodes}
                    edges={rfEdges}
                    nodeTypes={nodeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    minZoom={0.15}
                    maxZoom={2.5}
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background gap={24} size={1.5} color="#e7e5e4" />
                    <Controls position="bottom-right" showInteractive={false} />
                    <AnimatePresence>
                      {mode.kind === 'canvas' ? (
                        <motion.div
                          key="minimap"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <MiniMap
                            position="top-right"
                            pannable
                            zoomable
                            nodeColor={(n) => {
                              const data = n.data as NoteNodeData | undefined
                              const t = data?.note.node_type ?? 'general_note'
                              const map: Record<string, string> = {
                                daily_briefing: '#f59e0b',
                                command_center: '#0f172a',
                                prospect: '#3b82f6',
                                account: '#10b981',
                                call_summary: '#a855f7',
                                followup: '#f59e0b',
                                objection: '#ef4444',
                                email_draft: '#0ea5e9',
                                linkedin_draft: '#6366f1',
                                automation_result: '#d946ef',
                                task: '#64748b',
                                general_note: '#94a3b8',
                                box: '#a8a29e',
                                automation_hub: '#d946ef',
                                stripe: '#8b5cf6',
                                search: '#06b6d4',
                                ai_assistant: '#8b5cf6',
                                inbox: '#f97316',
                                settings: '#64748b',
                                voice_note: '#ec4899',
                                screenshot: '#14b8a6',
                                meeting: '#f43f5e',
                                capture: '#d946ef',
                              }
                              return map[t] ?? '#94a3b8'
                            }}
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </ReactFlow>
                </RendererContextProvider>
              </ZoomTracker>
            </motion.div>
          )}

          <AnimatePresence>
            {mode.kind === 'canvas' ? (
              <motion.div key="runs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <RunHistory
                  runs={runs}
                  onSelectNote={(id) => {
                    setSelectedNoteId(id)
                    camera.flyTo(id, { zoomLevel: 'preview' })
                  }}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* The overlay layer: focused + immersive. */}
          <RendererContextProvider allNotes={notes} stats={stats}>
            <OverlayLayer notes={notes} onPatch={handlePatch} onOpenNode={handleOpenNode} />
          </RendererContextProvider>
        </div>

        <motion.div
          animate={{ x: inspectorTranslate, opacity: mode.kind === 'canvas' ? 1 : 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 32 }}
          style={{ pointerEvents: mode.kind === 'canvas' ? 'auto' : 'none' }}
        >
          <Inspector
            note={selectedNote}
            onPatch={handlePatch}
            onDelete={handleDelete}
            onDraftEmail={(id) => void handleDraft(id, 'email')}
            onDraftLinkedIn={(id) => void handleDraft(id, 'linkedin')}
          />
        </motion.div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onCommand={onCommand}
        hasSelection={Boolean(selectedNote)}
        notes={notes}
      />

      <SummarizeModal
        open={summarizeOpen}
        busy={summarizeBusy}
        initialText={summarizeInitial}
        onClose={() => setSummarizeOpen(false)}
        onSubmit={(text) => void handleSummarize(text)}
      />
    </div>
  )
}

export function CanvasPage() {
  return (
    <ReactFlowProvider>
      <CanvasModeProvider>
        <CanvasApp />
      </CanvasModeProvider>
    </ReactFlowProvider>
  )
}
