import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { isGoogleOauthConfigured } from '../config/env'
import {
  clearSessionCookie,
  setSessionCookie,
  signSession,
  verifyPassword,
} from '../services/auth'
import { buildAuthorizeUrl, handleCallback } from '../services/googleOauth'
import {
  findUserByEmail,
  findUserById,
  findUserByGoogleSub,
  linkGoogleAccount,
  signup as signupUser,
  signupWithGoogle,
  toPublic,
  touchLastLogin,
} from '../services/userService'

export const authRouter = Router()

authRouter.get('/auth/config', (_req: Request, res: Response) => {
  res.json({
    google_enabled: isGoogleOauthConfigured(),
    password_enabled: true,
  })
})

const signupSchema = z.object({
  email: z.string().email().max(180),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(80),
  workspace_name: z.string().min(1).max(80).optional(),
})

const loginSchema = z.object({
  email: z.string().email().max(180),
  password: z.string().min(1).max(200),
})

authRouter.post('/auth/signup', async (req: Request, res: Response) => {
  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', detail: parsed.error.issues })
    return
  }
  const existing = await findUserByEmail(parsed.data.email)
  if (existing) {
    res.status(409).json({ error: 'email_taken' })
    return
  }
  try {
    const user = await signupUser({
      email: parsed.data.email,
      password: parsed.data.password,
      name: parsed.data.name,
      workspaceName: parsed.data.workspace_name,
    })
    const token = signSession({ sub: user.id, ws: user.workspace_id, role: user.role })
    setSessionCookie(res, token)
    res.status(201).json({ user: toPublic(user) })
  } catch (err) {
    console.error('[auth/signup] failed:', err)
    res
      .status(500)
      .json({ error: 'signup_failed', detail: err instanceof Error ? err.message : String(err) })
  }
})

authRouter.post('/auth/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', detail: parsed.error.issues })
    return
  }
  const user = await findUserByEmail(parsed.data.email)
  if (!user || !user.password_hash) {
    res.status(401).json({ error: 'invalid_credentials' })
    return
  }
  const ok = await verifyPassword(parsed.data.password, user.password_hash)
  if (!ok) {
    res.status(401).json({ error: 'invalid_credentials' })
    return
  }
  await touchLastLogin(user.id)
  const token = signSession({ sub: user.id, ws: user.workspace_id, role: user.role })
  setSessionCookie(res, token)
  res.json({ user: toPublic(user) })
})

authRouter.post('/auth/logout', (_req: Request, res: Response) => {
  clearSessionCookie(res)
  res.json({ ok: true })
})

// ----- Google OAuth -----

authRouter.get('/auth/google/start', (req: Request, res: Response) => {
  if (!isGoogleOauthConfigured()) {
    res.status(404).json({ error: 'google_oauth_not_configured' })
    return
  }
  const rawRedirect = typeof req.query.redirect === 'string' ? req.query.redirect : '/'
  const redirect = rawRedirect.startsWith('/') ? rawRedirect : '/'
  try {
    const url = buildAuthorizeUrl(redirect)
    res.redirect(url)
  } catch (err) {
    console.error('[auth/google/start] failed:', err)
    res.status(500).send('google_oauth_unavailable')
  }
})

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&'
      ? '&amp;'
      : c === '<'
        ? '&lt;'
        : c === '>'
          ? '&gt;'
          : c === '"'
            ? '&quot;'
            : '&#39;'
  )
}

function renderOauthError(res: Response, status: number, message: string) {
  // Render a simple HTML error so the user, who landed here via a full-page
  // redirect from Google, sees something readable rather than raw JSON.
  res
    .status(status)
    .type('html')
    .send(
      `<!doctype html><html><head><meta charset="utf-8"><title>Sign-in failed</title>
<style>body{font-family:system-ui;padding:32px;max-width:560px;color:#0f172a}
h1{font-size:18px;margin:0 0 8px}a{color:#1d4ed8}</style></head>
<body><h1>Sign-in failed</h1>
<p>${escapeHtml(message)}</p>
<p><a href="/login">Back to sign in</a></p></body></html>`
    )
}

authRouter.get('/auth/google/callback', async (req: Request, res: Response) => {
  if (!isGoogleOauthConfigured()) {
    renderOauthError(res, 404, 'Google sign-in is not enabled on this server.')
    return
  }

  // If Google returned an error param (user denied consent, etc.), surface it.
  if (typeof req.query.error === 'string') {
    renderOauthError(res, 400, `Google reported: ${req.query.error}`)
    return
  }
  const code = typeof req.query.code === 'string' ? req.query.code : null
  const state = typeof req.query.state === 'string' ? req.query.state : null
  if (!code || !state) {
    renderOauthError(res, 400, 'Missing code or state from Google.')
    return
  }

  let result
  try {
    result = await handleCallback({ code, state })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[auth/google/callback] failed:', msg)
    renderOauthError(res, 400, `Google sign-in failed: ${msg}`)
    return
  }
  const { profile, redirect } = result

  // Find by google_sub → link by email → create new.
  let user = await findUserByGoogleSub(profile.sub)
  if (!user) {
    const byEmail = await findUserByEmail(profile.email)
    if (byEmail) {
      const updated = await linkGoogleAccount({
        userId: byEmail.id,
        googleSub: profile.sub,
        avatarUrl: profile.picture ?? null,
        markVerified: profile.email_verified,
      })
      user = updated ?? byEmail
    } else {
      user = await signupWithGoogle({
        email: profile.email,
        name: profile.name ?? profile.email.split('@')[0],
        googleSub: profile.sub,
        avatarUrl: profile.picture ?? null,
        emailVerified: profile.email_verified,
      })
    }
  } else {
    await touchLastLogin(user.id)
    // Refresh avatar opportunistically.
    if (profile.picture && profile.picture !== user.avatar_url) {
      await linkGoogleAccount({
        userId: user.id,
        googleSub: profile.sub,
        avatarUrl: profile.picture,
        markVerified: profile.email_verified,
      })
    }
  }

  const token = signSession({ sub: user.id, ws: user.workspace_id, role: user.role })
  setSessionCookie(res, token)
  const safeRedirect = redirect && redirect.startsWith('/') ? redirect : '/'
  res.redirect(`${process.env.DASHBOARD_ORIGIN}${safeRedirect}`)  
})

// ----- session lookup -----

authRouter.get('/auth/me', async (req: Request, res: Response) => {
  // The actual auth middleware lives in middleware/requireAuth.ts and runs
  // earlier; if we got here authenticated, req.user is populated. To keep
  // this endpoint useful both inside and outside the auth gate we re-resolve
  // the user defensively.
  const userId = (req as Request & { userId?: string }).userId
  if (!userId) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }
  const row = await findUserById(userId)
  if (!row) {
    res.status(401).json({ error: 'user_missing' })
    return
  }
  res.json({ user: toPublic(row) })
})
