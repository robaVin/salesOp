import clsx from 'clsx'
import { AlertTriangle, MessageSquareWarning, Phone, Receipt, ShieldAlert, Zap } from 'lucide-react'
import type { NoteRecord } from '../../../types'
import type { NodeRendererSet, RendererContext, RendererProps, DetailRendererProps } from '../types'
import { CardFrame, DetailShell } from '../shared'

function persona(ctx: RendererContext) {
  const notes = ctx.allNotes
  return {
    hot: notes.filter((n) => n.node_type === 'prospect' && n.status !== 'resolved' && n.status !== 'dismissed'),
    drafts: notes.filter(
      (n) => (n.node_type === 'email_draft' || n.node_type === 'linkedin_draft') && n.status === 'open'
    ),
    objections: notes.filter(
      (n) =>
        n.node_type === 'objection' &&
        (n.status === 'open' || n.status === 'in_progress' || n.status === 'needs_review')
    ),
    atRisk: notes.filter(
      (n) => n.node_type === 'account' && (n.status === 'needs_review' || n.status === 'in_progress')
    ),
    automation: notes.filter((n) => n.node_type === 'automation_result' && n.status === 'needs_review'),
    callsNeedingSummary: notes.filter((n) => n.node_type === 'call_summary' && n.status === 'in_progress'),
  }
}

function Pill({ icon, label, value, tone = 'default' }: { icon: React.ReactNode; label: string; value: number; tone?: 'default' | 'warn' | 'danger' }) {
  const cls =
    tone === 'danger'
      ? 'bg-red-50 text-red-700 ring-red-100'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-800 ring-amber-100'
        : 'bg-slate-50 text-slate-700 ring-slate-100'
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${cls}`}>
      <span className="opacity-70">{icon}</span>
      <span>{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  )
}

function Compact({ note, selected, ctx }: RendererProps) {
  const p = persona(ctx)
  const open = p.hot.length + p.drafts.length + p.objections.length
  return (
    <CardFrame note={note} selected={selected} size="compact">
      <div className="flex h-full items-center gap-3 px-3 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Zap size={18} />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Command center</p>
          <p className="text-[13px] font-semibold text-slate-900">{open} open</p>
        </div>
      </div>
    </CardFrame>
  )
}

function Preview({ note, selected, ctx }: RendererProps) {
  const p = persona(ctx)
  return (
    <CardFrame note={note} selected={selected} size="preview">
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <Zap size={14} className="text-slate-700" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Command center</p>
      </div>
      <div className="px-3 pb-3 pt-1">
        <h3 className="text-[14px] font-semibold text-slate-900">{note.title}</h3>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Pill icon={<Phone size={11} />} label="Hot" value={p.hot.length} />
          <Pill icon={<MessageSquareWarning size={11} />} label="Drafts" value={p.drafts.length} />
          <Pill icon={<AlertTriangle size={11} />} label="Objections" value={p.objections.length} tone="warn" />
        </div>
      </div>
    </CardFrame>
  )
}

function ItemList({ items, empty, onOpen, take = 6 }: { items: NoteRecord[]; empty: string; onOpen?: (id: string) => void; take?: number }) {
  if (items.length === 0) return <p className="px-2 text-[12px] text-slate-400">{empty}</p>
  return (
    <div className="space-y-0.5">
      {items.slice(0, take).map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => onOpen?.(n.id)}
          className="block w-full truncate rounded-md px-2 py-1.5 text-left text-[13px] text-slate-800 hover:bg-slate-50"
        >
          {n.title}
        </button>
      ))}
    </div>
  )
}

function SectionHeader({ icon, title, count, tone = 'default' }: { icon: React.ReactNode; title: string; count: number; tone?: 'default' | 'warn' | 'danger' }) {
  const dot = tone === 'danger' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-slate-500'
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <span className={dot}>{icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</span>
      <span className="text-[10px] text-slate-400">{count}</span>
    </div>
  )
}

function Detail({ note, ctx, mode, onOpenNode }: DetailRendererProps) {
  const p = persona(ctx)
  const isImmersive = mode === 'immersive'
  return (
    <DetailShell mode={mode}>
      <div className={clsx('mx-auto w-full', isImmersive ? 'max-w-5xl' : 'max-w-4xl')}>
        <div className={clsx('border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white', isImmersive ? 'px-10 pb-7 pt-12' : 'px-8 pb-5 pt-8')}>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Zap size={22} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Command center</p>
              <h2 className={clsx('font-semibold text-slate-900', isImmersive ? 'text-[28px]' : 'text-[20px]')}>{note.title}</h2>
              <p className="mt-1 text-[12.5px] text-slate-600">Persona-routed queues. Click any row to fly into that node.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Pill icon={<Phone size={11} />} label="Hot" value={p.hot.length} />
            <Pill icon={<MessageSquareWarning size={11} />} label="Drafts" value={p.drafts.length} />
            <Pill icon={<AlertTriangle size={11} />} label="Objections" value={p.objections.length} tone="warn" />
            <Pill icon={<ShieldAlert size={11} />} label="At risk" value={p.atRisk.length} tone="danger" />
            <Pill icon={<Receipt size={11} />} label="Auto review" value={p.automation.length} />
          </div>
        </div>

        <div className={clsx('grid gap-7', isImmersive ? 'px-10 py-8 grid-cols-2' : 'px-8 py-6 grid-cols-2')}>
          <div>
            <SectionHeader icon={<Phone size={11} />} title="Hot prospects" count={p.hot.length} />
            <ItemList items={p.hot} empty="No active prospects." onOpen={onOpenNode} take={8} />
          </div>
          <div>
            <SectionHeader icon={<MessageSquareWarning size={11} />} title="Drafts awaiting approval" count={p.drafts.length} />
            <ItemList items={p.drafts} empty="No drafts pending." onOpen={onOpenNode} take={8} />
          </div>
          <div>
            <SectionHeader icon={<AlertTriangle size={11} />} title="Open objections" count={p.objections.length} tone="warn" />
            <ItemList items={p.objections} empty="No open objections." onOpen={onOpenNode} take={8} />
          </div>
          <div>
            <SectionHeader icon={<ShieldAlert size={11} />} title="Accounts at risk" count={p.atRisk.length} tone="danger" />
            <ItemList items={p.atRisk} empty="All accounts healthy." onOpen={onOpenNode} take={8} />
          </div>
        </div>
      </div>
    </DetailShell>
  )
}

export const CommandCenter: NodeRendererSet = {
  compact: Compact,
  preview: Preview,
  detail: Detail,
  defaultWidth: 320,
  defaultHeight: 200,
}
