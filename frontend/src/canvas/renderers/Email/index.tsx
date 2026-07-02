import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { AlertTriangle, ExternalLink, Loader2, Mail, Paperclip, Sparkles, Star, Tag, Trash2 } from 'lucide-react'
import type { NoteRecord } from '../../../types'
import type { NodeRendererSet, RendererProps, DetailRendererProps } from '../types'
import { CardFrame, CreateWorkspaceButton, DetailShell, RemoveFromWorkspaceButton, StatusPill } from '../shared'

// Extract a typed view over the metadata_json bag that Gmail (and future email
// sources) write. Every field is optional so a partial payload still renders.
interface EmailMeta {
  from_name?: string
  from_email?: string
  subject?: string
  snippet?: string
  received_at?: string
  is_unread?: boolean
  is_important?: boolean
  thread_id?: string
  labels?: string[]
  external_url?: string
  source_provider?: string
  provider_mode?: string
  has_attachments?: boolean
  ai_summary?: string
  ai_summary_generated_at?: string
  ai_summary_mocked?: boolean
}

function readMeta(note: NoteRecord): EmailMeta {
  const raw = (note.metadata_json ?? {}) as Record<string, unknown>
  return {
    from_name: typeof raw.from_name === 'string' ? raw.from_name : undefined,
    from_email: typeof raw.from_email === 'string' ? raw.from_email : undefined,
    subject: typeof raw.subject === 'string' ? raw.subject : undefined,
    snippet: typeof raw.snippet === 'string' ? raw.snippet : undefined,
    received_at: typeof raw.received_at === 'string' ? raw.received_at : undefined,
    is_unread: raw.is_unread === true,
    is_important: raw.is_important === true,
    thread_id: typeof raw.thread_id === 'string' ? raw.thread_id : undefined,
    labels: Array.isArray(raw.labels)
      ? raw.labels.filter((l): l is string => typeof l === 'string')
      : undefined,
    external_url: typeof raw.external_url === 'string' ? raw.external_url : undefined,
    source_provider:
      typeof raw.source_provider === 'string' ? raw.source_provider : undefined,
    provider_mode: typeof raw.provider_mode === 'string' ? raw.provider_mode : undefined,
    has_attachments: raw.has_attachments === true,
    ai_summary: typeof raw.ai_summary === 'string' ? raw.ai_summary : undefined,
    ai_summary_generated_at:
      typeof raw.ai_summary_generated_at === 'string' ? raw.ai_summary_generated_at : undefined,
    ai_summary_mocked: raw.ai_summary_mocked === true,
  }
}

/**
 * Lazily fetches the AI summary for this email node. If the metadata already
 * has one cached, we render it immediately. Otherwise we POST to the summarize
 * endpoint, which generates + caches inside metadata_json.ai_summary. Only
 * runs when the Detail view mounts, so we never spend model tokens during
 * sync.
 */
