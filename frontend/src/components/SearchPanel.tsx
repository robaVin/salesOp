import { useEffect, useMemo, useRef, useState } from 'react'
import { Mail, Search, StickyNote, Trash2 } from 'lucide-react'
import type { NoteRecord } from '../types'
import { TYPE_LABELS } from '../canvas/nodeStyles'

export type SearchFilterKey = 'all' | 'notes' | 'emails' | 'resolved' | 'trash'

const FILTERS: { key: SearchFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'notes', label: 'Notes' },
  { key: 'emails', label: 'Emails' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'trash', label: 'Trash' },
]

// ---- pure, reusable predicates + text helpers -------------------------------
// These are exported so a future Search Workspace node (or a server-side search)
// can reuse the exact same matching rules the overlay uses.

/** Zone container nodes are structural, not searchable objects. */
export function isSearchable(note: NoteRecord): boolean {
  return !note.node_type.endsWith('_zone')
}

export function isEmail(note: NoteRecord): boolean {
  return note.node_type === 'email'
}

/**
 * F3 (persistent Trash Bin) — soft-deleted nodes carry a `deleted_at` timestamp.
 * Live notes returned by GET /api/notes never have it; trashed notes come from
 * GET /api/notes/trash. Kept exported for reuse by a future Search Workspace node.
 */
export function isTrashed(note: NoteRecord): boolean {
  return Boolean(note.deleted_at)
}

export function searchHaystack(note: NoteRecord): string {
  const meta = note.metadata_json as Record<string, unknown> | undefined
  const aiSummary = meta && typeof meta.ai_summary === 'string' ? meta.ai_summary : ''
  const subject = meta && typeof meta.subject === 'string' ? meta.subject : ''
  return [
    note.title,
    note.body,
    (note.tags_json ?? []).join(' '),
    aiSummary,
    subject,
    TYPE_LABELS[note.node_type] ?? '',
  ]
    .join('  ')
    .toLowerCase()
}

function snippet(note: NoteRecord, query: string): string {
  const body = note.body?.trim() ?? ''
  if (!body) return ''
  if (query) {
    const idx = body.toLowerCase().indexOf(query.toLowerCase())
    if (idx >= 0) {
      const start = Math.max(0, idx - 24)
      const raw = body.slice(start, start + 96).replace(/\s+/g, ' ')
      return `${start > 0 ? '…' : ''}${raw}${start + 96 < body.length ? '…' : ''}`
    }
  }
  return body.length > 96 ? `${body.slice(0, 96).replace(/\s+/g, ' ')}…` : body
}

// ---- embeddable content ------------------------------------------------------

interface SearchPanelContentProps {
  notes: NoteRecord[]
  /** Soft-deleted notes (GET /api/notes/trash). Powers the Trash filter + count. */
  trashedNotes?: NoteRecord[]
  onSelect: (note: NoteRecord) => void
  /** Focus the input on mount. Overlay: true. Node embed: caller's choice. */
  autoFocus?: boolean
  /** When provided, an ESC hint + Escape-key close is shown (overlay mode). */
  onEscape?: () => void
}

/**
 * The search UI itself — input, filter chips, ranked results, counts. Owns its
 * own query/filter state and reads nothing from the canvas beyond the `notes`
 * prop and the `onSelect` callback, so it can be dropped either into the modal
 * wrapper below or, later, into a Search Workspace canvas node unchanged.
 */
