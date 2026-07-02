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

  // ---- Feature 1: Gmail Important Emails ----
  //
  // Gmail OAuth uses its own redirect URI so the callback lands on the backend
  // directly (Render in prod). This is distinct from the login OAuth redirect
  // which points to the Vercel frontend for the login session cookie.
  gmailOauthRedirectUri:
    process.env.GMAIL_OAUTH_REDIRECT_URI ??
    'http://localhost:3001/api/gmail/oauth/callback',
  // After the Gmail OAuth callback finishes, send the browser back to this
  // origin. In production this is the Vercel frontend.
  gmailPostConnectOrigin:
    process.env.GMAIL_POST_CONNECT_ORIGIN ?? process.env.DASHBOARD_ORIGIN ?? 'http://localhost:5173',
  // 'real' | 'mock'. Anything other than 'real' is treated as mock.
  // 'real' also silently falls back to mock if Google OAuth creds are unset.
  gmailProvider: ((process.env.GMAIL_PROVIDER ?? '').trim().toLowerCase() === 'real'
    ? 'real'
    : 'mock') as 'real' | 'mock',
  gmailDefaultLimit: Number.parseInt(process.env.GMAIL_DEFAULT_LIMIT ?? '50', 10),
  gmailSyncMaxLimit: Number.parseInt(process.env.GMAIL_SYNC_MAX_LIMIT ?? '200', 10),

  // Token encryption key for user_oauth_tokens (AES-256-GCM key material).
  // Required in production; a dev fallback derived from SESSION_SECRET is used
  // otherwise (with a boot warning).
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',
}

// Prod: refuse to boot if TOKEN_ENCRYPTION_KEY isn't set. Real Gmail tokens
// would otherwise be written under a SESSION_SECRET-derived key, coupling
// two independent secrets.
if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.TOKEN_ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY.trim().length < 16)
) {
  throw new Error(
    'TOKEN_ENCRYPTION_KEY must be set in production (at least 16 chars; recommended 32+ random bytes base64)'
  )
}

export function isGoogleOauthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET
  )
}
