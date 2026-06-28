import clsx from 'clsx'
import { CheckCircle2, ClipboardList, Inbox, Lightbulb, Phone, Sparkles, Sun } from 'lucide-react'
import type { NoteRecord, NoteType } from '../../../types'
import type { NodeRendererSet, RendererContext, RendererProps, DetailRendererProps } from '../types'
import { CardFrame, DetailShell } from '../shared'

function pickDueFollowups(notes: NoteRecord[]) {
  return notes
    .filter(
      (n) =>
        n.node_type === 'followup' &&
        (n.status === 'open' || n.status === 'in_progress' || n.status === 'needs_review')
    )
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}
function pickHotProspects(notes: NoteRecord[]) {
  return notes
    .filter((n) => n.node_type === 'prospect' && n.status !== 'resolved' && n.status !== 'dismissed')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8)
}
function pickRecentCaptures(notes: NoteRecord[]) {
  return notes
    .filter((n) => {
      const m = n.metadata_json as Record<string, unknown> | undefined
      return Boolean(m && m.captured === true) && n.status === 'open'
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8)
}
function pickUnresolved(notes: NoteRecord[]) {
  return notes
    .filter(
      (n) => n.status === 'needs_review' && n.node_type !== 'daily_briefing' && n.node_type !== 'command_center'
    )
    .slice(0, 8)
}

function counts(ctx: RendererContext) {
  return {
    due: pickDueFollowups(ctx.allNotes).length,
    captures: pickRecentCaptures(ctx.allNotes).length,
    unresolved: pickUnresolved(ctx.allNotes).length,
    hot: pickHotProspects(ctx.allNotes).length,
  }
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-amber-200">
      <span className="text-amber-600">{icon}</span>
      <span className="text-slate-600">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  )
}

const TYPE_DOT: Partial<Record<NoteType, string>> = {
  prospect: 'bg-blue-500',
  account: 'bg-emerald-500',
  followup: 'bg-amber-500',
  objection: 'bg-red-500',
  call_summary: 'bg-purple-500',
  email_draft: 'bg-sky-500',
  linkedin_draft: 'bg-indigo-500',
  capture: 'bg-fuchsia-500',
}

function Compact({ note, selected, ctx }: RendererProps) {
  const c = counts(ctx)
  return (
    <CardFrame note={note} selected={selected} size="compact">
      <div className="flex h-full items-center gap-3 px-3 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-200 text-amber-900">
          <Sun size={18} />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Home · Today</p>
          <p className="text-[13px] font-semibold text-slate-900">
            {c.due + c.unresolved} need{c.due + c.unresolved === 1 ? 's' : ''} attention
          </p>
        </div>
      </div>
    </CardFrame>
  )
}

function Preview({ note, selected, ctx }: RendererProps) {
  const c = counts(ctx)
  return (
    <CardFrame note={note} selected={selected} size="preview">
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <Sun size={14} className="text-amber-600" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Today</p>
      </div>
      <div className="px-3 pb-3 pt-1">
        <h3 className="text-[14px] font-semibold text-slate-900">{note.title}</h3>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Stat icon={<ClipboardList size={12} />} label="Due" value={c.due} />
          <Stat icon={<Inbox size={12} />} label="Inbox" value={c.captures} />
          <Stat icon={<CheckCircle2 size={12} />} label="Review" value={c.unresolved} />
        </div>
      </div>
    </CardFrame>
  )
}

function NoteRow({ note, onOpen }: { note: NoteRecord; onOpen?: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(note.id)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
    >
      <span
        className={`h-1.5 w-1.5 flex-none rounded-full ${TYPE_DOT[note.node_type] ?? 'bg-slate-400'}`}
      />
      <span className="truncate text-[13px] text-slate-800">{note.title}</span>
    </button>
  )
}

