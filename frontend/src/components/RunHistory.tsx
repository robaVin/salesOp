import clsx from 'clsx'
import { Clock, AlertTriangle, CheckCircle2, XCircle, Loader } from 'lucide-react'
import type { AutomationRunRecord } from '../types'

function statusStyle(status: AutomationRunRecord['status']) {
  switch (status) {
    case 'success':
      return { icon: <CheckCircle2 size={12} />, color: 'text-emerald-700 bg-emerald-50' }
    case 'needs_review':
      return { icon: <AlertTriangle size={12} />, color: 'text-amber-700 bg-amber-50' }
    case 'failed':
      return { icon: <XCircle size={12} />, color: 'text-red-700 bg-red-50' }
    case 'running':
      return { icon: <Loader size={12} className="animate-spin" />, color: 'text-blue-700 bg-blue-50' }
    case 'skipped':
      return { icon: <Clock size={12} />, color: 'text-slate-700 bg-slate-50' }
  }
}

interface RunHistoryProps {
  runs: AutomationRunRecord[]
  onSelectNote: (noteId: string) => void
}

export function RunHistory({ runs, onSelectNote }: RunHistoryProps) {
  return (
    <div className="pointer-events-auto fixed bottom-4 left-4 z-30 w-80 rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Automation runs
        </span>
        <span className="text-[10px] text-slate-400">{runs.length}</span>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {runs.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-slate-500">
            No runs yet. Press Shift+A → C to fire the Stripe check.
          </p>
        ) : (
          runs.slice(0, 10).map((run) => {
            const s = statusStyle(run.status)
            return (
              <button
                key={run.id}
                type="button"
                onClick={() => {
                  if (run.created_note_id) onSelectNote(run.created_note_id)
                }}
                className="flex w-full items-center gap-2 border-b border-slate-50 px-3 py-2 text-left text-xs hover:bg-slate-50 last:border-b-0"
              >
                <span
                  className={clsx(
                    'flex h-5 w-5 items-center justify-center rounded-full',
                    s.color
                  )}
                >
                  {s.icon}
                </span>
                <div className="flex-1 truncate">
                  <p className="truncate font-medium text-slate-800">{run.routine_key}</p>
                  <p className="truncate text-[10px] text-slate-500">
                    {new Date(run.created_at).toLocaleTimeString()} · {run.trigger_type}
                  </p>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
