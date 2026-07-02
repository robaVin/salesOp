import clsx from 'clsx'
import {
  Bot,
  ClipboardList,
  Filter,
  Home as HomeIcon,
  Inbox,
  Mail,
  Sun,
  Zap,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { NoteRecord, NoteType } from '../../../types'
import type { NodeRendererSet, RendererProps, DetailRendererProps } from '../types'
import { DetailShell } from '../shared'

/**
 * Zones are Sales Objects rendered as large canvas containers. Same
 * compact/preview/detail semantic-zoom contract as every other renderer.
 * The Zone renderer discriminates on note.node_type to pick a config
 * (title colour, icon, filter chips, which child types to aggregate).
 */

// ---------------------------------------------------------------------------
// Zone config — colour + icon + child types per zone. This is the frontend
// mirror of backend/src/services/layoutStrategy.ts:childTypesForZone. Keeping
// them independent lets the frontend render even if the backend metadata is
// missing, and gives the designer control over visuals without a backend
// deploy.
// ---------------------------------------------------------------------------

type ZoneKey = 'home' | 'email' | 'notes' | 'tasks' | 'automation'

interface ZoneConfig {
  key: ZoneKey
  title: string
  description: string
  icon: ReactNode
  accent: string // Tailwind text/border colour for the header
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
      {
        key: 'briefing',
        label: 'Briefing',
        match: (n) => n.node_type === 'daily_briefing',
      },
      {
        key: 'command',
        label: 'Command centre',
        match: (n) => n.node_type === 'command_center',
      },
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
      {
        key: 'unread',
        label: 'Unread',
        match: (n) => Boolean(readBool(n, 'is_unread')),
      },
      {
        key: 'important',
        label: 'Important',
        match: (n) => Boolean(readBool(n, 'is_important')),
      },
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
      'prospect',
      'account',
      'general_note',
      'call_summary',
      'objection',
      'email_draft',
      'linkedin_draft',
      'capture',
      'screenshot',
      'voice_note',
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
      {
        key: 'in_progress',
        label: 'In progress',
        match: (n) => n.status === 'in_progress',
      },
      {
        key: 'due',
        label: 'Needs review',
        match: (n) => n.status === 'needs_review',
      },
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
      {
        key: 'review',
        label: 'Needs review',
        match: (n) => n.status === 'needs_review',
      },
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

function children(allNotes: NoteRecord[], cfg: ZoneConfig): NoteRecord[] {
  return allNotes.filter((n) => cfg.childTypes.includes(n.node_type))
}

// ---------------------------------------------------------------------------
// Compact — at very zoomed-out level. Big colored container with title + count.
// The canvas viewport fits multiple zones side-by-side at this zoom.
// ---------------------------------------------------------------------------
function Compact({ note, selected, ctx }: RendererProps) {
  const cfg = configFor(note.node_type)
  const count = children(ctx.allNotes, cfg).length
  // The Email zone is the only home its children have (emails are not
  // free-floating canvas nodes), so it shows the inbox even when zoomed out.
  if (cfg.key === 'email') {
    return <Preview note={note} selected={selected} ctx={ctx} />
  }
  return (
    <ZoneShell note={note} selected={selected} cfg={cfg}>
      <div className="flex h-full flex-col">
        <ZoneHeader cfg={cfg} count={count} large />
        <div className="flex flex-1 items-center justify-center opacity-60">
          <p className={clsx('text-[36px] font-black uppercase tracking-widest', cfg.accent)}>
            {cfg.title}
          </p>
        </div>
      </div>
    </ZoneShell>
  )
}

// ---------------------------------------------------------------------------
// Preview — mid-zoom.
//
// Email zone: emails are NOT free-floating canvas nodes — this zone is their
// only home, so it renders the full list as a scrollable grid (`nowheel`
// hands the wheel to the list instead of the canvas zoom).
//
// Other zones: their children are real draggable nodes positioned inside the
// zone bounds, so the zone itself only paints the header/chrome — rendering
// tiles too would duplicate every child underneath the actual nodes.
// ---------------------------------------------------------------------------
function Preview({ note, selected, ctx }: RendererProps) {
  const cfg = configFor(note.node_type)
  const items = children(ctx.allNotes, cfg)
  const [activeFilter, setActiveFilter] = useState<string>('all')

  const isEmail = cfg.key === 'email'
  const filtered = useMemo(() => {
    if (!isEmail) return items
    const chip = cfg.filterChips.find((c) => c.key === activeFilter)
    const matched = chip ? items.filter(chip.match) : items
    // Newest first — it's an inbox.
    return [...matched].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
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

// ---------------------------------------------------------------------------
// Detail — Enter into a zone. Focused/immersive overlay renders like a full
// dashboard: header, filter chips, grid of children.
// ---------------------------------------------------------------------------
function Detail({ note, ctx, mode, onOpenNode }: DetailRendererProps) {
  const cfg = configFor(note.node_type)
  const items = children(ctx.allNotes, cfg)
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
        <div
          className={clsx(
            'border-b',
            cfg.headerBorder,
            cfg.headerBg,
            isImmersive ? 'px-10 pb-6 pt-10' : 'px-8 pb-5 pt-7'
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={clsx(
                'flex items-center justify-center rounded-2xl bg-white/80 ring-1',
                cfg.containerRing,
                isImmersive ? 'h-14 w-14' : 'h-12 w-12',
                cfg.accent
              )}
            >
              {cfg.icon}
            </div>
            <div className="flex-1">
              <p className={clsx('text-[10px] font-semibold uppercase tracking-wider', cfg.accent)}>
                Zone
              </p>
              <h2
                className={clsx(
                  'font-semibold text-slate-900',
                  isImmersive ? 'text-[26px]' : 'text-[20px]'
                )}
              >
                {cfg.title}
              </h2>
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ZoneShell({
  note,
  selected,
  cfg,
  children: kids,
}: {
  note: NoteRecord
  selected: boolean
  cfg: ZoneConfig
  children: ReactNode
}) {
  // Render at the exact size the zone was seeded with, so it fills its
  // allocated slot on the workspace grid.
  const w = note.width || 1800
  const h = note.height || 1000
  return (
    <div
      style={{ width: w, height: h }}
      className={clsx(
        'relative overflow-hidden rounded-3xl ring-2',
        cfg.containerRing,
        cfg.containerBg,
        selected && 'ring-4'
      )}
    >
      {kids}
    </div>
  )
}

function ZoneHeader({ cfg, count, large }: { cfg: ZoneConfig; count: number; large?: boolean }) {
  return (
    <div
      className={clsx(
        'flex items-center justify-between border-b',
        cfg.headerBorder,
        cfg.headerBg,
        large ? 'px-12 py-8' : 'px-8 py-5'
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'flex items-center justify-center rounded-2xl bg-white/80 ring-1 ring-white/50',
            cfg.accent,
            large ? 'h-14 w-14' : 'h-11 w-11'
          )}
        >
          {cfg.icon}
        </div>
        <div>
          <p className={clsx('text-[10px] font-semibold uppercase tracking-wider', cfg.accent)}>
            Zone
          </p>
          <h3
            className={clsx('font-bold text-slate-900', large ? 'text-[26px]' : 'text-[18px]')}
          >
            {cfg.title}
          </h3>
          <p
            className={clsx(
              'mt-0.5 max-w-md truncate text-slate-600',
              large ? 'text-[13px]' : 'text-[11.5px]'
            )}
          >
            {cfg.description}
          </p>
        </div>
      </div>
      <span
        className={clsx(
          'rounded-full bg-white px-3 py-1 font-bold text-slate-900 shadow-sm ring-1 ring-slate-200',
          large ? 'text-[16px]' : 'text-[12px]'
        )}
      >
        {count}
      </span>
    </div>
  )
}

function FilterChips({
  cfg,
  active,
  onChange,
}: {
  cfg: ZoneConfig
  active?: string
  onChange: (key: string) => void
}) {
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
            current === c.key
              ? clsx('bg-white ring-slate-300 text-slate-900', cfg.accent)
              : 'bg-white/60 text-slate-600 ring-slate-200 hover:bg-white'
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
    <div
      className={clsx(
        'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 text-center',
        full ? 'px-6 py-16' : 'mt-4 px-6 py-10'
      )}
    >
      <div className={clsx('flex h-10 w-10 items-center justify-center rounded-full', cfg.accent)}>
        {cfg.icon}
      </div>
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

function ChildTile({
  note,
  onOpen,
  large,
}: {
  note: NoteRecord
  onOpen?: (id: string) => void
  large?: boolean
}) {
  const clickable = Boolean(onOpen)
  const body: ReactNode = (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {note.node_type.replace(/_/g, ' ')}
      </p>
      <p
        className={clsx(
          'mt-1 truncate font-semibold text-slate-900',
          large ? 'text-[14px]' : 'text-[12.5px]'
        )}
      >
        {note.title}
      </p>
      {note.body ? (
        <p
          className={clsx(
            'mt-1 text-slate-600',
            large ? 'line-clamp-3 text-[12px]' : 'line-clamp-2 text-[11px]'
          )}
        >
          {note.body}
        </p>
      ) : null}
    </div>
  )
  const cls = clsx(
    'block w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm',
    clickable && 'transition hover:-translate-y-0.5 hover:shadow-md'
  )
  return clickable ? (
    <button type="button" onClick={() => onOpen!(note.id)} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const Zone: NodeRendererSet = {
  compact: Compact,
  preview: Preview,
  detail: Detail,
  // Defaults — the actual size lives on the row (position + width/height come
  // from canvas_nodes). The renderer reads note.width/note.height for its
  // container size.
  defaultWidth: 1800,
  defaultHeight: 1000,
}
