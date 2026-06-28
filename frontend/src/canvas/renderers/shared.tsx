import clsx from 'clsx'
import type { ReactNode } from 'react'
import type { NoteRecord, NoteStatus } from '../../types'
import { STATUS_BADGE, STATUS_LABEL, TYPE_ACCENT, TYPE_BG, TYPE_LABELS } from '../nodeStyles'

interface CardFrameProps {
  note: NoteRecord
  selected: boolean
  size: 'compact' | 'preview'
  children?: ReactNode
}

const SIZE_CLASS: Record<CardFrameProps['size'], string> = {
  compact: 'w-[240px] min-h-[64px]',
  preview: 'w-[300px] min-h-[130px]',
}

/** Card chrome for in-canvas tiles (compact + preview). */
export function CardFrame({ note, selected, size, children }: CardFrameProps) {
  return (
    <div
      className={clsx(
        'relative rounded-xl border border-slate-200 bg-white shadow-sm border-l-4 transition-shadow',
        TYPE_ACCENT[note.node_type],
        TYPE_BG[note.node_type],
        SIZE_CLASS[size],
        selected && 'ring-2 ring-blue-400 shadow-md'
      )}
    >
      {children}
    </div>
  )
}

/** Outer shell for focused/immersive overlay content. */
export function DetailShell({
  mode,
  children,
}: {
  mode: 'focused' | 'immersive'
  children: ReactNode
}) {
  return (
    <div
      className={clsx(
        'h-full w-full overflow-hidden bg-white text-slate-900',
        mode === 'focused'
          ? 'rounded-2xl border border-slate-200 shadow-2xl'
          : 'rounded-none border-0 shadow-none'
      )}
    >
      <div className="h-full overflow-y-auto">{children}</div>
    </div>
  )
}

export function HeaderRow({ note }: { note: NoteRecord }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {TYPE_LABELS[note.node_type]}
      </span>
      <StatusPill status={note.status} />
    </div>
  )
}

export function StatusPill({ status }: { status: NoteStatus }) {
  return (
    <span
      className={clsx(
        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
        STATUS_BADGE[status]
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

export function TagRow({ tags }: { tags: string[] }) {
  if (!tags || tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 px-3 pb-2.5">
      {tags.slice(0, 6).map((t) => (
        <span
          key={t}
          className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
        >
          {t}
        </span>
      ))}
    </div>
  )
}
