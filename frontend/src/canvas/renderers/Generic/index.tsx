import { useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  ChevronLeft,
  Clock,
  ExternalLink,
  FileText,
  Hash,
  Link2,
  Pencil,
  Trash2,
} from 'lucide-react'
import type { NodeRendererSet, RendererProps, DetailRendererProps } from '../types'
import { CardFrame, DetailShell, StatusPill } from '../shared'
import { STATUS_LABEL, TYPE_LABELS } from '../../nodeStyles'
import type { NoteStatus } from '../../../types'

const STATUSES: NoteStatus[] = ['open', 'in_progress', 'resolved', 'dismissed', 'needs_review']

function statusDot(status: NoteStatus): string {
  if (status === 'resolved') return 'bg-emerald-500'
  if (status === 'needs_review') return 'bg-red-500'
  if (status === 'in_progress') return 'bg-amber-500'
  if (status === 'dismissed') return 'bg-slate-300'
  return 'bg-slate-400'
}

// ---------------------------------------------------------------------------
// COMPACT — far zoom. Type label + title + tiny status dot. Nothing else.
// ---------------------------------------------------------------------------
function Compact({ note, selected }: RendererProps) {
  return (
    <CardFrame note={note} selected={selected} size="compact">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={clsx('h-2 w-2 flex-none rounded-full', statusDot(note.status))} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {TYPE_LABELS[note.node_type]}
          </p>
          <h3 className="truncate text-[13px] font-semibold text-slate-900">{note.title}</h3>
        </div>
      </div>
    </CardFrame>
  )
}

// ---------------------------------------------------------------------------
// PREVIEW — mid zoom. Adds a brief body excerpt and the status pill. Still
// intentionally light — full content lives in Detail.
// ---------------------------------------------------------------------------
function Preview({ note, selected }: RendererProps) {
  return (
    <CardFrame note={note} selected={selected} size="preview">
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {TYPE_LABELS[note.node_type]}
        </span>
        <StatusPill status={note.status} />
      </div>
      <div className="px-3 pb-3 pt-1.5">
        <h3 className="text-[13px] font-semibold leading-snug text-slate-900">{note.title}</h3>
        {note.body ? (
          <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-slate-600">
            {note.body}
          </p>
        ) : null}
      </div>
    </CardFrame>
  )
}

// ---------------------------------------------------------------------------
// DETAIL — focused or immersive overlay. Sectioned "breakdown" view.
// Same shape as DailyBriefing / CommandCenter / Prospect details so every
// node feels consistent when zoomed in.
// ---------------------------------------------------------------------------
function MetaCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <div className="mt-0.5 text-[13px] font-medium text-slate-900 truncate">{value}</div>
    </div>
  )
}

