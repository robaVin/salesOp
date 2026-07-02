import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ChevronDown,
  Command as CommandIcon,
  KeyRound,
  LogOut,
  Plus,
  Search as SearchIcon,
  Settings,
  Sparkles,
  StickyNote,
  Trash2,
  TriangleAlert,
  UserCircle2,
  Zap,
} from 'lucide-react'
import type { StatsResponse } from '../types'
import { useAuth } from '../state/authContext'
import { SourcesToolbar } from './ConnectSourceButton'

interface TopBarProps {
  stats: StatsResponse | null
  trashCount: number
  onSearch: () => void
  onCommandPalette: () => void
  onNewNote: () => void
  onSummarize: () => void
  onStripe: () => void
  onTrash: () => void
}

/** Small dropdown open/close with outside-click dismissal. */
function useDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])
  return { open, setOpen, ref }
}

function MenuKbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
      {children}
    </kbd>
  )
}

/** Primary "Create" action — absorbs the old Summarize + Stripe buttons. */
function CreateMenu({
  onNewNote,
  onSummarize,
  onStripe,
}: {
  onNewNote: () => void
  onSummarize: () => void
  onStripe: () => void
}) {
  const { open, setOpen, ref } = useDropdown()
  const item = (icon: React.ReactNode, label: string, hint: string | null, onClick: () => void) => (
    <button
      type="button"
      onClick={() => {
        setOpen(false)
        onClick()
      }}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
    >
      <span className="text-slate-500">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {hint ? <MenuKbd>{hint}</MenuKbd> : null}
    </button>
  )
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
      >
        <Plus size={14} />
        Create
        <ChevronDown size={13} className="opacity-80" />
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Create</p>
          {item(<StickyNote size={15} />, 'New note', 'N', onNewNote)}
          {item(<Sparkles size={15} />, 'Summarize clipboard', '⌃Q', onSummarize)}
          <div className="my-1 h-px bg-slate-100" />
          {item(<Zap size={15} />, 'Run Stripe check', '⇧A→C', onStripe)}
        </div>
      ) : null}
    </div>
  )
}

/** Consolidated stats — at-risk stays visible on the pill; the rest live here. */
function InsightsMenu({
  stats,
  trashCount,
  onTrash,
}: {
  stats: StatsResponse | null
  trashCount: number
  onTrash: () => void
}) {
  const { open, setOpen, ref } = useDropdown()
  const atRisk = stats?.accounts_needing_attention ?? 0
  const row = (label: string, value: number, danger?: boolean) => (
    <div className="flex items-center justify-between px-2 py-1.5 text-xs">
      <span className={danger ? 'inline-flex items-center gap-1.5 text-red-700' : 'text-slate-600'}>
        {danger ? <TriangleAlert size={13} /> : null}
        {label}
      </span>
      <span className={danger ? 'font-semibold text-red-700' : 'font-medium text-slate-700'}>{value}</span>
    </div>
  )
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs hover:bg-slate-50"
      >
        {atRisk > 0 ? (
          <span className="inline-flex items-center gap-1 font-semibold text-red-700">
            <TriangleAlert size={13} />
            {atRisk}
          </span>
        ) : (
          <Activity size={13} className="text-slate-500" />
        )}
        <span className="text-slate-500">insights</span>
        <ChevronDown size={13} className="text-slate-400" />
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Insights</p>
          {row('Accounts at risk', atRisk, atRisk > 0)}
          {row('Open follow-ups', stats?.open_followups ?? 0)}
          {row('Pending drafts', stats?.pending_drafts ?? 0)}
          {row('Open objections', stats?.open_objections ?? 0)}
          <div className="my-1 h-px bg-slate-100" />
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onTrash()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            <Trash2 size={13} className="text-slate-500" />
            <span className="flex-1 text-left">Open Trash bin</span>
            <span className="tabular-nums text-slate-400">{trashCount}</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()
  const { open, setOpen, ref } = useDropdown()

  if (!user) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="h-5 w-5 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <UserCircle2 size={14} className="text-slate-500" />
        )}
        <span className="hidden max-w-[140px] truncate sm:inline">{user.email}</span>
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="text-xs font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-[11px] text-slate-500">{user.email}</p>
          </div>
          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
          >
            <KeyRound size={12} className="text-slate-500" />
            API tokens
          </Link>
          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
          >
            <Settings size={12} className="text-slate-500" />
            Settings
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              void logout()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
          >
            <LogOut size={12} className="text-slate-500" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function TopBar({
  stats,
  trashCount,
  onSearch,
  onCommandPalette,
  onNewNote,
  onSummarize,
  onStripe,
  onTrash,
}: TopBarProps) {
  return (
    <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
      {/* Brand + workspace */}
      <div className="flex flex-shrink-0 items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950">
          <Activity size={16} className="text-white" />
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">Sales Canvas</p>
          <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 sm:inline">
            Manager view
          </span>
        </div>
      </div>

      {/* Unified search + command launcher */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onSearch}
          className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-500 hover:bg-slate-100"
        >
          <SearchIcon size={15} />
          <span className="flex-1 truncate text-left text-[13px]">Search notes, emails, workspaces</span>
          <MenuKbd>/</MenuKbd>
        </button>
        <button
          type="button"
          onClick={onCommandPalette}
          title="Commands (⌘K)"
          aria-label="Open command palette"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
        >
          <CommandIcon size={15} />
        </button>
      </div>

      {/* Right cluster */}
      <div className="flex flex-shrink-0 items-center gap-2">
        <InsightsMenu stats={stats} trashCount={trashCount} onTrash={onTrash} />
        <CreateMenu onNewNote={onNewNote} onSummarize={onSummarize} onStripe={onStripe} />
        <SourcesToolbar compact />
        <UserMenu />
      </div>
    </header>
  )
}
