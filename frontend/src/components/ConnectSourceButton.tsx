import clsx from 'clsx'
import { Loader2, Mail, RefreshCw, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import type { NoteType } from '../types'
import { useSources, type SourceStatus } from '../state/sourcesContext'

/**
 * Generic connect / status / sync UI for one source.
 *
 * The visual palette lives on the RENDERER (i.e. on the node_type the source
 * produces), not on the provider. When Outlook lands and also produces
 * 'email' nodes, its connect button automatically shares Email's yellow.
 * When a future 'slack' provider produces a 'message' node_type, we register
 * that node_type's palette here and Slack's connect button picks it up
 * without any code change to this component.
 */
interface Props {
  sourceKey: string
  compact?: boolean
}

interface Palette {
  badge: string
  solid: string
  hint: string
}

const NODE_PALETTES: Partial<Record<NoteType, Palette>> = {
  email: {
    badge: 'bg-yellow-100 text-yellow-900 ring-yellow-200',
    solid: 'bg-yellow-500 hover:bg-yellow-600 text-white',
    hint: 'text-yellow-800',
  },
  // Future node types plug in here: message: {...}, meeting: {...}, voice_note: {...}
}

const DEFAULT_PALETTE: Palette = {
  badge: 'bg-slate-100 text-slate-800 ring-slate-200',
  solid: 'bg-slate-900 hover:bg-slate-800 text-white',
  hint: 'text-slate-800',
}

function paletteFor(nodeType: string): Palette {
  return NODE_PALETTES[nodeType as NoteType] ?? DEFAULT_PALETTE
}

// Icons live on the source key so each provider gets a recognisable glyph.
// When a source has no registered icon we fall back to the generic Zap.
const PROVIDER_ICONS: Record<string, ReactNode> = {
  gmail: <Mail size={13} />,
}

function iconFor(sourceKey: string): ReactNode {
  return PROVIDER_ICONS[sourceKey] ?? <Zap size={13} />
}

export function ConnectSourceButton({ sourceKey, compact }: Props) {
  const { sources, connect, sync, disconnect, syncing } = useSources()
  const s: SourceStatus | undefined = sources.find((x) => x.key === sourceKey)

  if (!s) return null // provider not registered

  const busy = Boolean(syncing[sourceKey])
  const p = paletteFor(s.produces_node_type)
  const icon = iconFor(sourceKey)

  if (!s.connected) {
    return (
      <button
        type="button"
        onClick={() => void connect(sourceKey)}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm',
          p.solid
        )}
        title={`Connect ${s.display_name}`}
      >
        {icon}
        Connect {s.display_name}
      </button>
    )
  }

  const email = s.external_account_email
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1',
          p.badge
        )}
        title={s.detail ?? ''}
      >
        {icon}
        <span className="hidden sm:inline">{s.display_name}</span>
        {email ? (
          <span className="max-w-[140px] truncate text-slate-600">· {email}</span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={() => void sync(sourceKey)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        title="Sync now"
      >
        {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
        {compact ? null : busy ? 'Syncing…' : 'Sync'}
      </button>
      {!compact ? (
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Disconnect ${s.display_name}? Cached items stay on the canvas.`)) {
              void disconnect(sourceKey)
            }
          }}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          title="Disconnect"
        >
          Disconnect
        </button>
      ) : null}
    </div>
  )
}

/**
 * Renders one ConnectSourceButton per registered source. When Slack, Outlook,
 * etc. ship, they show up here automatically with zero code change — the
 * whole UI is now "Sources" (plural) rather than "Connect Gmail".
 */
export function SourcesToolbar({ compact }: { compact?: boolean }) {
  const { sources } = useSources()
  if (sources.length === 0) return null
  return (
    <>
      {sources.map((s) => (
        <ConnectSourceButton key={s.key} sourceKey={s.key} compact={compact} />
      ))}
    </>
  )
}
