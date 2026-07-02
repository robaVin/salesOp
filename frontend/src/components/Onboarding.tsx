import { useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  Command,
  Copy,
  FolderPlus,
  KeyRound,
  LayoutGrid,
  Mail,
  Pin,
  Puzzle,
  Sparkles,
  StickyNote,
  Sun,
  X,
  Zap,
} from 'lucide-react'
import { useAuth } from '../state/authContext'

// Flag is only set when the user explicitly opts out ("Don't show this again").
// Otherwise the guide shows on every visit.
const optOutKey = (uid: string) => `salescanvas.onboarding.optout.v1.${uid}`

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
      {children}
    </kbd>
  )
}

function ZoneRow({ icon, name, desc, color }: { icon: ReactNode; name: string; desc: string; color: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg" style={{ backgroundColor: `${color}1a`, color }}>
        {icon}
      </div>
      <div>
        <p className="text-[13px] font-semibold text-slate-900">{name}</p>
        <p className="text-[12px] leading-snug text-slate-500">{desc}</p>
      </div>
    </div>
  )
}

function ShortcutRow({ keys, label }: { keys: ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <span className="text-[13px] text-slate-700">{label}</span>
      <span className="flex flex-none items-center gap-1">{keys}</span>
    </div>
  )
}

/** Generates a personal API key inline and walks through connecting the extension. */
function ExtensionStep() {
  const [key, setKey] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function generate() {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Chrome extension' }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { plaintext: string }
      setKey(data.plaintext)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  async function copy() {
    if (!key) return
    try {
      await navigator.clipboard.writeText(key)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — user can select the text manually */
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[13.5px] leading-relaxed text-slate-600">
        Capture from anywhere. With the Sales Canvas Chrome extension, press <Kbd>Alt+Shift+S</Kbd> on any
        page (or an open Gmail thread) to send it to your canvas as a typed note.
      </p>
      <p className="text-[12.5px] leading-relaxed text-slate-500">
        The extension uses your signed-in session automatically. If it can't read your cookie, connect it
        with a personal API key:
      </p>

      {key ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-[11px] font-semibold text-emerald-900">Your API key — copy it now, you won't see it again.</p>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5">
            <code className="flex-1 truncate font-mono text-[11.5px] text-slate-800">{key}</code>
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void generate()}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <KeyRound size={14} />
          {creating ? 'Generating…' : 'Generate API key'}
        </button>
      )}
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-[11.5px] text-red-700">{error}</p> : null}

      <ol className="space-y-2 pt-1">
        {[
          <>Load the extension: <Kbd>chrome://extensions</Kbd> → enable <b>Developer mode</b> → <b>Load unpacked</b> → pick the <code className="font-mono text-[12px]">extension/</code> folder.</>,
          <>Click the extension icon → <b>Advanced</b> → paste the key above → <b>Save</b>.</>,
          <>Press <Kbd>Alt+Shift+S</Kbd> on any page to capture straight into your canvas.</>,
        ].map((text, i) => (
          <li key={i} className="flex gap-2.5 text-[12.5px] text-slate-600">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
              {i + 1}
            </span>
            <span className="leading-snug">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

interface Step {
  icon: ReactNode
  accent: string
  eyebrow: string
  title: string
  body: ReactNode
}

function buildSteps(firstName: string): Step[] {
  return [
    {
      icon: <Sparkles size={22} />,
      accent: '#0f172a',
      eyebrow: 'Welcome',
      title: `Hi ${firstName || 'there'} — this isn't a dashboard`,
      body: (
        <p className="text-[13.5px] leading-relaxed text-slate-600">
          Sales Canvas is a spatial workspace. There are no pages — only nodes. Every note, email, task,
          and automation lives as a card on one infinite canvas you can fly around. Zoom in on a card to
          see more; zoom out to see the whole picture.
        </p>
      ),
    },
    {
      icon: <LayoutGrid size={22} />,
      accent: '#2563eb',
      eyebrow: 'The layout',
      title: 'Five zones keep everything in its place',
      body: (
        <div className="space-y-3">
          <ZoneRow icon={<Sun size={16} />} color="#f59e0b" name="Home" desc="Today's briefing, priorities, and hot signals." />
          <ZoneRow icon={<Mail size={16} />} color="#eab308" name="Email" desc="Your important inbox, synced from Gmail." />
          <ZoneRow icon={<StickyNote size={16} />} color="#3b82f6" name="Notes" desc="Prospects, accounts, objections, and drafts." />
          <ZoneRow icon={<ClipboardList size={16} />} color="#10b981" name="Tasks" desc="Follow-ups and meetings you owe." />
          <ZoneRow icon={<Zap size={16} />} color="#d946ef" name="Automations" desc="Stripe checks and their results." />
          <p className="pt-1 text-[12px] text-slate-500">Anything you create drops into the right zone automatically.</p>
        </div>
      ),
    },
    {
      icon: <Command size={22} />,
      accent: '#7c3aed',
      eyebrow: 'Move fast',
      title: 'A few shortcuts do most of the work',
      body: (
        <div>
          <ShortcutRow keys={<Kbd>/</Kbd>} label="Search notes, emails, workspaces" />
          <ShortcutRow keys={<Kbd>⌘K</Kbd>} label="Command palette" />
          <ShortcutRow keys={<Kbd>N</Kbd>} label="New note" />
          <ShortcutRow keys={<Kbd>Ctrl+Q</Kbd>} label="Summarize pasted text with AI" />
          <ShortcutRow
            keys={<><Kbd>Enter</Kbd><span className="text-[11px] text-slate-400">/ double-click</span></>}
            label="Open a card · Esc to go back · H flies Home"
          />
          <ShortcutRow keys={<><Kbd>Shift+A</Kbd><span className="text-slate-400">→</span><Kbd>C</Kbd></>} label="Run the Stripe connection check" />
        </div>
      ),
    },
    {
      icon: <FolderPlus size={22} />,
      accent: '#0f766e',
      eyebrow: 'Go deeper',
      title: 'Group what matters into a Workspace',
      body: (
        <div className="space-y-3">
          <p className="text-[13.5px] leading-relaxed text-slate-600">
            Open any important email, note, or account and hit <span className="font-medium text-slate-800">Create workspace</span>. It
            becomes the anchor — then pull related notes, emails, and tasks together in one focused place.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
            <Pin size={13} className="text-teal-600" />
            <span className="text-[12px] text-slate-600">
              e.g. an email from ACME becomes an <span className="font-medium text-slate-800">"ACME rollout"</span> workspace.
            </span>
          </div>
        </div>
      ),
    },
    {
      icon: <Puzzle size={22} />,
      accent: '#c2410c',
      eyebrow: 'Capture anywhere',
      title: 'Connect the Chrome extension',
      body: <ExtensionStep />,
    },
  ]
}

/**
 * First-run welcome guide. Shows on every visit, unless the user ticks
 * "Don't show this again" — which persists an opt-out flag for that user
 * (localStorage, so it's per-browser). Overlays the canvas until dismissed.
 */
export function Onboarding() {
  const { user } = useAuth()
  const [step, setStep] = useState(0)
  const [neverAgain, setNeverAgain] = useState(false)
  const [done, setDone] = useState<boolean>(() => {
    if (!user) return true
    try {
      return localStorage.getItem(optOutKey(user.id)) === '1'
    } catch {
      return false
    }
  })

  if (!user || done) return null

  const steps = buildSteps(user.name?.split(' ')[0] ?? '')
  const current = steps[step]
  const isLast = step === steps.length - 1

  function close() {
    if (neverAgain && user) {
      try {
        localStorage.setItem(optOutKey(user.id), '1')
      } catch {
        /* ignore */
      }
    }
    setDone(true)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Hero */}
        <div className="relative flex-none px-7 pb-5 pt-7" style={{ backgroundColor: `${current.accent}0f` }}>
          <button
            type="button"
            onClick={close}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-white/60 hover:text-slate-700"
            aria-label="Close"
            title="Close"
          >
            <X size={16} />
          </button>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl text-white" style={{ backgroundColor: current.accent }}>
            {current.icon}
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider" style={{ color: current.accent }}>
            {current.eyebrow}
          </p>
          <h2 className="mt-0.5 text-[19px] font-semibold leading-snug text-slate-900">{current.title}</h2>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-7 py-5">{current.body}</div>

        {/* Opt-out */}
        <label className="flex flex-none cursor-pointer items-center gap-2 border-t border-slate-100 px-7 py-2.5 text-[12px] text-slate-500">
          <input
            type="checkbox"
            checked={neverAgain}
            onChange={(e) => setNeverAgain(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300"
          />
          Don't show this again
        </label>

        {/* Footer */}
        <div className="flex flex-none items-center justify-between border-t border-slate-100 px-7 py-4">
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className="h-1.5 rounded-full transition-all"
                style={{ width: i === step ? 18 : 6, backgroundColor: i === step ? current.accent : '#e2e8f0' }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            ) : (
              <button type="button" onClick={close} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800">
                Skip
              </button>
            )}
            {isLast ? (
              <button type="button" onClick={close} className="rounded-lg bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
                Get started
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Next
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