export function SearchPanelContent({
  notes,
  trashedNotes = [],
  onSelect,
  autoFocus = true,
  onEscape,
}: SearchPanelContentProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SearchFilterKey>('all')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (autoFocus) window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [autoFocus])

  // Live notes matching the text query (the universe the non-trash chips count).
  const textMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const searchable = notes.filter(isSearchable)
    if (!q) return searchable
    return searchable.filter((n) => searchHaystack(n).includes(q))
  }, [notes, query])

  // Trashed notes matching the text query — a separate universe (they're not on
  // the canvas). Powers the Trash chip count and the Trash filter's results.
  const trashMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const searchable = trashedNotes.filter(isSearchable)
    if (!q) return searchable
    return searchable.filter((n) => searchHaystack(n).includes(q))
  }, [trashedNotes, query])

  const counts = useMemo(() => {
    let all = 0
    let notesCount = 0
    let emails = 0
    let resolved = 0
    for (const n of textMatches) {
      all += 1
      if (isEmail(n)) emails += 1
      else notesCount += 1
      if (n.status === 'resolved') resolved += 1
    }
    return { all, notes: notesCount, emails, resolved, trash: trashMatches.length }
  }, [textMatches, trashMatches])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered =
      filter === 'trash'
        ? trashMatches
        : textMatches.filter((n) => {
            switch (filter) {
              case 'notes':
                return !isEmail(n)
              case 'emails':
                return isEmail(n)
              case 'resolved':
                return n.status === 'resolved'
              case 'all':
              default:
                return true
            }
          })
    // Rank title matches first, then earliest body match, then recency.
    return filtered
      .map((n) => ({ n, titleIdx: q ? n.title.toLowerCase().indexOf(q) : -1 }))
      .sort((a, b) => {
        const aTitle = a.titleIdx >= 0
        const bTitle = b.titleIdx >= 0
        if (aTitle !== bTitle) return aTitle ? -1 : 1
        if (aTitle && bTitle && a.titleIdx !== b.titleIdx) return a.titleIdx - b.titleIdx
        return new Date(b.n.updated_at).getTime() - new Date(a.n.updated_at).getTime()
      })
      .slice(0, 80)
      .map((r) => r.n)
  }, [textMatches, trashMatches, filter, query])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <Search size={16} className="text-slate-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && onEscape) {
              e.preventDefault()
              onEscape()
            } else if (e.key === 'Enter' && results.length > 0) {
              e.preventDefault()
              onSelect(results[0])
            }
          }}
          placeholder="Search notes, emails, tasks, tags…"
          className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />
        <span className="tabular-nums text-[11px] text-slate-400">
          {results.length} {results.length === 1 ? 'result' : 'results'}
        </span>
        {onEscape ? (
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            ESC
          </kbd>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-2">
        {FILTERS.map((f) => {
          const count = counts[f.key]
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                active
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.key === 'trash' ? <Trash2 size={11} /> : null}
              <span>{f.label}</span>
              <span className={`tabular-nums ${active ? 'text-slate-300' : 'text-slate-400'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {results.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-slate-500">
            {query.trim() ? 'No matches.' : 'Type to search the canvas.'}
          </div>
        ) : (
          results.map((n) => {
            const email = isEmail(n)
            const accent = email ? 'border-l-yellow-500' : 'border-l-blue-500'
            const chipCls = email ? 'bg-yellow-50 text-yellow-700' : 'bg-blue-50 text-blue-700'
            const sn = snippet(n, query.trim())
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => onSelect(n)}
                className={`flex w-full items-start gap-3 border-l-2 ${accent} rounded-r-lg px-3 py-2 text-left hover:bg-slate-50`}
              >
                <span className="mt-0.5 text-slate-400">
                  {email ? <Mail size={15} /> : <StickyNote size={15} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-800">{n.title || 'Untitled'}</span>
                    {n.status === 'resolved' ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-700">
                        Resolved
                      </span>
                    ) : null}
                  </span>
                  {sn ? <span className="mt-0.5 block truncate text-xs text-slate-500">{sn}</span> : null}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${chipCls}`}>
                  {TYPE_LABELS[n.node_type] ?? n.node_type}
                </span>
              </button>
            )
          })
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
        <span>Enter to open the top result</span>
        <span className="flex items-center gap-1">
          <Trash2 size={11} className="text-slate-400" />
          {counts.trash} in trash
        </span>
      </div>
    </>
  )
}

// ---- modal wrapper (canvas chrome) ------------------------------------------

interface SearchPanelProps {
  open: boolean
  onClose: () => void
  notes: NoteRecord[]
  trashedNotes?: NoteRecord[]
  onSelect: (note: NoteRecord) => void
}

/**
 * Floating overlay used on the canvas. Mount/unmount on `open` gives a fresh
 * query+filter each time. The actual UI lives in <SearchPanelContent> so it can
 * be reused verbatim inside a Search Workspace node later.
 */
export function SearchPanel({ open, onClose, notes, trashedNotes, onSelect }: SearchPanelProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/30 pt-28"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <SearchPanelContent
          notes={notes}
          trashedNotes={trashedNotes}
          onSelect={onSelect}
          onEscape={onClose}
          autoFocus
        />
      </div>
    </div>
  )
}
