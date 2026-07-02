import clsx from 'clsx'
import {
  AlertTriangle,
  Bot,
  Building2,
  ClipboardList,
  Filter,
  Folder,
  Home as HomeIcon,
  Inbox,
  Mail,
  Pin,
  Plus,
  Sparkles,
  StickyNote,
  Sun,
  Target,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { NoteRecord, NoteType } from '../../../types'
import type { NodeRendererSet, RendererProps, DetailRendererProps } from '../types'
import { DetailShell } from '../shared'
import { TYPE_LABELS } from '../../nodeStyles'
import { anchorOf, childrenOf, isClaimedByWorkspace, isWorkspace, workspaceIdSet } from '../../relations'

/**
 * ContainerRenderer — the single renderer for every "container" node:
 *   • system zones (home/email/notes/tasks/automation) — children by node_type
 *   • user workspaces (node_type='workspace') — children by parent link, with
 *     an anchor object and a dashboard/cover card
 *   • future AI clusters / other containers plug in the same way
 *
 * Zones and workspaces share the semantic-zoom contract (compact/preview/detail)
 * but look deliberately different: zones are large full-bleed regions; a
 * workspace is a compact dashboard "cover" with its own colour + icon.
 */

// ===========================================================================
// System-zone config (unchanged from the previous Zone renderer)
// ===========================================================================

type ZoneKey = 'home' | 'email' | 'notes' | 'tasks' | 'automation'

interface ZoneConfig {
  key: ZoneKey
  title: string
  description: string
  icon: ReactNode
  accent: string
  headerBg: string
  headerBorder: string
  containerRing: string
  containerBg: string
  childTypes: NoteType[]
  filterChips: FilterChip[]
}

interface FilterChip {
  key: string
  label: string
  match: (note: NoteRecord) => boolean
}

const CONFIG_BY_NODE_TYPE: Record<string, ZoneConfig> = {
  home_zone: {
    key: 'home',
    title: 'Home',
    description: 'Your daily anchor. Today, priorities, hot signals.',
    icon: <Sun size={18} />,
    accent: 'text-amber-800',
    headerBg: 'bg-gradient-to-r from-amber-50 via-white to-white',
    headerBorder: 'border-amber-200',
    containerRing: 'ring-amber-200/70',
    containerBg: 'bg-amber-50/40',
    childTypes: ['daily_briefing', 'command_center', 'ai_assistant'],
    filterChips: [
      { key: 'all', label: 'All', match: () => true },
      { key: 'briefing', label: 'Briefing', match: (n) => n.node_type === 'daily_briefing' },
      { key: 'command', label: 'Command centre', match: (n) => n.node_type === 'command_center' },
    ],
  },
  email_zone: {
    key: 'email',
    title: 'Email',
    description: 'Every message that matters — synced from your inboxes.',
    icon: <Mail size={18} />,
    accent: 'text-yellow-800',
    headerBg: 'bg-gradient-to-r from-yellow-50 via-white to-white',
    headerBorder: 'border-yellow-200',
    containerRing: 'ring-yellow-200/70',
    containerBg: 'bg-yellow-50/40',
    childTypes: ['email'],
    filterChips: [
      { key: 'all', label: 'All', match: () => true },
      { key: 'unread', label: 'Unread', match: (n) => Boolean(readBool(n, 'is_unread')) },
      { key: 'important', label: 'Important', match: (n) => Boolean(readBool(n, 'is_important')) },
    ],
  },
  notes_zone: {
    key: 'notes',
    title: 'Notes',
    description: 'Prospects, accounts, objections, drafts, captures.',
    icon: <Inbox size={18} />,
    accent: 'text-blue-800',
    headerBg: 'bg-gradient-to-r from-blue-50 via-white to-white',
    headerBorder: 'border-blue-200',
    containerRing: 'ring-blue-200/70',
    containerBg: 'bg-blue-50/40',
    childTypes: [
      'prospect', 'account', 'general_note', 'call_summary', 'objection',
      'email_draft', 'linkedin_draft', 'capture', 'screenshot', 'voice_note',
    ],
    filterChips: [
      { key: 'all', label: 'All', match: () => true },
      { key: 'prospects', label: 'Prospects', match: (n) => n.node_type === 'prospect' },
      { key: 'accounts', label: 'Accounts', match: (n) => n.node_type === 'account' },
      {
        key: 'drafts',
        label: 'Drafts',
        match: (n) => n.node_type === 'email_draft' || n.node_type === 'linkedin_draft',
      },
      { key: 'objections', label: 'Objections', match: (n) => n.node_type === 'objection' },
    ],
  },
  tasks_zone: {
    key: 'tasks',
    title: 'Tasks',
    description: 'What you owe someone. What someone owes you. Meetings.',
    icon: <ClipboardList size={18} />,
    accent: 'text-emerald-800',
    headerBg: 'bg-gradient-to-r from-emerald-50 via-white to-white',
    headerBorder: 'border-emerald-200',
    containerRing: 'ring-emerald-200/70',
    containerBg: 'bg-emerald-50/40',
    childTypes: ['task', 'followup', 'meeting'],
    filterChips: [
      { key: 'all', label: 'All', match: () => true },
      { key: 'open', label: 'Open', match: (n) => n.status === 'open' },
      { key: 'in_progress', label: 'In progress', match: (n) => n.status === 'in_progress' },
      { key: 'due', label: 'Needs review', match: (n) => n.status === 'needs_review' },
    ],
  },
  automation_zone: {
    key: 'automation',
    title: 'Automations',
    description: 'Routines you run. Results, alerts, needs-review.',
    icon: <Zap size={18} />,
    accent: 'text-fuchsia-800',
    headerBg: 'bg-gradient-to-r from-fuchsia-50 via-white to-white',
    headerBorder: 'border-fuchsia-200',
    containerRing: 'ring-fuchsia-200/70',
    containerBg: 'bg-fuchsia-50/40',
    childTypes: ['automation_result', 'stripe', 'automation_hub'],
    filterChips: [
      { key: 'all', label: 'All', match: () => true },
      { key: 'runs', label: 'Runs', match: (n) => n.node_type === 'automation_result' },
      { key: 'stripe', label: 'Stripe', match: (n) => n.node_type === 'stripe' },
      { key: 'review', label: 'Needs review', match: (n) => n.status === 'needs_review' },
    ],
  },
}

function readBool(n: NoteRecord, key: string): boolean {
  const meta = n.metadata_json as Record<string, unknown> | undefined
  return meta != null && meta[key] === true
}

function configFor(nodeType: string): ZoneConfig {
  return CONFIG_BY_NODE_TYPE[nodeType] ?? CONFIG_BY_NODE_TYPE['notes_zone']
}

function zoneChildren(allNotes: NoteRecord[], cfg: ZoneConfig): NoteRecord[] {
  // A node claimed by a user workspace leaves its system zone — it belongs to
  // exactly one container at a time. Emails are the exception: they always stay
  // listed in the Email zone (their inbox) even when also linked to a workspace.
  const wsIds = workspaceIdSet(allNotes)
  return allNotes.filter(
    (n) =>
      cfg.childTypes.includes(n.node_type) &&
      (n.node_type === 'email' || !isClaimedByWorkspace(n, wsIds))
  )
}

// ===========================================================================
// Workspace visuals (cover card + dashboard detail)
// ===========================================================================

const WORKSPACE_ICONS: Record<string, LucideIcon> = {
  target: Target,
  building: Building2,
  'alert-triangle': AlertTriangle,
  folder: Folder,
  sparkles: Sparkles,
  bot: Bot,
}

function workspaceIcon(note: NoteRecord): LucideIcon {
  return WORKSPACE_ICONS[note.workspace_icon ?? ''] ?? Sparkles
}

function workspaceColor(note: NoteRecord): string {
  return note.workspace_color || '#64748b'
}

function promotedFromLabel(note: NoteRecord, anchor: NoteRecord | null): string {
  const meta = note.metadata_json as Record<string, unknown> | undefined
  const t = typeof meta?.promoted_from_type === 'string' ? (meta.promoted_from_type as NoteType) : anchor?.node_type
  return t ? (TYPE_LABELS[t as NoteType] ?? String(t)) : 'object'
}

function isTaskish(n: NoteRecord): boolean {
  return n.node_type === 'task' || n.node_type === 'followup' || n.node_type === 'meeting'
}

function WorkspaceCover({ note, selected, ctx }: RendererProps) {
  const color = workspaceColor(note)
  const Icon = workspaceIcon(note)
  const kids = childrenOf(ctx.allNotes, note.id)
  const anchor = anchorOf(ctx.allNotes, note)
  const emails = kids.filter((n) => n.node_type === 'email').length
  const tasks = kids.filter(isTaskish).length
  const notesCount = kids.length - emails - tasks
  const kindLabel = note.workspace_kind ? note.workspace_kind[0].toUpperCase() + note.workspace_kind.slice(1) : 'Custom'

  return (
    <div
      style={{ width: note.width || 380, height: note.height || 260 }}
      className={clsx(
        'relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm',
        selected ? 'ring-2 ring-offset-1' : ''
      )}
    >
      {/* Colour cover band */}
      <div className="relative px-4 pb-3 pt-3.5" style={{ backgroundColor: `${color}14`, borderBottom: `1px solid ${color}26` }}>
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: color }}
          >
            <Icon size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>
              {kindLabel} workspace
            </p>
            <h3 className="truncate text-[15px] font-semibold text-slate-900">{note.title}</h3>
          </div>
        </div>
      </div>

      {/* Body: created-from + anchor + counts */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 py-3">
        <p className="text-[11px] text-slate-500">
          Created from <span className="font-medium text-slate-700">{promotedFromLabel(note, anchor)}</span>
        </p>
        {anchor ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5">
            <Pin size={12} className="shrink-0 text-slate-400" />
            <span className="truncate text-[12px] font-medium text-slate-800">{anchor.title}</span>
          </div>
        ) : null}
        <div className="mt-auto flex items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1"><Mail size={12} />{emails}</span>
          <span className="inline-flex items-center gap-1"><StickyNote size={12} />{notesCount}</span>
          <span className="inline-flex items-center gap-1"><ClipboardList size={12} />{tasks}</span>
          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
            {kids.length} object{kids.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  )
}

