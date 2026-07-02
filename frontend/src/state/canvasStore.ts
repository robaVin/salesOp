import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { AutomationRunRecord, EdgeRecord, NoteRecord, StatsResponse } from '../types'

export interface CanvasState {
  notes: NoteRecord[]
  trashedNotes: NoteRecord[]
  edges: EdgeRecord[]
  runs: AutomationRunRecord[]
  stats: StatsResponse | null
  loading: boolean
  error: string | null
  selectedNoteId: string | null
  setSelectedNoteId: (id: string | null) => void
  refetch: () => Promise<void>
  refetchRunsAndStats: () => Promise<void>
}

export function useCanvasData(): CanvasState {
  const [notes, setNotes] = useState<NoteRecord[]>([])
  const [trashedNotes, setTrashedNotes] = useState<NoteRecord[]>([])
  const [edges, setEdges] = useState<EdgeRecord[]>([])
  const [runs, setRuns] = useState<AutomationRunRecord[]>([])
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const isFetching = useRef(false)

  const refetch = useCallback(async () => {
    if (isFetching.current) return
    isFetching.current = true
    setError(null)
    try {
      const [nResp, tResp, eResp, rResp, sResp] = await Promise.all([
        api.listNotes(),
        api.listTrash(),
        api.listEdges(),
        api.listAutomationRuns(),
        api.stats(),
      ])
      setNotes(nResp.data)
      setTrashedNotes(tResp.data)
      setEdges(eResp.data)
      setRuns(rResp.data)
      setStats(sResp)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
      isFetching.current = false
    }
  }, [])

  const refetchRunsAndStats = useCallback(async () => {
    try {
      const [rResp, sResp] = await Promise.all([api.listAutomationRuns(), api.stats()])
      setRuns(rResp.data)
      setStats(sResp)
    } catch {
      /* ignore — stats are not critical */
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return {
    notes,
    trashedNotes,
    edges,
    runs,
    stats,
    loading,
    error,
    selectedNoteId,
    setSelectedNoteId,
    refetch,
    refetchRunsAndStats,
  }
}
