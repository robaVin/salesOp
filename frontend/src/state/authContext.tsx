import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export interface AuthUser {
  id: string
  workspace_id: string
  name: string
  email: string
  role: 'manager' | 'ae' | 'sdr' | 'admin'
  avatar_url: string | null
}

export interface AuthProviders {
  google_enabled: boolean
  password_enabled: boolean
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  error: string | null
  providers: AuthProviders
  signup: (input: { email: string; password: string; name: string; workspace_name?: string }) => Promise<void>
  login: (input: { email: string; password: string }) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function jsonOrThrow(res: Response): Promise<unknown> {
  if (res.ok) return res.json()
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* ignore */
  }
  const detail =
    body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : `HTTP ${res.status}`
  throw new Error(detail)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [providers, setProviders] = useState<AuthProviders>({
    google_enabled: false,
    password_enabled: true,
  })

  const refresh = useCallback(async () => {
    try {
      const [meRes, cfgRes] = await Promise.all([
        fetch('/api/auth/me', { credentials: 'include' }),
        fetch('/api/auth/config', { credentials: 'include' }),
      ])
      if (cfgRes.ok) {
        const cfg = (await cfgRes.json()) as AuthProviders
        setProviders(cfg)
      }
      if (meRes.status === 401) {
        setUser(null)
        return
      }
      const data = (await jsonOrThrow(meRes)) as { user: AuthUser }
      setUser(data.user)
    } catch (err) {
      setUser(null)
      setError(err instanceof Error ? err.message : 'auth_failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signup = useCallback(
    async (input: { email: string; password: string; name: string; workspace_name?: string }) => {
      setError(null)
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      })
      const data = (await jsonOrThrow(res)) as { user: AuthUser }
      setUser(data.user)
    },
    []
  )

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      setError(null)
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      })
      const data = (await jsonOrThrow(res)) as { user: AuthUser }
      setUser(data.user)
    },
    []
  )

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, error, providers, signup, login, logout, refresh }),
    [user, loading, error, providers, signup, login, logout, refresh]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