function RelatedSection({
  title,
  icon,
  items,
  onOpen,
}: {
  title: string
  icon: ReactNode
  items: NoteRecord[]
  onOpen?: (id: string) => void
}) {
  if (items.length === 0) return null
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-slate-500">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</span>
        <span className="text-[10px] text-slate-400">{items.length}</span>
      </div>
      <div className="space-y-1">
        {items.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onOpen?.(n.id)}
            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50"
          >
            <span className="truncate text-[12.5px] font-medium text-slate-800">{n.title}</span>
            <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-slate-400">
              {TYPE_LABELS[n.node_type] ?? n.node_type}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function WorkspaceDetail({ note, ctx, mode, onOpenNode, onAddNote }: DetailRendererProps) {
  const color = workspaceColor(note)
  const Icon = workspaceIcon(note)
  const isImmersive = mode === 'immersive'
  const kids = childrenOf(ctx.allNotes, note.id)
  const anchor = anchorOf(ctx.allNotes, note)
  const related = kids.filter((n) => n.id !== anchor?.id)
  const emails = related.filter((n) => n.node_type === 'email')
  const tasks = related.filter(isTaskish)
  const notesRest = related.filter((n) => n.node_type !== 'email' && !isTaskish(n))

  return (
    <DetailShell mode={mode}>
      <div className={clsx('mx-auto w-full', isImmersive ? 'max-w-4xl' : 'max-w-3xl')}>
        <div className={clsx('border-b', isImmersive ? 'px-10 pb-6 pt-10' : 'px-8 pb-5 pt-7')} style={{ backgroundColor: `${color}0F`, borderColor: `${color}26` }}>
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center rounded-2xl text-white" style={{ backgroundColor: color, height: isImmersive ? 56 : 48, width: isImmersive ? 56 : 48 }}>
              <Icon size={isImmersive ? 26 : 22} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>
                {(note.workspace_kind ?? 'custom')} workspace
              </p>
              <h2 className={clsx('font-semibold text-slate-900', isImmersive ? 'text-[26px]' : 'text-[20px]')}>
                {note.title}
              </h2>
              <p className="mt-1 text-[12.5px] text-slate-600">
                Created from {promotedFromLabel(note, anchor)}
                {anchor ? <span className="text-slate-400"> · {anchor.title}</span> : null}
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-[12px] font-bold text-slate-900 shadow-sm ring-1 ring-slate-200">
              {kids.length}
            </span>
          </div>
        </div>

        <div className={clsx(isImmersive ? 'px-10 py-8' : 'px-8 py-6')}>
          {anchor ? (
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-1.5">
                <Pin size={12} style={{ color }} />
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>Anchor object</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenNode?.(anchor.id)}
                className="flex w-full items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left hover:bg-slate-50"
                style={{ borderColor: `${color}40` }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-slate-900">{anchor.title}</p>
                  {anchor.body ? <p className="mt-0.5 line-clamp-1 text-[11.5px] text-slate-500">{anchor.body}</p> : null}
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-400">
                  {TYPE_LABELS[anchor.node_type] ?? anchor.node_type}
                </span>
              </button>
            </div>
          ) : null}

          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Related objects
            </span>
            {onAddNote ? (
              <button
                type="button"
                onClick={onAddNote}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                <Plus size={12} />
                Add note
              </button>
            ) : null}
          </div>

          {related.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center">
              <p className="text-[13px] font-semibold text-slate-900">No related objects yet</p>
              <p className="mx-auto mt-1 max-w-md text-[11.5px] text-slate-500">
                Add a note, or use "Move to Workspace" from any note, email, or task to gather related work here.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <RelatedSection title="Related emails" icon={<Mail size={11} />} items={emails} onOpen={onOpenNode} />
              <RelatedSection title="Related notes" icon={<StickyNote size={11} />} items={notesRest} onOpen={onOpenNode} />
              <RelatedSection title="Related tasks" icon={<ClipboardList size={11} />} items={tasks} onOpen={onOpenNode} />
            </div>
          )}

          {/* Timeline placeholder — real activity feed is a future feature. */}
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/60 px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Activity timeline</p>
            <p className="mt-1 text-[12px] text-slate-500">A per-workspace timeline lands in a future update.</p>
          </div>
        </div>
      </div>
    </DetailShell>
  )
}