function Section({
  title,
  icon,
  items,
  empty,
  onOpen,
  take = 8,
}: {
  title: string
  icon: React.ReactNode
  items: NoteRecord[]
  empty: string
  onOpen?: (id: string) => void
  take?: number
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-slate-500">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</span>
        <span className="text-[10px] text-slate-400">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-2 text-[12px] text-slate-400">{empty}</p>
      ) : (
        <div className="space-y-0.5">
          {items.slice(0, take).map((n) => (
            <NoteRow key={n.id} note={n} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  )
}

function Detail({ note, ctx, mode, onOpenNode }: DetailRendererProps) {
  const due = pickDueFollowups(ctx.allNotes)
  const captures = pickRecentCaptures(ctx.allNotes)
  const hot = pickHotProspects(ctx.allNotes)
  const unresolved = pickUnresolved(ctx.allNotes)
  const c = counts(ctx)
  const isImmersive = mode === 'immersive'

  return (
    <DetailShell mode={mode}>
      <div className={clsx('mx-auto w-full', isImmersive ? 'max-w-5xl' : 'max-w-4xl')}>
        <div
          className={clsx(
            'border-b border-amber-100 bg-gradient-to-br from-amber-50/80 via-white to-white',
            isImmersive ? 'px-10 pb-7 pt-12' : 'px-8 pb-5 pt-8'
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-200 text-amber-900">
              <Sun size={22} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Home · Today</p>
              <h2
                className={clsx(
                  'font-semibold text-slate-900',
                  isImmersive ? 'text-[28px]' : 'text-[20px]'
                )}
              >
                {note.title}
              </h2>
              <p className="mt-1 text-[12.5px] text-slate-600">
                {c.due + c.unresolved + c.captures} item{c.due + c.unresolved + c.captures === 1 ? '' : 's'} across due, captures, and review.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Stat icon={<ClipboardList size={12} />} label="Due" value={c.due} />
            <Stat icon={<Inbox size={12} />} label="Inbox" value={c.captures} />
            <Stat icon={<CheckCircle2 size={12} />} label="Review" value={c.unresolved} />
            <Stat icon={<Phone size={12} />} label="Hot prospects" value={c.hot} />
          </div>
        </div>

        <div className={clsx('grid gap-7', isImmersive ? 'px-10 py-8 grid-cols-2' : 'px-8 py-6 grid-cols-2')}>
          <Section title="Followups due" icon={<ClipboardList size={11} />} items={due} empty="Nothing due." onOpen={onOpenNode} />
          <Section title="Hot prospects" icon={<Phone size={11} />} items={hot} empty="No active prospects." onOpen={onOpenNode} />
          <Section title="Recent captures" icon={<Inbox size={11} />} items={captures} empty="Inbox is empty." onOpen={onOpenNode} />
          <Section title="Needs review" icon={<CheckCircle2 size={11} />} items={unresolved} empty="Nothing waiting." onOpen={onOpenNode} />
        </div>

        <div className={clsx('rounded-2xl border border-amber-200 bg-amber-50/60', isImmersive ? 'mx-10 mb-10 px-6 py-4' : 'mx-8 mb-6 px-5 py-3.5')}>
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-amber-700" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">What am I forgetting today?</p>
          </div>
          <p className="mt-1.5 text-[13px] text-slate-700">
            Ask the AI assistant — it has full workspace memory. (Phase 5 ships the assistant node.)
          </p>
        </div>

        <div className={clsx('flex flex-wrap items-center gap-2 border-t border-slate-100 text-[11px] text-slate-500', isImmersive ? 'px-10 py-5' : 'px-8 py-4')}>
          <Lightbulb size={12} className="text-slate-400" />
          Press <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-[10px]">Esc</kbd> to leave ·
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-[10px]">H</kbd> to return here from any node ·
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-[10px]">Enter</kbd> while focused goes immersive.
        </div>
      </div>
    </DetailShell>
  )
}

export const DailyBriefing: NodeRendererSet = {
  compact: Compact,
  preview: Preview,
  detail: Detail,
  defaultWidth: 320,
  defaultHeight: 200,
}
