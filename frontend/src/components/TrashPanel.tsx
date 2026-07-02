import { RotateCcw, Trash2, X } from 'lucide-react'
import type { NoteRecord } from '../types'
import { TYPE_LABELS } from '../canvas/nodeStyles'

interface TrashPanelProps {
  open: boolean
  notes: NoteRecord[]
  onClose: () => void
  onRestore: (id: string) => void
  onPurge: (note: NoteRecord) => void
}

function deletedAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

/**
 * The persistent Trash bin — a bottom-left corner panel listing soft-deleted
 * nodes. Sits above the Automation runs panel so the two share the corner.
 * Restore brings a node back; Delete forever hard-purges after confirmation.
 */
export function TrashPanel({ open, notes, onClose, onRestore, onPurge }: TrashPanelProps) {
  if (!open) return null
  return (
    <div className="pointer-events-auto fixed bottom-4 left-4 z-40 w-80 rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur"
      style={{ bottom: '20rem' }}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <Trash2 size={12} className="text-slate-400" />
          Trash
          <span className="text-slate-400">{notes.length}</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Close"
        >
          <X size={13} />
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {notes.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-slate-500">
            Trash is empty. Deleted notes land here and can be restored.
          </p>
        ) : (
          notes.map((n) => (
            <div
              key={n.id}
              className="flex items-center gap-2 border-b border-slate-50 px-3 py-2 text-xs last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-800">{n.title || 'Untitled'}</p>
                <p className="truncate text-[10px] text-slate-500">
                  {TYPE_LABELS[n.node_type] ?? n.node_type}
                  {n.deleted_at ? ` · deleted ${deletedAgo(n.deleted_at)}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRestore(n.id)}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                title="Restore to canvas"
              >
                <RotateCcw size={11} />
                Restore
              </button>
              <button
                type="button"
                onClick={() => onPurge(n)}
                className="flex shrink-0 items-center justify-center rounded-lg border border-red-100 p-1.5 text-red-600 hover:bg-red-50"
                title="Delete forever"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