// ===========================================================================
// Zone visuals (unchanged behaviour, moved verbatim)
// ===========================================================================

function ZoneCompact({ note, selected, ctx }: RendererProps) {
  const cfg = configFor(note.node_type)
  const count = zoneChildren(ctx.allNotes, cfg).length
  if (cfg.key === 'email') return <ZonePreview note={note} selected={selected} ctx={ctx} />
  return (
    <ZoneShell note={note} selected={selected} cfg={cfg}>
      <div className="flex h-full flex-col">
        <ZoneHeader cfg={cfg} count={count} large />
        <div className="flex flex-1 items-center justify-center opacity-60">
          <p className={clsx('text-[36px] font-black uppercase tracking-widest', cfg.accent)}>{cfg.title}</p>
        </div>
      </div>
    </ZoneShell>
  )
}

function ZonePreview({ note, selected, ctx }: RendererProps) {
  const cfg = configFor(note.node_type)
  const items = zoneChildren(ctx.allNotes, cfg)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const isEmail = cfg.key === 'email'
  const filtered = useMemo(() => {
    if (!isEmail) return items
    const chip = cfg.filterChips.find((c) => c.key === activeFilter)
    const matched = chip ? items.filter(chip.match) : items
    return [...matched].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [isEmail, items, cfg.filterChips, activeFilter])

  return (
    <ZoneShell note={note} selected={selected} cfg={cfg}>
      <div className="flex h-full flex-col">
        <ZoneHeader cfg={cfg} count={items.length} />
        <div className="flex min-h-0 flex-1 flex-col px-8 pb-6 pt-2">
          <FilterChips cfg={cfg} active={activeFilter} onChange={setActiveFilter} />
          {items.length === 0 ? (
            <EmptyState cfg={cfg} />
          ) : isEmail ? (
            <div className="nowheel mt-4 min-h-0 flex-1 overflow-y-auto pr-2">
              <div className="grid grid-cols-4 gap-3 pb-4">
                {filtered.map((n) => (
                  <ChildTile key={n.id} note={n} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </ZoneShell>
  )
}

function ZoneDetail({ note, ctx, mode, onOpenNode }: DetailRendererProps) {
  const cfg = configFor(note.node_type)
  const items = zoneChildren(ctx.allNotes, cfg)
  const isImmersive = mode === 'immersive'
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const filtered = useMemo(() => {
    const chip = cfg.filterChips.find((c) => c.key === activeFilter)
    if (!chip) return items
    return items.filter(chip.match)
  }, [items, cfg.filterChips, activeFilter])

  return (
    <DetailShell mode={mode}>
      <div className={clsx('mx-auto w-full', isImmersive ? 'max-w-5xl' : 'max-w-4xl')}>
        <div className={clsx('border-b', cfg.headerBorder, cfg.headerBg, isImmersive ? 'px-10 pb-6 pt-10' : 'px-8 pb-5 pt-7')}>
          <div className="flex items-start gap-3">
            <div className={clsx('flex items-center justify-center rounded-2xl bg-white/80 ring-1', cfg.containerRing, isImmersive ? 'h-14 w-14' : 'h-12 w-12', cfg.accent)}>
              {cfg.icon}
            </div>
            <div className="flex-1">
              <p className={clsx('text-[10px] font-semibold uppercase tracking-wider', cfg.accent)}>Zone</p>
              <h2 className={clsx('font-semibold text-slate-900', isImmersive ? 'text-[26px]' : 'text-[20px]')}>{cfg.title}</h2>
              <p className="mt-1 text-[12.5px] text-slate-600">{cfg.description}</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-[12px] font-bold text-slate-900 shadow-sm ring-1 ring-slate-200">
              {items.length}
            </span>
          </div>
          <div className="mt-4">
            <FilterChips cfg={cfg} active={activeFilter} onChange={setActiveFilter} />
          </div>
        </div>
        <div className={clsx(isImmersive ? 'px-10 py-8' : 'px-8 py-6')}>
          {filtered.length === 0 ? (
            <EmptyState cfg={cfg} full />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((n) => (
                <ChildTile key={n.id} note={n} onOpen={onOpenNode} large />
              ))}
            </div>
          )}
        </div>
      </div>
    </DetailShell>
  )
}

function ZoneShell({ note, selected, cfg, children: kids }: { note: NoteRecord; selected: boolean; cfg: ZoneConfig; children: ReactNode }) {
  const w = note.width || 1800
  const h = note.height || 1000
  return (
    <div style={{ width: w, height: h }} className={clsx('relative overflow-hidden rounded-3xl ring-2', cfg.containerRing, cfg.containerBg, selected && 'ring-4')}>
      {kids}
    </div>
  )
}

function ZoneHeader({ cfg, count, large }: { cfg: ZoneConfig; count: number; large?: boolean }) {
  return (
    <div className={clsx('flex items-center justify-between border-b', cfg.headerBorder, cfg.headerBg, large ? 'px-12 py-8' : 'px-8 py-5')}>
      <div className="flex items-center gap-3">
        <div className={clsx('flex items-center justify-center rounded-2xl bg-white/80 ring-1 ring-white/50', cfg.accent, large ? 'h-14 w-14' : 'h-11 w-11')}>
          {cfg.icon}
        </div>
        <div>
          <p className={clsx('text-[10px] font-semibold uppercase tracking-wider', cfg.accent)}>Zone</p>
          <h3 className={clsx('font-bold text-slate-900', large ? 'text-[26px]' : 'text-[18px]')}>{cfg.title}</h3>
          <p className={clsx('mt-0.5 max-w-md truncate text-slate-600', large ? 'text-[13px]' : 'text-[11.5px]')}>{cfg.description}</p>
        </div>
      </div>
      <span className={clsx('rounded-full bg-white px-3 py-1 font-bold text-slate-900 shadow-sm ring-1 ring-slate-200', large ? 'text-[16px]' : 'text-[12px]')}>
        {count}
      </span>
    </div>
  )
}

function FilterChips({ cfg, active, onChange }: { cfg: ZoneConfig; active?: string; onChange: (key: string) => void }) {
  const current = active ?? 'all'
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Filter size={11} className="text-slate-400" />
      {cfg.filterChips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onChange(c.key)
          }}
          className={clsx(
            'rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition',
            current === c.key ? clsx('bg-white ring-slate-300 text-slate-900', cfg.accent) : 'bg-white/60 text-slate-600 ring-slate-200 hover:bg-white'
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ cfg, full }: { cfg: ZoneConfig; full?: boolean }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 text-center', full ? 'px-6 py-16' : 'mt-4 px-6 py-10')}>
      <div className={clsx('flex h-10 w-10 items-center justify-center rounded-full', cfg.accent)}>{cfg.icon}</div>
      <p className="mt-3 text-[13px] font-semibold text-slate-900">Nothing here yet</p>
      <p className="mt-1 max-w-md text-[11.5px] text-slate-500">
        {cfg.key === 'email'
          ? 'Connect Gmail from the top bar and hit Sync — emails will land in this zone.'
          : cfg.key === 'automation'
            ? 'Press Shift+A → C to fire the Stripe check. Results appear here.'
            : cfg.key === 'tasks'
              ? 'Add a task or follow-up. They will collect here so you can work them Friday.'
              : cfg.key === 'home'
                ? 'Home nodes seed at signup. If this is empty, something went wrong — try re-running the starter seed.'
                : 'Press N to create a note, paste text on the canvas to summarize, or capture from any tab.'}
      </p>
    </div>
  )
}

function ChildTile({ note, onOpen, large }: { note: NoteRecord; onOpen?: (id: string) => void; large?: boolean }) {
  const clickable = Boolean(onOpen)
  const body: ReactNode = (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{note.node_type.replace(/_/g, ' ')}</p>
      <p className={clsx('mt-1 truncate font-semibold text-slate-900', large ? 'text-[14px]' : 'text-[12.5px]')}>{note.title}</p>
      {note.body ? <p className={clsx('mt-1 text-slate-600', large ? 'line-clamp-3 text-[12px]' : 'line-clamp-2 text-[11px]')}>{note.body}</p> : null}
    </div>
  )
  const cls = clsx('block w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm', clickable && 'transition hover:-translate-y-0.5 hover:shadow-md')
  return clickable ? (
    <button type="button" onClick={() => onOpen!(note.id)} className={cls}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

// ===========================================================================
// Top-level dispatch: workspace vs system zone
// ===========================================================================

function Compact(props: RendererProps) {
  return isWorkspace(props.note) ? <WorkspaceCover {...props} /> : <ZoneCompact {...props} />
}
function Preview(props: RendererProps) {
  return isWorkspace(props.note) ? <WorkspaceCover {...props} /> : <ZonePreview {...props} />
}
function Detail(props: DetailRendererProps) {
  return isWorkspace(props.note) ? <WorkspaceDetail {...props} /> : <ZoneDetail {...props} />
}

// Silence unused import (kept for future container kinds using a home glyph).
void HomeIcon

export const Container: NodeRendererSet = {
  compact: Compact,
  preview: Preview,
  detail: Detail,
  defaultWidth: 380,
  defaultHeight: 260,
}