function useLazyAiSummary(note: NoteRecord): {
  summary: string | null
  loading: boolean
  error: string | null
  mocked: boolean
} {
  const meta = readMeta(note)
  const cached = meta.ai_summary ?? null
  const [summary, setSummary] = useState<string | null>(cached)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mocked, setMocked] = useState<boolean>(Boolean(meta.ai_summary_mocked))

  useEffect(() => {
    if (summary) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/notes/${encodeURIComponent(note.id)}/ai-summarize`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then(async (r) => {
        if (!r.ok) {
          const detail = await r.json().catch(() => ({}))
          throw new Error((detail as { error?: string }).error ?? `HTTP ${r.status}`)
        }
        return r.json() as Promise<{ summary: string; mocked: boolean }>
      })
      .then((data) => {
        if (cancelled) return
        setSummary(data.summary ?? '')
        setMocked(Boolean(data.mocked))
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // Refetch only when the note id changes; content updates in Detail come
    // through the parent-provided note record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  return { summary, loading, error, mocked }
}

function formatRelative(iso: string | undefined): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const diffMs = Date.now() - t
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function senderDisplay(m: EmailMeta): string {
  if (m.from_name && m.from_name.trim().length > 0) return m.from_name
  if (m.from_email) return m.from_email
  return 'Unknown sender'
}

// ---------- Compact (zoomed out) ----------
function Compact({ note, selected }: RendererProps) {
  const m = readMeta(note)
  const unread = m.is_unread === true
  return (
    <CardFrame note={note} selected={selected} size="compact">
      <div className="flex h-full items-center gap-2.5 px-3 py-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-200 text-yellow-900">
          <Mail size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-yellow-800">
              {senderDisplay(m)}
            </p>
            {unread ? <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" /> : null}
          </div>
          <p
            className={clsx(
              'truncate text-[13px] text-slate-900',
              unread ? 'font-semibold' : 'font-medium'
            )}
          >
            {note.title}
          </p>
        </div>
      </div>
    </CardFrame>
  )
}

// ---------- Preview (mid-zoom) ----------
function Preview({ note, selected }: RendererProps) {
  const m = readMeta(note)
  const unread = m.is_unread === true
  const important = m.is_important === true
  return (
    <CardFrame note={note} selected={selected} size="preview">
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <div className="flex items-center gap-1.5">
          <Mail size={12} className="text-yellow-700" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-yellow-800">
            Email
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {unread ? (
            <span className="rounded-full bg-yellow-200 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-yellow-900">
              Unread
            </span>
          ) : null}
          {important ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-amber-800">
              <Star size={9} />
              Important
            </span>
          ) : null}
        </div>
      </div>
      <div className="px-3 pb-3 pt-1">
        <p className="text-[11px] font-medium text-slate-600">
          {senderDisplay(m)}
          {m.received_at ? (
            <span className="text-slate-400"> · {formatRelative(m.received_at)}</span>
          ) : null}
        </p>
        <h3
          className={clsx(
            'mt-1 text-[13px] leading-snug text-slate-900',
            unread ? 'font-semibold' : 'font-medium'
          )}
        >
          {note.title}
        </h3>
        {m.snippet ? (
          <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-slate-600">
            {m.snippet}
          </p>
        ) : null}
      </div>
    </CardFrame>
  )
}

// ---------- Detail (click / Enter — focused or immersive) ----------
function Detail({ note, mode, onExit, onDelete, onCreateWorkspace, onRemoveFromWorkspace }: DetailRendererProps) {
  const m = readMeta(note)
  const unread = m.is_unread === true
  const important = m.is_important === true
  const isImmersive = mode === 'immersive'
  const providerLabel = m.provider_mode === 'mock' ? 'Gmail (mock)' : 'Gmail'
  const ai = useLazyAiSummary(note)

  return (
    <DetailShell mode={mode}>
      <div className={clsx('mx-auto w-full', isImmersive ? 'max-w-4xl' : 'max-w-3xl')}>
        {/* Header */}
        <div
          className={clsx(
            'border-b border-yellow-100 bg-gradient-to-br from-yellow-50 via-white to-white',
            isImmersive ? 'px-10 pb-6 pt-10' : 'px-8 pb-5 pt-7'
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={clsx(
                'flex items-center justify-center rounded-2xl bg-yellow-200 text-yellow-900',
                isImmersive ? 'h-14 w-14' : 'h-12 w-12'
              )}
            >
              <Mail size={isImmersive ? 24 : 20} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-yellow-800">
                  {providerLabel}
                </p>
                {important ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                    <Star size={10} />
                    Important
                  </span>
                ) : null}
                {unread ? (
                  <span className="rounded-full bg-yellow-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-yellow-900">
                    Unread
                  </span>
                ) : null}
              </div>
              <h2
                className={clsx(
                  'mt-1 font-semibold text-slate-900',
                  isImmersive ? 'text-[26px]' : 'text-[20px]'
                )}
              >
                {note.title || m.subject || '(no subject)'}
              </h2>
              <p className="mt-1 text-[12.5px] text-slate-700">
                <span className="font-medium">{senderDisplay(m)}</span>
                {m.from_email && m.from_name ? (
                  <span className="text-slate-500"> · {m.from_email}</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-[11.5px] text-slate-500">
                {m.received_at
                  ? `Received ${new Date(m.received_at).toLocaleString()} · ${formatRelative(m.received_at)}`
                  : 'Received time unknown'}
              </p>
            </div>
            <StatusPill status={note.status} />
          </div>
        </div>

        {/* Body */}
        <div className={clsx(isImmersive ? 'px-10 py-8' : 'px-8 py-6')}>
          {/* Lazy AI summary — generated on first open, cached after that. */}
          <div className="rounded-2xl border border-violet-100 bg-violet-50/50 px-5 py-4">
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-violet-700" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-800">
                AI summary
              </p>
              {ai.mocked ? (
                <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wider text-slate-500">
                  fallback
                </span>
              ) : null}
            </div>
            {ai.loading ? (
              <div className="mt-2 flex items-center gap-2 text-[12px] text-slate-500">
                <Loader2 size={12} className="animate-spin" />
                Summarizing…
              </div>
            ) : ai.summary ? (
              <p className="mt-2 text-[13px] leading-relaxed text-slate-800">{ai.summary}</p>
            ) : ai.error ? (
              <p className="mt-2 text-[12px] text-slate-500">
                Couldn't summarize ({ai.error}). Read the snippet below.
              </p>
            ) : (
              <p className="mt-2 text-[12px] italic text-slate-500">No summary yet.</p>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-yellow-100 bg-yellow-50/40 px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-yellow-800">
              Snippet
            </p>
            {m.snippet || note.body ? (
              <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-800">
                {m.snippet || note.body}
              </p>
            ) : (
              <p className="mt-2 text-[12.5px] italic text-slate-500">
                No snippet available. Open in Gmail to read the full message.
              </p>
            )}
          </div>

          {/* Meta grid */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <MetaCell label="From" value={senderDisplay(m)} sub={m.from_email} />
            <MetaCell label="Received" value={formatRelative(m.received_at) || '—'} />
            <MetaCell label="Provider" value={providerLabel} />
            {m.thread_id ? (
              <MetaCell label="Thread id" value={m.thread_id} mono />
            ) : null}
            {m.labels && m.labels.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 sm:col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Labels
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.labels.map((l) => (
                    <span
                      key={l}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-700"
                    >
                      <Tag size={9} />
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {m.has_attachments ? (
              <MetaCell
                label="Attachments"
                value="Yes"
                iconEl={<Paperclip size={11} className="text-slate-500" />}
              />
            ) : null}
          </div>

          {/* Provider actions */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {m.external_url ? (
              <a
                href={m.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:bg-yellow-600"
              >
                Open in Gmail
                <ExternalLink size={13} />
              </a>
            ) : null}
            {onExit ? (
              <button
                type="button"
                onClick={onExit}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Back to canvas
              </button>
            ) : null}
            {onCreateWorkspace ? <CreateWorkspaceButton onClick={onCreateWorkspace} /> : null}
            {onRemoveFromWorkspace ? <RemoveFromWorkspaceButton onClick={onRemoveFromWorkspace} /> : null}
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="ml-auto inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-[12.5px] font-medium text-red-700 hover:bg-red-50"
                title="Move this email to Trash"
              >
                <Trash2 size={13} />
                Delete
              </button>
            ) : null}
          </div>

          {m.provider_mode === 'mock' ? (
            <div className="mt-6 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[11.5px] text-amber-900">
              <AlertTriangle size={13} className="mt-0.5 text-amber-700" />
              <p>
                This message is from the <strong>mock provider</strong>. It's synthetic data used
                for development when Gmail is not connected. Set <code>GMAIL_PROVIDER=real</code>{' '}
                and connect Gmail from the top bar to pull real messages.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </DetailShell>
  )
}

function MetaCell({
  label,
  value,
  sub,
  mono,
  iconEl,
}: {
  label: string
  value: string
  sub?: string
  mono?: boolean
  iconEl?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {iconEl}
        {label}
      </p>
      <p
        className={clsx(
          'mt-1.5 text-[13px] text-slate-900',
          mono ? 'font-mono text-[11.5px]' : 'font-medium'
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  )
}

export const Email: NodeRendererSet = {
  compact: Compact,
  preview: Preview,
  detail: Detail,
  defaultWidth: 300,
  defaultHeight: 190,
}
