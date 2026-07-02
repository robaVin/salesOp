import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { env } from '../config/env'
import { getProvider } from '../sources/registry'

/**
 * Provider-specific OAuth entry points for Gmail. OAuth callbacks are
 * provider-specific because the redirect URI is baked into the provider's
 * consent screen configuration. Everything ELSE (status/sync/disconnect)
 * lives under the generic /api/sources/... surface.
 */
export const gmailRouter = Router()

const prepareSchema = z.object({
  redirect: z.string().optional(),
})

gmailRouter.post('/gmail/oauth/prepare', async (req: Request, res: Response) => {
  if (!req.userId || !req.workspaceId) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }
  const parsed = prepareSchema.safeParse(req.body ?? {})
  const redirect =
    parsed.success && parsed.data.redirect && parsed.data.redirect.startsWith('/')
      ? parsed.data.redirect
      : '/'
  const provider = getProvider('gmail')
  if (!provider) {
    res.status(500).json({ error: 'provider_missing' })
    return
  }
  try {
    const url = await provider.connectStartUrl(
      { workspaceId: req.workspaceId!, userId: req.userId! },
      redirect
    )
    if (!url) {
      res.status(500).json({ error: 'no_connect_url' })
      return
    }
    // Return the URL — the frontend does window.location.href = url. We do NOT
    // 302 here because that would require sending cookies cross-site and the
    // brief says not to depend on that.
    res.json({ url, mode: env.gmailProvider })
  } catch (err) {
    res
      .status(500)
      .json({ error: 'prepare_failed', detail: err instanceof Error ? err.message : String(err) })
  }
})

// Callback lands on the backend directly. Google (or the mock connect flow)
// posts here with { code, state } — the state JWT carries the user_id, so we
// don't need a session cookie on this endpoint. On success/failure we redirect
// the browser back to the frontend origin.
gmailRouter.get('/gmail/oauth/callback', async (req: Request, res: Response) => {
  const isMock = req.query.mock === '1'
  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  const errorParam = typeof req.query.error === 'string' ? req.query.error : ''
  const redirect =
    typeof req.query.redirect === 'string' && req.query.redirect.startsWith('/')
      ? req.query.redirect
      : '/'

  const frontendOrigin = env.gmailPostConnectOrigin.replace(/\/$/, '')

  function bounce(status: 'ok' | 'error', extra?: string) {
    const q = new URLSearchParams({ gmail: status })
    if (extra) q.set('gmail_detail', extra)
    return res.redirect(302, `${frontendOrigin}${redirect}?${q.toString()}`)
  }

  if (errorParam) return bounce('error', errorParam.slice(0, 80))

  const provider = getProvider('gmail')
  if (!provider) return bounce('error', 'provider_missing')

  if (isMock) {
    // Mock path: no OAuth to Google. The user is authenticated via session
    // cookie (this endpoint is behind attachAuth+requireAuth on /api).
    if (!req.userId || !req.workspaceId) return bounce('error', 'not_authed')
    try {
      await provider.handleCallback(
        { workspaceId: req.workspaceId, userId: req.userId },
        { code: 'mock', state: 'mock' }
      )
      return bounce('ok')
    } catch (err) {
      return bounce('error', err instanceof Error ? err.message.slice(0, 80) : 'mock_failed')
    }
  }

  if (!code || !state) return bounce('error', 'missing_code_or_state')

  // Real path: state carries user_id + workspace_id. Session cookie NOT
  // required (and often not sent, as the callback is a top-level GET from
  // Google). handleCallback validates the state JWT internally.
  try {
    await provider.handleCallback(
      { workspaceId: 'from-state', userId: 'from-state' },
      { code, state }
    )
    return bounce('ok')
  } catch (err) {
    return bounce('error', err instanceof Error ? err.message.slice(0, 80) : 'unknown_error')
  }
})
