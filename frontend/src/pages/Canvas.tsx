import {
  Background,
  Controls,
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
import { PanelRightOpen } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { api } from '../api/client'
import { NoteNode, type NoteNodeData, RendererContextProvider } from '../canvas/NoteNode'
import { ZoneMiniMap } from '../canvas/ZoneMiniMap'
import { ZoomTracker } from '../canvas/ZoomContext'
import { useCameraController } from '../canvas/CameraController'
import { isClaimedByWorkspace, workspaceIdSet } from '../canvas/relations'
import { CanvasModeProvider, useCanvasMode } from '../canvas/CanvasModeContext'
import { OverlayLayer } from '../canvas/OverlayLayer'
import { CommandPalette, type CommandKey } from '../components/CommandPalette'
import { CreateWorkspaceModal } from '../components/CreateWorkspaceModal'
import { Onboarding } from '../components/Onboarding'
import { ErrorBanner } from '../components/ErrorBanner'
import { Inspector } from '../components/Inspector'
import { RunHistory } from '../components/RunHistory'
import { SearchPanel } from '../components/SearchPanel'
import { SummarizeModal } from '../components/SummarizeModal'
import { TrashPanel } from '../components/TrashPanel'
import { TopBar } from '../components/TopBar'
import { useChord } from '../hotkeys/chord'
import { useCanvasData } from '../state/canvasStore'
import type { NoteRecord, NoteStatus, NoteType } from '../types'

const nodeTypes = { note: NoteNode }

function CanvasApp() {
  const {
    notes,
    trashedNotes,
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [createWsSource, setCreateWsSource] = useState<NoteRecord | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(true)
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
    // Emails are not free-floating canvas nodes — they render inside the
    // Email zone's scrollable list. Nodes claimed by a user workspace also
    // leave the flat canvas (they live in that workspace). Everything else
    // is a real node.
    const wsIds = workspaceIdSet(notes)
    const canvasNotes = notes.filter(
      (n) => n.node_type !== 'email' && !isClaimedByWorkspace(n, wsIds)
    )
    const next: Node<NoteNodeData>[] = canvasNotes.map((note) => {
      // Zones render underneath their contained children. React Flow paints
      // nodes in ascending zIndex order, so setting zone zIndex to a large
      // negative value keeps them visually behind everything else while
      // preserving their normal interaction (drag, select, Enter to zoom).
      const isZone = note.node_type.endsWith('_zone')
      // Prefer the session-local position (updated on drag end) over the
      // server value: rebuilds triggered by selection changes would otherwise
      // snap freshly-dragged nodes back to their pre-drag spot until the
      // next refetch lands.
      const local = positionsRef.current.get(note.id)
      return {
        id: note.id,
        type: 'note',
        position: local ?? { x: note.position_x, y: note.position_y },
        data: { note },
        selected: note.id === selectedNoteId,
        zIndex: isZone ? -10 : 1,
        // Prevent zones from consuming small-drag intents on their edges.
        // The header + child tiles remain clickable; the zone body is a
        // background surface.
        draggable: !isZone,
      }
    })
    setRfNodes(next)
    canvasNotes.forEach((n) => {
      if (!positionsRef.current.has(n.id)) {
        positionsRef.current.set(n.id, { x: n.position_x, y: n.position_y })
      }
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

  const rfEdges: Edge[] = useMemo(() => {
    // Drop edges whose endpoints aren't rendered nodes (trashed, emails, or
    // claimed-into-a-workspace), otherwise React Flow warns about edges
    // referencing missing nodes.
    const wsIds = workspaceIdSet(notes)
    const liveIds = new Set(
      notes.filter((n) => n.node_type !== 'email' && !isClaimedByWorkspace(n, wsIds)).map((n) => n.id)
    )
    return edgeRows
      .filter((e) => liveIds.has(e.source_node_id) && liveIds.has(e.target_node_id))
      .map((e) => ({
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        label: e.label ?? undefined,
        type: 'smoothstep',
      }))
  }, [edgeRows, notes])

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

  const workspaces = useMemo(() => notes.filter((n) => n.is_workspace), [notes])

  // ---- actions ----

  const createNote = useCallback(
    async (type: NoteType, overrides: Partial<NoteRecord> = {}) => {
      try {
        const note = await api.createNote({
          node_type: type,
          title: overrides.title ?? `New ${type.replace('_', ' ')}`,
          body: overrides.body ?? '',
          status: overrides.status ?? 'open',
          // No position → the backend drops it into its home zone
          // (notes → Notes zone, emails → Email zone, tasks → Tasks zone…).
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
      // No position → the backend places the result in the Automation zone.
      const result = await api.runAutomation('stripe.connection.check', 'hotkey', {})
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
        setToast('Moved to Trash. Open the Trash bin to restore it.')
      } catch (err) {
        setToast(err instanceof Error ? err.message : String(err))
      }
    },
    [refetch, setSelectedNoteId]
  )

  const handleRestore = useCallback(
    async (id: string) => {
      try {
        await api.restoreNote(id)
        await refetch()
        setSelectedNoteId(id)
        camera.flyTo(id, { zoomLevel: 'preview' })
        setToast('Restored to the canvas.')
      } catch (err) {
        setToast(err instanceof Error ? err.message : String(err))
      }
    },
    [refetch, setSelectedNoteId, camera]
  )

  const handlePurge = useCallback(
    async (note: NoteRecord) => {
      const ok = window.confirm(
        `Permanently delete "${note.title || 'Untitled'}"? This cannot be undone.`
      )
      if (!ok) return
      try {
        await api.purgeNote(note.id)
        await refetch()
        setToast('Permanently deleted.')
      } catch (err) {
        setToast(err instanceof Error ? err.message : String(err))
      }
    },
    [refetch]
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

  const openCreateWorkspace = useCallback(
    (id: string) => {
      setCreateWsSource(notes.find((n) => n.id === id) ?? null)
    },
    [notes]
  )

  const handleCreateWorkspace = useCallback(
    async (body: { title: string; workspace_kind: string; color: string; icon: string }) => {
      const src = createWsSource
      if (!src) return
      try {
        const ws = await api.createWorkspace(src.id, body)
        setCreateWsSource(null)
        await refetch()
        setSelectedNoteId(ws.id)
        camera.flyTo(ws.id, { zoomLevel: 'preview' })
        setToast('Workspace created. The source is its anchor.')
      } catch (err) {
        setToast(err instanceof Error ? err.message : String(err))
      }
    },
    [createWsSource, refetch, setSelectedNoteId, camera]
  )

  const handleMoveToWorkspace = useCallback(
    async (id: string, parentNodeId: string) => {
      try {
        await api.moveToWorkspace(id, parentNodeId)
        await refetch()
        setToast('Moved into workspace.')
      } catch (err) {
        setToast(err instanceof Error ? err.message : String(err))
      }
    },
    [refetch]
  )

  const handleRemoveFromWorkspace = useCallback(
    async (id: string) => {
      try {
        await api.removeFromWorkspace(id)
        await refetch()
        setSelectedNoteId(id)
        camera.flyTo(id, { zoomLevel: 'preview' }) // it's back in its zone
        setToast('Removed from workspace.')
      } catch (err) {
        setToast(err instanceof Error ? err.message : String(err))
      }
    },
    [refetch, setSelectedNoteId, camera]
  )

  const handleAddNoteToWorkspace = useCallback(
    async (workspaceId: string) => {
      try {
        const note = await api.createNote({ node_type: 'general_note', title: 'New note', body: '' })
        // Reuse the move path so parent_node_id writes stay behind one helper.
        await api.moveToWorkspace(note.id, workspaceId)
        await refetch()
        setSelectedNoteId(note.id)
        focus(note.id) // open the fresh note for immediate editing
        setToast('Note added to workspace.')
      } catch (err) {
        setToast(err instanceof Error ? err.message : String(err))
      }
    },
    [refetch, setSelectedNoteId, focus]
  )

  const handleSearchSelect = useCallback(
    (note: NoteRecord) => {
      setSearchOpen(false)
      // Trashed results aren't on the canvas — surface them in the Trash bin.
      if (note.deleted_at) {
        setTrashOpen(true)
        return
      }
      if (mode.kind !== 'canvas') exit()
      setSelectedNoteId(note.id)
      if (note.node_type === 'email') {
        // Emails aren't free-floating nodes — fly to the Email zone that hosts them.
        const zoneId = notes.find((n) => n.node_type === 'email_zone')?.id
        if (zoneId) camera.flyTo(zoneId, { zoomLevel: 'preview' })
      } else {
        camera.flyTo(note.id, { zoomLevel: 'preview' })
      }
    },
    [notes, camera, setSelectedNoteId, mode.kind, exit]
  )

  // Double-click a node to open it (same as selecting it and pressing Enter).
  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node<NoteNodeData>) => {
      if (mode.kind !== 'canvas') return
      setSelectedNoteId(node.id)
      focus(node.id)
    },
    [mode.kind, setSelectedNoteId, focus]
  )

  // ---- hotkeys ----

  // Cmd+K palette
  useHotkeys(['meta+k', 'ctrl+k'], (e) => {
    e.preventDefault()
    setPaletteOpen(true)
  })

  // "/" — search & filters (canvas mode only). Deliberately NOT Cmd/Ctrl+F so
  // the browser's native find-in-page stays available.
  useHotkeys('/', (e) => {
    if (mode.kind !== 'canvas') return
    e.preventDefault()
    setSearchOpen(true)
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
    setSearchOpen(false)
    setTrashOpen(false)
    setCreateWsSource(null)
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
          setSearchOpen(true)
          break
        case 'open_trash':
          setTrashOpen(true)
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
          trashCount={trashedNotes.length}
          onTrash={() => setTrashOpen((v) => !v)}
          onCommandPalette={() => setPaletteOpen(true)}
          onSearch={() => setSearchOpen(true)}
          onNewNote={() => void createNote('general_note')}
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
                    onNodeDoubleClick={onNodeDoubleClick}
                    zoomOnDoubleClick={false}
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
                          <ZoneMiniMap notes={notes} />
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

          <TrashPanel
            open={trashOpen && mode.kind === 'canvas'}
            notes={trashedNotes}
            onClose={() => setTrashOpen(false)}
            onRestore={handleRestore}
            onPurge={handlePurge}
          />

          {/* The overlay layer: focused + immersive. */}
          <RendererContextProvider allNotes={notes} stats={stats}>
            <OverlayLayer
              notes={notes}
              onPatch={handlePatch}
              onOpenNode={handleOpenNode}
              onDelete={handleDelete}
              onCreateWorkspace={openCreateWorkspace}
              onAddNote={handleAddNoteToWorkspace}
              onRemoveFromWorkspace={handleRemoveFromWorkspace}
            />
          </RendererContextProvider>

          {/* Reopen tab for the collapsed inspector. */}
          {!inspectorOpen && mode.kind === 'canvas' ? (
            <button
              type="button"
              onClick={() => setInspectorOpen(true)}
              title="Open inspector"
              className="absolute right-0 top-1/2 z-20 -translate-y-1/2 rounded-l-lg border border-r-0 border-slate-200 bg-white px-1.5 py-3 text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-800"
            >
              <PanelRightOpen size={15} />
            </button>
          ) : null}
        </div>

        <motion.div
          animate={{
            width: inspectorOpen ? 320 : 0,
            x: inspectorTranslate,
            opacity: mode.kind === 'canvas' && inspectorOpen ? 1 : 0,
          }}
          transition={{ type: 'spring', stiffness: 280, damping: 32 }}
          style={{ pointerEvents: mode.kind === 'canvas' && inspectorOpen ? 'auto' : 'none' }}
          className="overflow-hidden"
        >
          <Inspector
            note={selectedNote}
            workspaces={workspaces}
            onPatch={handlePatch}
            onDelete={handleDelete}
            onDraftEmail={(id) => void handleDraft(id, 'email')}
            onDraftLinkedIn={(id) => void handleDraft(id, 'linkedin')}
            onCreateWorkspace={openCreateWorkspace}
            onMoveToWorkspace={(id, parentId) => void handleMoveToWorkspace(id, parentId)}
            onAddNote={(id) => void handleAddNoteToWorkspace(id)}
            onRemoveFromWorkspace={(id) => void handleRemoveFromWorkspace(id)}
            onClose={() => setInspectorOpen(false)}
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

      <SearchPanel
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        notes={notes}
        trashedNotes={trashedNotes}
        onSelect={handleSearchSelect}
      />

      <CreateWorkspaceModal
        open={Boolean(createWsSource)}
        source={createWsSource}
        onClose={() => setCreateWsSource(null)}
        onSubmit={(body) => void handleCreateWorkspace(body)}
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
        <Onboarding />
      </CanvasModeProvider>
    </ReactFlowProvider>
  )
}
