import 'dotenv/config'

function required(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Env ${name} is required`)
  }
  return value.trim()
}

const sessionSecret =
  process.env.SESSION_SECRET?.trim() ||
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error('SESSION_SECRET is required in production')
      })()
    : 'dev-insecure-change-me-in-production-32-chars-min')

export const env = {
  port: Number.parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  databaseUrl: required('DATABASE_URL', process.env.DATABASE_URL),
  dashboardOrigin: process.env.DASHBOARD_ORIGIN ?? 'http://localhost:5173',
  openAiApiKey: process.env.OPENAI_API_KEY ?? '',
  openAiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  stripeTestKey: process.env.STRIPE_TEST_KEY ?? '',
  defaultWorkspaceSlug: process.env.DEFAULT_WORKSPACE_SLUG ?? 'demo',
  defaultUserName: process.env.DEFAULT_USER_NAME ?? 'Sales Manager',
  sessionSecret,
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? 'sc_session',
  sessionTtlDays: Number.parseInt(process.env.SESSION_TTL_DAYS ?? '7', 10),

  // Google OAuth — optional. When unset, the "Sign in with Google" button is hidden.
  googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
  googleRedirectUri:
    process.env.GOOGLE_OAUTH_REDIRECT_URI ??
    'http://localhost:5173/api/auth/google/callback',
  // Where to send the browser after a successful login (relative path).
  postLoginRedirect: process.env.POST_LOGIN_REDIRECT ?? '/',

  // Dev-only convenience: skip auth on /api/capture and route every capture
  // into the configured user's workspace. Refused in production no matter what.
  devCaptureNoAuth:
    process.env.NODE_ENV !== 'production' &&
    (process.env.DEV_CAPTURE_NO_AUTH ?? '').trim().toLowerCase() === 'true',
  devCaptureUserEmail: process.env.DEV_CAPTURE_USER_EMAIL ?? '',
}

export function isGoogleOauthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET
  )
}
