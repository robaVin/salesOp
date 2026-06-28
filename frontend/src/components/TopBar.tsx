import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ClipboardList,
  KeyRound,
  LogOut,
  MessageSquareWarning,
  Receipt,
  Settings,
  TriangleAlert,
  UserCircle2,
} from 'lucide-react'
import type { StatsResponse } from '../types'
import { useAuth } from '../state/authContext'

interface TopBarProps {
  stats: StatsResponse | null
  onCommandPalette: () => void
  onSummarize: () => void
  onStripe: () => void
}

function StatPill({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string
  value: number
  icon: React.ReactNode
  tone?: 'default' | 'warning' | 'danger'
}) {
  const toneCls =
    tone === 'danger'
      ? 'text-red-700 bg-red-50 border-red-100'
      : tone === 'warning'
        ? 'text-amber-700 bg-amber-50 border-amber-100'
        : 'text-slate-700 bg-white border-slate-200'
  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${toneCls}`}>
      <span className="text-slate-500">{icon}</span>
      <span className="font-medium">{label}</span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </div>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()
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

  if (!user) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt=""
            className="h-5 w-5 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <UserCircle2 size={14} className="text-slate-500" />
        )}
        <span className="hidden max-w-[160px] truncate sm:inline">{user.email}</span>
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

export function TopBar({ stats, onCommandPalette, onSummarize, onStripe }: TopBarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950">
          <Activity size={16} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Sales Canvas</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Manager view</p>
        </div>
      </div>

      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <StatPill
          label="Open followups"
          value={stats?.open_followups ?? 0}
          icon={<ClipboardList size={13} />}
        />
        <StatPill
          label="Pending drafts"
          value={stats?.pending_drafts ?? 0}
          icon={<MessageSquareWarning size={13} />}
        />
        <StatPill
          label="Open objections"
          value={stats?.open_objections ?? 0}
          tone={stats && stats.open_objections > 3 ? 'warning' : 'default'}
          icon={<TriangleAlert size={13} />}
        />
        <StatPill
          label="Accounts at risk"
          value={stats?.accounts_needing_attention ?? 0}
          tone={stats && stats.accounts_needing_attention > 0 ? 'danger' : 'default'}
          icon={<TriangleAlert size={13} />}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSummarize}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          title="Summarize pasted text (Ctrl+Q)"
        >
          Summarize ⌃Q
        </button>
        <button
          type="button"
          onClick={onStripe}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          title="Run Stripe connection check (Shift+A → C)"
        >
          Stripe check ⇧A→C
        </button>
        <button
          type="button"
          onClick={onCommandPalette}
          className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
        >
          Commands ⌘K
        </button>
        <UserMenu />
      </div>
    </header>
  )
}
