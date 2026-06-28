import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { useAuth } from '../state/authContext'
import { GoogleSignInButton } from '../components/GoogleSignInButton'

export function LoginPage() {
  const navigate = useNavigate()
  const { login, providers } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login({ email, password })
      navigate('/', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      setError(
        msg === 'invalid_credentials'
          ? 'Email or password is wrong.'
          : msg
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950">
            <Activity size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Sales Canvas</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Sign in</p>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {providers.google_enabled ? (
            <>
              <GoogleSignInButton redirect="/" label="Continue with Google" />
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-wider text-slate-400">
                  <span className="bg-white px-2">or with email</span>
                </div>
              </div>
            </>
          ) : null}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700">Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-600">
          No account yet?{' '}
          <Link to="/signup" className="font-semibold text-slate-900 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
