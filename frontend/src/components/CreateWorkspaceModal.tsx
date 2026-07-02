import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  Folder,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { api } from '../api/client'
import type { NoteRecord, WorkspaceKind } from '../types'

const ICONS: Record<string, LucideIcon> = {
  target: Target,
  building: Building2,
  'alert-triangle': AlertTriangle,
  folder: Folder,
  sparkles: Sparkles,
}

// Fallback if the kinds endpoint is unavailable (e.g. migration 008 not yet run).
const FALLBACK_KINDS: WorkspaceKind[] = [
  { key: 'opportunity', label: 'Opportunity', description: null, color: '#7C3AED', icon: 'target', sort_order: 1 },
  { key: 'account', label: 'Account', description: null, color: '#0F766E', icon: 'building', sort_order: 2 },
  { key: 'issue', label: 'Issue', description: null, color: '#DC2626', icon: 'alert-triangle', sort_order: 3 },
  { key: 'project', label: 'Project', description: null, color: '#2563EB', icon: 'folder', sort_order: 4 },
  { key: 'custom', label: 'Custom', description: null, color: '#64748B', icon: 'sparkles', sort_order: 5 },
]

/** Client mirror of backend defaultWorkspaceTitle — keeps the prefill honest. */
function defaultTitle(source: NoteRecord): string {
  if (source.node_type === 'email') {
    const meta = source.metadata_json as Record<string, unknown> | undefined
    const who = (typeof meta?.from_name === 'string' && meta.from_name) || (typeof meta?.from_email === 'string' && meta.from_email) || ''
    const subject = (typeof meta?.subject === 'string' && meta.subject) || source.title
    return who ? `${who} — ${subject}` : subject
  }
  return source.title
}

interface CreateWorkspaceModalProps {
  open: boolean
  source: NoteRecord | null
  onClose: () => void
  onSubmit: (body: { title: string; workspace_kind: string; color: string; icon: string }) => void
}

export function CreateWorkspaceModal({ open, source, onClose, onSubmit }: CreateWorkspaceModalProps) {
  const [kinds, setKinds] = useState<WorkspaceKind[]>(FALLBACK_KINDS)
  const [title, setTitle] = useState('')
  const [kindKey, setKindKey] = useState('custom')

  useEffect(() => {
    if (!open) return
    setTitle(source ? defaultTitle(source) : '')
    setKindKey('custom')
    let cancelled = false
    void api
      .listWorkspaceKinds()
      .then((r) => {
        if (!cancelled && r.data.length > 0) setKinds(r.data)
      })
      .catch(() => {
        /* keep fallback */
      })
    return () => {
      cancelled = true
    }
  }, [open, source])

  const kind = useMemo(() => kinds.find((k) => k.key === kindKey) ?? kinds[0], [kinds, kindKey])

  if (!open || !source) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/30 pt-28" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Create workspace</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Turn this {source.node_type.replace(/_/g, ' ')} into a workspace. It becomes the anchor — nothing is moved or deleted.
          </p>
        </div>

        <div className="px-5 py-4">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Title</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && title.trim()) {
                onSubmit({ title: title.trim(), workspace_kind: kindKey, color: kind?.color ?? '#64748B', icon: kind?.icon ?? 'sparkles' })
              } else if (e.key === 'Escape') {
                onClose()
              }
            }}
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder="Workspace title"
          />

          <label className="mt-4 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Kind</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {kinds.map((k) => {
              const Icon = ICONS[k.icon] ?? Sparkles
              const active = k.key === kindKey
              return (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setKindKey(k.key)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] font-medium ${
                    active ? 'border-slate-900 bg-slate-50 text-slate-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-md text-white" style={{ backgroundColor: k.color }}>
                    <Icon size={13} />
                  </span>
                  {k.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={!title.trim()}
            onClick={() => onSubmit({ title: title.trim(), workspace_kind: kindKey, color: kind?.color ?? '#64748B', icon: kind?.icon ?? 'sparkles' })}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
          >
            Create workspace
          </button>
        </div>
      </div>
    </div>
  )
}
