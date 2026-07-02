import type {
  AutomationRunRecord,
  EdgeRecord,
  NoteRecord,
  NoteStatus,
  NoteType,
  StatsResponse,
} from '../types'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    let detail: unknown = null
    try {
      detail = await res.json()
    } catch {
      /* ignore */
    }
    throw new Error(
      `Request ${path} failed: ${res.status} ${res.statusText}${
        detail ? ` — ${JSON.stringify(detail)}` : ''
      }`
    )
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  listNotes: () => request<{ data: NoteRecord[] }>('/api/notes'),
  listEdges: () => request<{ data: EdgeRecord[] }>('/api/edges'),

  createNote: (input: Partial<NoteRecord> & { node_type: NoteType; title: string }) =>
    request<NoteRecord>('/api/notes', {
      method: 'POST',
      body: JSON.stringify({
        node_type: input.node_type,
        title: input.title,
        body: input.body ?? '',
        status: input.status ?? 'open',
        tags: input.tags_json ?? [],
        // Omitted → the backend places the node inside its home zone.
        position_x: input.position_x,
        position_y: input.position_y,
        width: input.width ?? 260,
        height: input.height ?? 160,
        source_type: input.source_type ?? undefined,
        source_id: input.source_id ?? undefined,
        metadata: input.metadata_json ?? {},
      }),
    }),

  updateNote: (id: string, patch: Partial<NoteRecord> & { tags?: string[] }) => {
    const body: Record<string, unknown> = {}
    if (patch.title !== undefined) body.title = patch.title
    if (patch.body !== undefined) body.body = patch.body
    if (patch.status !== undefined) body.status = patch.status
    if (patch.tags !== undefined) body.tags = patch.tags
    if (patch.position_x !== undefined) body.position_x = patch.position_x
    if (patch.position_y !== undefined) body.position_y = patch.position_y
    if (patch.width !== undefined) body.width = patch.width
    if (patch.height !== undefined) body.height = patch.height
    if (patch.node_type !== undefined) body.node_type = patch.node_type
    return request<NoteRecord>(`/api/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  patchPosition: (id: string, x: number, y: number) =>
    request<NoteRecord>(`/api/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ position_x: x, position_y: y }),
    }),

  // Soft delete — moves the note to the trash (recoverable).
  deleteNote: (id: string) => request<void>(`/api/notes/${id}`, { method: 'DELETE' }),

  listTrash: () => request<{ data: NoteRecord[] }>('/api/notes/trash'),

  restoreNote: (id: string) => request<NoteRecord>(`/api/notes/${id}/restore`, { method: 'POST' }),

  // Permanent delete — hard removal, only for already-trashed notes.
  purgeNote: (id: string) => request<void>(`/api/notes/${id}/permanent`, { method: 'DELETE' }),

  createEdge: (source_node_id: string, target_node_id: string, label?: string) =>
    request<EdgeRecord>('/api/edges', {
      method: 'POST',
      body: JSON.stringify({ source_node_id, target_node_id, label }),
    }),

  summarize: (text: string, hint_type?: NoteType) =>
    request<{
      title: string
      body: string
      node_type: NoteType
      tags: string[]
      next_step: string | null
      cached?: boolean
      mocked?: boolean
    }>('/api/ai/summarize', {
      method: 'POST',
      body: JSON.stringify({ text, hint_type }),
    }),

  draftReply: (sourceNoteId: string, channel: 'email' | 'linkedin', intent?: string) =>
    request<{
      subject: string | null
      draft: string
      cached?: boolean
      mocked?: boolean
    }>('/api/ai/draft-reply', {
      method: 'POST',
      body: JSON.stringify({ source_note_id: sourceNoteId, channel, intent }),
    }),

  runAutomation: (
    routine_key: string,
    trigger_type: 'hotkey' | 'manual' | 'palette' = 'manual',
    trigger_payload: Record<string, unknown> = {},
    position?: { x: number; y: number }
  ) =>
    request<{
      run_id: string
      status: 'success' | 'needs_review' | 'failed' | 'skipped'
      created_note_id: string | null
      result: Record<string, unknown>
      error: string | null
    }>('/api/automations/run', {
      method: 'POST',
      body: JSON.stringify({ routine_key, trigger_type, trigger_payload, position }),
    }),

  listAutomationRuns: () =>
    request<{ data: AutomationRunRecord[] }>('/api/automations/runs?limit=20'),

  patchStatus: (id: string, status: NoteStatus) =>
    request<NoteRecord>(`/api/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  stats: () => request<StatsResponse>('/api/stats'),
}
