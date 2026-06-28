import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowLeft, Copy, KeyRound, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../state/authContext'

interface ApiToken {
  id: string
  name: string
  prefix: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export function SettingsPage() {
  const { user, logout } = useAuth()
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [justCreated, setJustCreated] = useState<{ plaintext: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/tokens', { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { data: ApiToken[] }
      setTokens(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const createToken = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { token: ApiToken; plaintext: string }
      setJustCreated({ plaintext: data.plaintext, name: data.token.name })
      setNewName('')
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (id: string) => {
    if (!confirm('Revoke this token? Any device using it will lose access immediately.')) return
    try {
      const res = await fetch(`/api/tokens/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`)
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const copyPlaintext = async () => {
    if (!justCreated) return
    try {
      await navigator.clipboard.writeText(justCreated.plaintext)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — user can select+copy manually */
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950">
            <Activity size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Settings</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              {user?.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft size={12} />
            Back to canvas
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">API tokens</h2>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Use a token to authenticate the Chrome extension (and any future
            integrations). Tokens are scoped to your user + workspace. The plaintext
            value is shown <strong>once</strong> at creation — store it somewhere safe.
          </p>

          {justCreated ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold text-emerald-900">
                Token created: {justCreated.name}
              </p>
              <p className="mt-1 text-[11px] text-emerald-800">
                Copy it now. You won't see it again.
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2">
                <code className="flex-1 truncate font-mono text-xs text-slate-800">
                  {justCreated.plaintext}
                </code>
                <button
                  type="button"
                  onClick={() => void copyPlaintext()}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50"
                >
                  <Copy size={11} />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setJustCreated(null)}
                className="mt-3 text-[11px] font-semibold text-emerald-800 hover:underline"
              >
                I've saved it — dismiss
              </button>
            </div>
          ) : null}

          <div className="mt-5 flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-[11px] font-medium text-slate-700">
                New token name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Chrome on laptop"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <button
              type="button"
              onClick={() => void createToken()}
              disabled={creating || !newName.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              <Plus size={12} />
              {creating ? 'Creating…' : 'Create token'}
            </button>
          </div>

          {error ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}

          <div className="mt-6">
            {loading ? (
              <p className="text-xs text-slate-500">Loading tokens…</p>
            ) : tokens.length === 0 ? (
              <p className="text-xs text-slate-500">
                No tokens yet. Create one above to authenticate the Chrome extension.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {tokens.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3 text-xs">
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-slate-900">{t.name}</p>
                      <p className="font-mono text-[10px] text-slate-500">{t.prefix}…</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        Created {new Date(t.created_at).toLocaleString()}
                        {t.last_used_at
                          ? ` · last used ${new Date(t.last_used_at).toLocaleString()}`
                          : ' · never used'}
                        {t.revoked_at ? ' · REVOKED' : ''}
                      </p>
                    </div>
                    {!t.revoked_at ? (
                      <button
                        type="button"
                        onClick={() => void revoke(t.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                      >
                        <Trash2 size={11} />
                        Revoke
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
