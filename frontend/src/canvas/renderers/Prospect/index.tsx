import clsx from 'clsx'
import { Activity, Brain, Calendar, ChevronRight, Mail, MessageCircle, Sparkles, UserCircle2 } from 'lucide-react'
import type { NoteRecord } from '../../../types'
import type { NodeRendererSet, RendererContext, RendererProps, DetailRendererProps } from '../types'
import { CardFrame, CreateWorkspaceButton, DetailShell, RemoveFromWorkspaceButton, StatusPill } from '../shared'

function relatedNotes(prospect: NoteRecord, ctx: RendererContext): NoteRecord[] {
  return ctx.allNotes
    .filter((n) => n.source_id === prospect.id)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}

function group(prospect: NoteRecord, ctx: RendererContext) {
  const all = relatedNotes(prospect, ctx)
  return {
    all,
    followups: all.filter((n) => n.node_type === 'followup'),
    objections: all.filter((n) => n.node_type === 'objection'),
    drafts: all.filter((n) => n.node_type === 'email_draft' || n.node_type === 'linkedin_draft'),
    calls: all.filter((n) => n.node_type === 'call_summary'),
  }
}

function lastActivityLabel(notes: NoteRecord[]): string {
  if (notes.length === 0) return 'No activity yet'
  const latest = notes[0]
  const diffMs = Date.now() - new Date(latest.updated_at).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function Compact({ note, selected }: RendererProps) {
  return (
    <CardFrame note={note} selected={selected} size="compact">
      <div className="flex h-full items-center gap-2.5 px-3 py-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700">
          <UserCircle2 size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Prospect</p>
          <p className="truncate text-[13px] font-semibold text-slate-900">{note.title}</p>
        </div>
        <span
          className={`h-2 w-2 rounded-full ${
            note.status === 'in_progress' ? 'bg-amber-500' : note.status === 'needs_review' ? 'bg-red-500' : 'bg-slate-400'
          }`}
        />
      </div>
    </CardFrame>
  )
}

function Preview({ note, selected, ctx }: RendererProps) {
  const g = group(note, ctx)
  return (
    <CardFrame note={note} selected={selected} size="preview">
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <div className="flex items-center gap-1.5">
          <UserCircle2 size={12} className="text-blue-700" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Prospect</span>
        </div>
        <StatusPill status={note.status} />
      </div>
      <div className="px-3 pb-3 pt-1">
        <h3 className="text-[13px] font-semibold leading-snug text-slate-900">{note.title}</h3>
        {note.body ? (
          <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-slate-600">{note.body}</p>
        ) : null}
        <div className="mt-2 flex items-center gap-3 text-[10.5px] text-slate-500">
          <span>
            <Activity size={10} className="inline -mt-0.5" /> {lastActivityLabel(g.all)}
          </span>
          {g.followups.length > 0 ? <span>· {g.followups.length} followup{g.followups.length === 1 ? '' : 's'}</span> : null}
          {g.objections.length > 0 ? <span>· {g.objections.length} objection{g.objections.length === 1 ? '' : 's'}</span> : null}
        </div>
      </div>
    </CardFrame>
  )
}

function TimelineRow({ note, onOpen }: { note: NoteRecord; onOpen?: (id: string) => void }) {
  const icon =
    note.node_type === 'email_draft' || note.node_type === 'linkedin_draft' ? (
      <Mail size={11} />
    ) : note.node_type === 'call_summary' ? (
      <MessageCircle size={11} />
    ) : note.node_type === 'followup' ? (
      <Calendar size={11} />
    ) : (
      <ChevronRight size={11} />
    )
  return (
    <button
      type="button"
      onClick={() => onOpen?.(note.id)}
      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
    >
      <span className="mt-0.5 text-slate-500">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-slate-800">{note.title}</p>
        {note.body ? (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{note.body}</p>
        ) : null}
      </div>
      <span className="ml-2 text-[10px] text-slate-400">{lastActivityLabel([note])}</span>
    </button>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-3.5 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">{label}</p>
      <p className="mt-0.5 text-[18px] font-bold text-slate-900 tabular-nums">{value}</p>
    </div>
  )
}

function Detail({ note, ctx, mode, onPatch, onOpenNode, onCreateWorkspace, onRemoveFromWorkspace }: DetailRendererProps) {
  const g = group(note, ctx)
  const isImmersive = mode === 'immersive'
  return (
    <DetailShell mode={mode}>
      <div className={clsx('mx-auto w-full', isImmersive ? 'max-w-5xl' : 'max-w-4xl')}>
        <div className={clsx('border-b border-blue-100 bg-gradient-to-br from-blue-50/60 via-white to-white', isImmersive ? 'px-10 pb-7 pt-12' : 'px-8 pb-5 pt-8')}>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-700">
              <UserCircle2 size={26} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Prospect</p>
              <h2 className={clsx('font-semibold text-slate-900', isImmersive ? 'text-[28px]' : 'text-[20px]')}>{note.title}</h2>
              <p className="mt-1 text-[12.5px] text-slate-600">
                Last activity {lastActivityLabel(g.all)} · {g.all.length} related note{g.all.length === 1 ? '' : 's'}
              </p>
            </div>
            <StatusPill status={note.status} />
          </div>
          {note.body ? (
            <textarea
              defaultValue={note.body}
              onBlur={(e) => {
                if (e.target.value !== note.body) onPatch?.({ body: e.target.value })
              }}
              rows={3}
              className="mt-4 w-full resize-none border-0 bg-transparent text-[13px] leading-relaxed text-slate-700 outline-none"
              placeholder="Notes about this prospect…"
            />
          ) : null}
          <div className="mt-4 grid grid-cols-4 gap-2.5">
            <Stat label="Followups" value={g.followups.length} />
            <Stat label="Objections" value={g.objections.length} />
            <Stat label="Drafts" value={g.drafts.length} />
            <Stat label="Calls" value={g.calls.length} />
          </div>
        </div>

        <div className={clsx('grid gap-7', isImmersive ? 'px-10 py-8 grid-cols-2' : 'px-8 py-6 grid-cols-2')}>
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <Activity size={11} className="text-slate-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Recent activity</span>
              <span className="text-[10px] text-slate-400">{g.all.length}</span>
            </div>
            {g.all.length === 0 ? (
              <p className="px-2 text-[12px] text-slate-400">
                No activity yet. Drafts, calls, and follow-ups about this prospect show up here.
              </p>
            ) : (
              <div className="space-y-0.5">
                {g.all.slice(0, isImmersive ? 14 : 8).map((n) => (
                  <TimelineRow key={n.id} note={n} onOpen={onOpenNode} />
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <Calendar size={11} className="text-slate-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Open followups</span>
              <span className="text-[10px] text-slate-400">{g.followups.length}</span>
            </div>
            {g.followups.length === 0 ? (
              <p className="px-2 text-[12px] text-slate-400">No followups.</p>
            ) : (
              <div className="space-y-0.5">
                {g.followups.slice(0, 6).map((n) => (
                  <TimelineRow key={n.id} note={n} onOpen={onOpenNode} />
                ))}
              </div>
            )}
            {g.objections.length > 0 ? (
              <div className="mt-6">
                <div className="mb-2 flex items-center gap-1.5">
                  <Brain size={11} className="text-slate-500" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Open objections</span>
                  <span className="text-[10px] text-slate-400">{g.objections.length}</span>
                </div>
                <div className="space-y-0.5">
                  {g.objections.slice(0, 6).map((n) => (
                    <TimelineRow key={n.id} note={n} onOpen={onOpenNode} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className={clsx('rounded-2xl border border-blue-100 bg-blue-50/60', isImmersive ? 'mx-10 mb-10 px-6 py-4' : 'mx-8 mb-6 px-5 py-3.5')}>
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-blue-700" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">Next best action</p>
          </div>
          <p className="mt-1.5 text-[13px] text-slate-700">
            {g.objections.length > 0
              ? 'Handle the open objection above before sending another draft.'
              : g.followups.length > 0
                ? 'Work the open followup; draft a reply if response is overdue.'
                : g.calls.length === 0
                  ? 'Book a discovery call to advance this prospect.'
                  : 'Keep the cadence; check back in 48 hours.'}
          </p>
        </div>

        {onCreateWorkspace || onRemoveFromWorkspace ? (
          <div className={clsx('flex justify-end gap-2 border-t border-slate-100', isImmersive ? 'px-10 py-5' : 'px-8 py-4')}>
            {onRemoveFromWorkspace ? <RemoveFromWorkspaceButton onClick={onRemoveFromWorkspace} /> : null}
            {onCreateWorkspace ? <CreateWorkspaceButton onClick={onCreateWorkspace} /> : null}
          </div>
        ) : null}
      </div>
    </DetailShell>
  )
}

export const Prospect: NodeRendererSet = {
  compact: Compact,
  preview: Preview,
  detail: Detail,
  defaultWidth: 260,
  defaultHeight: 160,
}
