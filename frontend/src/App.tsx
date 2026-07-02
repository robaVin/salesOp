import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './state/authContext'
import { SourcesProvider } from './state/sourcesContext'
import { CanvasPage } from './pages/Canvas'
import { LoginPage } from './pages/Login'
import { SignupPage } from './pages/Signup'
import { SettingsPage } from './pages/Settings'

function Guarded({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <SourcesProvider>{children}</SourcesProvider>
}

function PublicOnly({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnly>
                <LoginPage />
              </PublicOnly>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicOnly>
                <SignupPage />
              </PublicOnly>
            }
          />
          <Route
            path="/settings"
            element={
              <Guarded>
                <SettingsPage />
              </Guarded>
            }
          />
          <Route
            path="/"
            element={
              <Guarded>
                <CanvasPage />
              </Guarded>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
