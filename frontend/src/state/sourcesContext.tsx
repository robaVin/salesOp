import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * Universal source (Gmail today; Slack/Outlook/HubSpot/meetings/voice later).
 * The server returns everything the UI needs to render a connect button and
 * a status indicator without knowing which provider it is.
 */
export interface SourceStatus {
  key: string
  display_name: string
  produces_node_type: string
  connected: boolean
  state: 'not_connected' | 'connected' | 'error'
  external_account_email: string | null
  scopes: string[]
  last_sync_at: string | null
  detail: string | null
}

interface SyncResult {
  syncId: string
  status: 'success' | 'partial' | 'failed'
  objects_added: number
  objects_updated: number
  cursor_watermark: string | null
  error: string | null
}

interface SourcesContextValue {
  sources: SourceStatus[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  connect: (key: string, redirect?: string) => Promise<{ url: string; mode: string } | null>
  disconnect: (key: string) => Promise<void>
  sync: (key: string, opts?: { limit?: number }) => Promise<SyncResult | null>
  syncing: Record<string, boolean>
  lastSyncResult: Record<string, SyncResult | null>
}

const SourcesContext = createContext<SourcesContextValue | null>(null)

async function jsonOrThrow(res: Response): Promise<unknown> {
  if (res.ok) return res.json()
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* ignore */
  }
  const detail =
    body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : `HTTP ${res.status}`
  throw new Error(detail)
}

export function SourcesProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<SourceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<Record<string, boolean>>({})
  const [lastSyncResult, setLastSyncResult] = useState<Record<string, SyncResult | null>>({})
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setError(null)
    try {
      const res = await fetch('/api/sources', { credentials: 'include' })
      if (res.status === 401) {
        setSources([])
        setLoading(false)
        return
      }
      const data = (await jsonOrThrow(res)) as { data: SourceStatus[] }
      setSources(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()
    // If the callback bounced back to us with ?gmail=ok, run one refresh so
    // the UI immediately reflects the new state.
    const params = new URLSearchParams(window.location.search)
    if (params.has('gmail')) {
      // Strip the query param to keep the URL clean, but keep other params intact.
      params.delete('gmail')
      params.delete('gmail_detail')
      const q = params.toString()
      const url = window.location.pathname + (q ? `?${q}` : '') + window.location.hash
      window.history.replaceState({}, '', url)
      void refresh()
    }
  }, [refresh])

  const connect = useCallback(
    async (key: string, redirect: string = window.location.pathname) => {
      const res = await fetch(`/api/gmail/oauth/prepare`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirect }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'prepare_failed' }))) as {
          error?: string
        }
        setError(body.error ?? `HTTP ${res.status}`)
        return null
      }
      const data = (await res.json()) as { url: string; mode: string }
      // Top-level navigation — required for OAuth (or the mock callback that
      // needs the session cookie to identify the user).
      window.location.href = data.url
      return data
    },
    // key argument reserved for when we support more providers with per-provider prep routes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const disconnect = useCallback(
    async (key: string) => {
      const res = await fetch(`/api/sources/${encodeURIComponent(key)}/disconnect`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        setError(`disconnect failed: ${res.status}`)
        return
      }
      await refresh()
    },
    [refresh]
  )

  const sync = useCallback(
    async (key: string, opts: { limit?: number } = {}): Promise<SyncResult | null> => {
      setSyncing((s) => ({ ...s, [key]: true }))
      setError(null)
      try {
        const res = await fetch(`/api/sources/${encodeURIComponent(key)}/sync`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(opts),
        })
        const data = (await jsonOrThrow(res)) as SyncResult
        setLastSyncResult((r) => ({ ...r, [key]: data }))
        await refresh()
        return data
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        return null
      } finally {
        setSyncing((s) => ({ ...s, [key]: false }))
      }
    },
    [refresh]
  )

  const value = useMemo<SourcesContextValue>(
    () => ({
      sources,
      loading,
      error,
      refresh,
      connect,
      disconnect,
      sync,
      syncing,
      lastSyncResult,
    }),
    [sources, loading, error, refresh, connect, disconnect, sync, syncing, lastSyncResult]
  )

  return <SourcesContext.Provider value={value}>{children}</SourcesContext.Provider>
}

export function useSources(): SourcesContextValue {
  const ctx = useContext(SourcesContext)
  if (!ctx) throw new Error('useSources must be used inside SourcesProvider')
  return ctx
}
