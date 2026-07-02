import { Command } from 'cmdk'
import {
  Bot,
  CircleCheck,
  FileText,
  Home,
  Mail,
  MessageCircle,
  Navigation,
  Phone,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  UserCircle2,
  Wrench,
  Zap,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { NoteRecord } from '../types'

export type CommandKey =
  | 'go_home'
  | 'go_command_center'
  | 'go_node'
  | 'create_note'
  | 'create_prospect'
  | 'create_account'
  | 'create_followup'
  | 'create_call_summary'
  | 'run_stripe_check'
  | 'summarize_clipboard'
  | 'draft_email_reply'
  | 'draft_linkedin_reply'
  | 'mark_resolved'
  | 'search_notes'
  | 'open_trash'

interface PaletteCommand {
  key: CommandKey
  label: string
  hint?: string
  icon: ReactNode
  requiresSelection?: boolean
}

const COMMANDS: PaletteCommand[] = [
  { key: 'go_home', label: 'Go to Daily Briefing (Home)', hint: 'H', icon: <Home size={16} /> },
  { key: 'go_command_center', label: 'Go to Command Center', icon: <Zap size={16} /> },
  { key: 'create_note', label: 'Create note', hint: 'N', icon: <StickyNote size={16} /> },
  { key: 'create_prospect', label: 'Create prospect note', icon: <UserCircle2 size={16} /> },
  { key: 'create_account', label: 'Create account note', icon: <FileText size={16} /> },
  { key: 'create_followup', label: 'Create followup', icon: <CircleCheck size={16} /> },
  { key: 'create_call_summary', label: 'Create call summary', icon: <Phone size={16} /> },
  {
    key: 'summarize_clipboard',
    label: 'Summarize from clipboard',
    hint: 'paste',
    icon: <Sparkles size={16} />,
  },
  {
    key: 'run_stripe_check',
    label: 'Run Stripe connection check',
    hint: 'Shift A → C',
    icon: <Wrench size={16} />,
  },
  {
    key: 'draft_email_reply',
    label: 'Draft email reply (from selected note)',
    icon: <Mail size={16} />,
    requiresSelection: true,
  },
  {
    key: 'draft_linkedin_reply',
    label: 'Draft LinkedIn reply (from selected note)',
    icon: <MessageCircle size={16} />,
    requiresSelection: true,
  },
  {
    key: 'mark_resolved',
    label: 'Mark selected note resolved',
    icon: <CircleCheck size={16} />,
    requiresSelection: true,
  },
  { key: 'search_notes', label: 'Search notes', hint: '/', icon: <Search size={16} /> },
  { key: 'open_trash', label: 'Open Trash bin', icon: <Trash2 size={16} /> },
]

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onCommand: (key: CommandKey, arg?: { nodeId?: string }) => void
  hasSelection: boolean
  notes: NoteRecord[]
}

export function CommandPalette({ open, onClose, onCommand, hasSelection, notes }: CommandPaletteProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/30 pt-32"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="overflow-hidden rounded-2xl" label="Sales Canvas command palette">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <Bot size={16} className="text-slate-400" />
            <Command.Input
              autoFocus
              placeholder="Type a command…"
              className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
            <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-96 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-slate-500">
              No commands match.
            </Command.Empty>
            <Command.Group heading={<span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Commands</span>}>
              {COMMANDS.map((cmd) => {
                const disabled = cmd.requiresSelection && !hasSelection
                return (
                  <Command.Item
                    key={cmd.key}
                    value={cmd.label}
                    disabled={disabled}
                    onSelect={() => {
                      if (disabled) return
                      onCommand(cmd.key)
                      onClose()
                    }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                      disabled ? 'text-slate-300' : 'text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <span className={disabled ? 'text-slate-300' : 'text-slate-500'}>{cmd.icon}</span>
                    <span className="flex-1">{cmd.label}</span>
                    {cmd.hint ? (
                      <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        {cmd.hint}
                      </kbd>
                    ) : null}
                    {disabled ? (
                      <span className="text-[10px] uppercase tracking-wider text-slate-300">
                        Select a note
                      </span>
                    ) : null}
                  </Command.Item>
                )
              })}
            </Command.Group>

            {notes.length > 0 ? (
              <Command.Group heading={<span className="mt-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Go to node</span>}>
                {notes.slice(0, 50).map((n) => (
                  <Command.Item
                    key={`node-${n.id}`}
                    value={`${n.title} ${n.node_type}`}
                    onSelect={() => {
                      onCommand('go_node', { nodeId: n.id })
                      onClose()
                    }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                  >
                    <Navigation size={16} className="text-slate-400" />
                    <span className="flex-1 truncate">{n.title}</span>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400">
                      {n.node_type.replace('_', ' ')}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