function Detail({ note, mode, onPatch, onExit }: DetailRendererProps) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [editingBody, setEditingBody] = useState(false)
  useEffect(() => {
    setTitle(note.title)
    setBody(note.body)
  }, [note.id, note.updated_at])

  const isImmersive = mode === 'immersive'
  const typeLabel = TYPE_LABELS[note.node_type]
  const meta = (note.metadata_json ?? {}) as Record<string, unknown>
  const sourceUrl = typeof meta.source_url === 'string' ? meta.source_url : null
  const sourceTitle = typeof meta.source_title === 'string' ? meta.source_title : null
  const capturedVia = typeof meta.captured_via === 'string' ? meta.captured_via : null
  const capturedAt =
    typeof meta.captured_at === 'string' ? new Date(meta.captured_at).toLocaleString() : null

  return (
    <DetailShell mode={mode}>
      <div className={clsx('mx-auto w-full', isImmersive ? 'max-w-4xl' : 'max-w-3xl')}>
        {/* HEADER — icon + type label + editable title + status pill */}
        <div
          className={clsx(
            'border-b border-slate-100 bg-gradient-to-br from-slate-50/60 via-white to-white',
            isImmersive ? 'px-10 pb-7 pt-12' : 'px-8 pb-6 pt-8'
          )}
        >
          <div className="flex items-center gap-2">
            {onExit ? (
              <button
                type="button"
                onClick={onExit}
                className="-ml-1 mr-1 rounded-md p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Back to canvas"
              >
                <ChevronLeft size={16} />
              </button>
            ) : null}
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {typeLabel}
            </span>
          </div>
          <div className="mt-3 flex items-start justify-between gap-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (title !== note.title) onPatch?.({ title })
              }}
              className={clsx(
                'w-full min-w-0 flex-1 border-0 bg-transparent font-semibold text-slate-900 outline-none focus:bg-slate-50 focus:px-1 focus:py-0.5 focus:rounded',
                isImmersive ? 'text-[26px]' : 'text-[20px]'
              )}
              placeholder="Untitled"
            />
            <div className="pt-1">
              <StatusPill status={note.status} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Clock size={11} /> Updated {new Date(note.updated_at).toLocaleString()}
            </span>
            {note.tags_json && note.tags_json.length > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Hash size={11} /> {note.tags_json.length} tag
                {note.tags_json.length === 1 ? '' : 's'}
              </span>
            ) : null}
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-700 hover:underline"
              >
                <ExternalLink size={11} /> source
              </a>
            ) : null}
          </div>
        </div>

        {/* BODY — large content section */}
        <div
          className={clsx(
            'border-b border-slate-100',
            isImmersive ? 'px-10 py-7' : 'px-8 py-6'
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Content
            </p>
            <button
              type="button"
              onClick={() => setEditingBody((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold text-slate-500 hover:bg-slate-100"
            >
              <Pencil size={10} /> {editingBody ? 'Done' : 'Edit'}
            </button>
          </div>
          {editingBody ? (
            <textarea
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onBlur={() => {
                if (body !== note.body) onPatch?.({ body })
                setEditingBody(false)
              }}
              rows={isImmersive ? 14 : 10}
              className={clsx(
                'block w-full resize-none rounded-lg border border-slate-200 bg-white p-3 leading-relaxed text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100',
                isImmersive ? 'text-[14px]' : 'text-[13.5px]'
              )}
              placeholder="Notes, context, anything…"
            />
          ) : note.body ? (
            <div
              onClick={() => setEditingBody(true)}
              className={clsx(
                'whitespace-pre-wrap rounded-lg bg-slate-50/60 p-4 leading-relaxed text-slate-800 cursor-text hover:bg-slate-50',
                isImmersive ? 'text-[14px]' : 'text-[13.5px]'
              )}
            >
              {note.body}
            </div>
          ) : (
            <div
              onClick={() => setEditingBody(true)}
              className="cursor-text rounded-lg border border-dashed border-slate-200 p-4 text-[12.5px] italic text-slate-400 hover:bg-slate-50"
            >
              No content yet. Click to add notes.
            </div>
          )}
        </div>

        {/* METADATA — grid of contextual facts */}
        <div className={clsx(isImmersive ? 'px-10 py-7' : 'px-8 py-6')}>
          <div className="mb-3 flex items-center gap-1.5">
            <FileText size={11} className="text-slate-500" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Details
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
            <MetaCell label="Type" value={typeLabel} />
            <MetaCell label="Status" value={STATUS_LABEL[note.status]} />
            <MetaCell
              label="Created"
              value={new Date(note.created_at).toLocaleDateString()}
            />
            {note.tags_json && note.tags_json.length > 0 ? (
              <MetaCell
                label="Tags"
                value={
                  <div className="flex flex-wrap gap-1">
                    {note.tags_json.slice(0, 5).map((t) => (
                      <span
                        key={t}
                        className="rounded-md bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600 ring-1 ring-slate-200"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                }
              />
            ) : null}
            {capturedVia ? (
              <MetaCell
                label="Captured via"
                value={
                  <span className="inline-flex items-center gap-1">
                    <Link2 size={11} className="text-slate-400" /> {capturedVia}
                  </span>
                }
              />
            ) : null}
            {capturedAt ? <MetaCell label="Captured" value={capturedAt} /> : null}
            {sourceTitle ? <MetaCell label="Source" value={sourceTitle} /> : null}
          </div>

          {/* STATUS — change with one click */}
          <div className="mt-7">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Change status
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onPatch?.({ status: s })}
                  className={clsx(
                    'rounded-full border px-3 py-1 text-[11px] font-medium transition',
                    s === note.status
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  )}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {/* FOOTER */}
          <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-4 text-[11px] text-slate-400">
            <span>Press Esc to return to canvas</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-red-100 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
            >
              <Trash2 size={11} />
              Delete (Inspector)
            </button>
          </div>
        </div>
      </div>
    </DetailShell>
  )
}

export const Generic: NodeRendererSet = {
  compact: Compact,
  preview: Preview,
  detail: Detail,
  defaultWidth: 260,
  defaultHeight: 160,
}
