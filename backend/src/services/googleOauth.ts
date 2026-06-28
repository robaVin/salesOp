import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env, isGoogleOauthConfigured } from '../config/env'

// OAuth scopes for login only. The calendar feature later adds:
//   https://www.googleapis.com/auth/calendar.events
// The Gmail feature later adds:
//   https://www.googleapis.com/auth/gmail.send
// Both go through the same flow with an expanded scope list.
const LOGIN_SCOPES = ['openid', 'email', 'profile']

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

interface StateClaims {
  nonce: string
  redirect: string
}

function signState(claims: StateClaims): string {
  return jwt.sign(claims, env.sessionSecret, { expiresIn: '10m' })
}

function verifyState(token: string): StateClaims | null {
  try {
    const decoded = jwt.verify(token, env.sessionSecret) as StateClaims
    if (!decoded.nonce || typeof decoded.redirect !== 'string') return null
    if (!decoded.redirect.startsWith('/')) return null
    return decoded
  } catch {
    return null
  }
}

export function buildAuthorizeUrl(redirectAfter: string): string {
  if (!isGoogleOauthConfigured()) {
    throw new Error('google_oauth_not_configured')
  }
  const state = signState({
    nonce: crypto.randomBytes(16).toString('hex'),
    redirect: redirectAfter.startsWith('/') ? redirectAfter : '/',
  })
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: 'code',
    scope: LOGIN_SCOPES.join(' '),
    access_type: 'online',
    include_granted_scopes: 'true',
    prompt: 'select_account',
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export interface GoogleProfile {
  sub: string
  email: string
  email_verified: boolean
  name?: string
  picture?: string
}

export interface CallbackResult {
  profile: GoogleProfile
  redirect: string
}

export async function handleCallback(params: {
  code: string
  state: string
}): Promise<CallbackResult> {
  const claims = verifyState(params.state)
  if (!claims) {
    throw new Error('invalid_state')
  }

  // 1. Exchange code → tokens.
  const tokenBody = new URLSearchParams({
    code: params.code,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: env.googleRedirectUri,
    grant_type: 'authorization_code',
  })
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
  })
  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => '')
    throw new Error(`token_exchange_failed: ${tokenRes.status} ${detail.slice(0, 200)}`)
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string }
  if (!tokenJson.access_token) {
    throw new Error('no_access_token_in_response')
  }

  // 2. Fetch the user profile.
  const userinfoRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  })
  if (!userinfoRes.ok) {
    throw new Error(`userinfo_failed: ${userinfoRes.status}`)
  }
  const profile = (await userinfoRes.json()) as {
    sub?: string
    email?: string
    email_verified?: boolean
    name?: string
    picture?: string
  }
  if (!profile.sub || !profile.email) {
    throw new Error('userinfo_missing_fields')
  }

  return {
    profile: {
      sub: profile.sub,
      email: profile.email,
      email_verified: Boolean(profile.email_verified),
      name: profile.name,
      picture: profile.picture,
    },
    redirect: claims.redirect,
  }
}
