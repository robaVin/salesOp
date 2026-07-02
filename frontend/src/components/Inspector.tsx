import { useEffect, useState } from 'react'
import clsx from 'clsx'
import type { NoteRecord, NoteStatus } from '../types'
import { STATUS_BADGE, STATUS_LABEL, TYPE_LABELS } from '../canvas/nodeStyles'
import { canCreateWorkspaceFrom } from '../canvas/relations'
import { FolderMinus, FolderPlus, Plus, Trash2, X } from 'lucide-react'

const STATUSES: NoteStatus[] = ['open', 'in_progress', 'resolved', 'dismissed', 'needs_review']

interface InspectorProps {
  note: NoteRecord | null
  workspaces: NoteRecord[]
  onPatch: (id: string, patch: { title?: string; body?: string; status?: NoteStatus }) => void
  onDelete: (id: string) => void
  onDraftEmail: (id: string) => void
  onDraftLinkedIn: (id: string) => void
  onCreateWorkspace: (id: string) => void
  onMoveToWorkspace: (id: string, parentNodeId: string) => void
  onAddNote: (workspaceId: string) => void
  onRemoveFromWorkspace: (id: string) => void
  onClose: () => void
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      title="Close inspector"
      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
    >
      <X size={14} />
    </button>
  )
}

export function Inspector({
  note,
  workspaces,
  onPatch,
  onDelete,
  onDraftEmail,
  onDraftLinkedIn,
  onCreateWorkspace,
  onMoveToWorkspace,
  onAddNote,
  onRemoveFromWorkspace,
  onClose,
}: InspectorProps) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  useEffect(() => {
    if (note) {
      setTitle(note.title)
      setBody(note.body)
    } else {
      setTitle('')
      setBody('')
    }
  }, [note?.id, note?.updated_at, note])

  if (!note) {
    return (
      <aside className="flex h-full w-80 flex-col border-l border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Inspector</h2>
            <CloseButton onClose={onClose} />
          </div>
          <p className="mt-1 text-xs text-slate-500">Select a note to inspect and edit.</p>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-slate-400">
          Click a note on the canvas. Or press <kbd className="mx-1 rounded border border-slate-200 bg-slate-50 px-1 text-[10px]">N</kbd> to make one.
        </div>
      </aside>
    )
  }

  const isDraft = note.node_type === 'email_draft' || note.node_type === 'linkedin_draft'
  const workspaceEligible = canCreateWorkspaceFrom(note)
  const claimedByWorkspace = Boolean(
    note.parent_node_id && workspaces.some((w) => w.id === note.parent_node_id)
  )

  return (
    <aside className="flex h-full w-80 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {TYPE_LABELS[note.node_type]}
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={clsx(
                'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                STATUS_BADGE[note.status]
              )}
            >
              {STATUS_LABEL[note.status]}
            </span>
            <CloseButton onClose={onClose} />
          </div>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title !== note.title) onPatch(note.id, { title })
          }}
          className="mt-2 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Body
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => {
            if (body !== note.body) onPatch(note.id, { body })
          }}
          rows={10}
          className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] leading-relaxed text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />

        <label className="mt-5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Status
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPatch(note.id, { status: s })}
              className={clsx(
                'rounded-lg border px-2 py-1.5 text-[11px] font-medium',
                s === note.status
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {note.tags_json && note.tags_json.length > 0 ? (
          <div className="mt-5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Tags
            </label>
            <div className="mt-2 flex flex-wrap gap-1">
              {note.tags_json.map((t) => (
                <span
                  key={t}
                  className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {!isDraft ? (
          <div className="mt-5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              AI assist
            </label>
            <div className="mt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onDraftEmail(note.id)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Draft email reply
              </button>
              <button
                type="button"
                onClick={() => onDraftLinkedIn(note.id)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Draft LinkedIn reply
              </button>
            </div>
          </div>
        ) : null}

        {note.is_workspace ? (
          <div className="mt-5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Workspace
            </label>
            <div className="mt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onAddNote(note.id)}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                <Plus size={12} />
                Add note to workspace
              </button>
            </div>
          </div>
        ) : null}

        {workspaceEligible ? (
          <div className="mt-5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Workspace
            </label>
            <div className="mt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onCreateWorkspace(note.id)}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                <FolderPlus size={12} />
                Create workspace from this
              </button>
              {workspaces.length > 0 ? (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) onMoveToWorkspace(note.id, e.target.value)
                  }}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-400"
                >
                  <option value="">Move to workspace…</option>
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title}
                    </option>
                  ))}
                </select>
              ) : null}
              {claimedByWorkspace ? (
                <button
                  type="button"
                  onClick={() => onRemoveFromWorkspace(note.id)}
                  className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FolderMinus size={12} />
                  Remove from workspace
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-200 px-5 py-3">
        <button
          type="button"
          onClick={() => onDelete(note.id)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-[11px] font-medium text-red-700 hover:bg-red-50"
        >
          <Trash2 size={12} />
          Delete note
        </button>
      </div>
    </aside>
  )
}
