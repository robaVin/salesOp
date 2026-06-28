import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'

interface SummarizeModalProps {
  open: boolean
  busy: boolean
  initialText?: string
  onClose: () => void
  onSubmit: (text: string) => void
}

export function SummarizeModal({ open, busy, initialText, onClose, onSubmit }: SummarizeModalProps) {
  const [text, setText] = useState('')

  useEffect(() => {
    if (open) {
      setText(initialText ?? '')
    }
  }, [open, initialText])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">
              Summarize text into a canvas note
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 pb-4 pt-4">
          <p className="mb-2 text-xs text-slate-500">
            Paste an email, transcript, or note. The model picks a type, drafts a title, and writes
            a short body. You can edit any of it after.
          </p>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste raw text here…"
            rows={10}
            disabled={busy}
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || text.trim().length === 0}
              onClick={() => onSubmit(text.trim())}
              className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {busy ? 'Summarizing…' : 'Create note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
