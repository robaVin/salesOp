import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env'
import { queryOne } from '../../services/db'
import {
  getDecryptedTokens,
  getTokens,
  markDisconnected,
  touchUsed,
  updateAccessToken,
  upsertTokens,
} from '../../services/oauthTokenService'
import type {
  ConnectionStatus,
  ProviderContext,
  SalesObject,
  SourceProvider,
  SyncOptions,
} from '../types'

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'

interface StateClaims {
  nonce: string
  redirect: string
  user_id: string
  workspace_id: string
}

function signState(claims: StateClaims): string {
  return jwt.sign(claims, env.sessionSecret, { expiresIn: '15m' })
}

function verifyState(token: string): StateClaims | null {
  try {
    const decoded = jwt.verify(token, env.sessionSecret) as StateClaims
    if (
      !decoded.nonce ||
      !decoded.redirect ||
      !decoded.user_id ||
      !decoded.workspace_id ||
      !decoded.redirect.startsWith('/')
    ) {
      return null
    }
    return decoded
  } catch {
    return null
  }
}

/**
 * Refresh the stored access token when it's expired or about to expire.
 * Returns a fresh, valid access token or null on failure.
 */
async function ensureFreshAccessToken(ctx: ProviderContext): Promise<string | null> {
  const tokens = await getDecryptedTokens({ userId: ctx.userId, provider: 'google_gmail' })
  if (!tokens) return null

  const expiresAt = tokens.expires_at ? tokens.expires_at.getTime() : 0
  const now = Date.now()
  const skew = 60_000 // refresh if less than 60s left
  if (expiresAt - now > skew && tokens.access_token) {
    await touchUsed({ userId: ctx.userId, provider: 'google_gmail' })
    return tokens.access_token
  }

  if (!tokens.refresh_token) {
    console.warn('[gmail] access token expired but no refresh_token available — user must reconnect')
    return null
  }

  const body = new URLSearchParams({
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    console.warn('[gmail] refresh_token exchange failed', res.status)
    return null
  }
  const data = (await res.json()) as {
    access_token?: string
    expires_in?: number
    scope?: string
  }
  if (!data.access_token) return null

  const newExpiresAt = new Date(now + (data.expires_in ?? 3600) * 1000)
  await updateAccessToken({
    userId: ctx.userId,
    provider: 'google_gmail',
    accessToken: data.access_token,
    expiresAt: newExpiresAt,
  })
  return data.access_token
}

interface GmailListItem {
  id: string
  threadId: string
}

interface GmailMessageMetadata {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string // ms since epoch as a string
  payload?: {
    headers?: Array<{ name: string; value: string }>
  }
}

function parseFromHeader(value: string | undefined): { name: string; email: string } {
  if (!value) return { name: '', email: '' }
  // Formats: "Alice Example <alice@example.com>", "alice@example.com", "<alice@example.com>"
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (match) return { name: match[1].trim(), email: match[2].trim() }
  return { name: '', email: value.trim() }
}

function headerValue(msg: GmailMessageMetadata, name: string): string | undefined {
  const h = msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
  return h?.value
}

async function fetchProfileEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(`${GMAIL_API_BASE}/users/me/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const data = (await res.json()) as { emailAddress?: string }
  return data.emailAddress ?? null
}

async function listMessageIds(params: {
  accessToken: string
  q: string
  limit: number
}): Promise<GmailListItem[]> {
  const results: GmailListItem[] = []
  let pageToken: string | undefined
  while (results.length < params.limit) {
    const url = new URL(`${GMAIL_API_BASE}/users/me/messages`)
    url.searchParams.set('q', params.q)
    url.searchParams.set(
      'maxResults',
      String(Math.min(100, params.limit - results.length))
    )
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Gmail list failed ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = (await res.json()) as {
      messages?: GmailListItem[]
      nextPageToken?: string
    }
    for (const m of data.messages ?? []) results.push(m)
    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }
  return results.slice(0, params.limit)
}

async function fetchMessageMetadata(params: {
  accessToken: string
  id: string
}): Promise<GmailMessageMetadata | null> {
  const url = new URL(`${GMAIL_API_BASE}/users/me/messages/${params.id}`)
  url.searchParams.set('format', 'metadata')
  url.searchParams.append('metadataHeaders', 'From')
  url.searchParams.append('metadataHeaders', 'Subject')
  url.searchParams.append('metadataHeaders', 'Date')
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  })
  if (!res.ok) return null
  return (await res.json()) as GmailMessageMetadata
}

export function getRealGmailProvider(): SourceProvider {
  return {
    key: 'gmail',
    displayName: 'Gmail',
    producesNodeType: 'email',

    async status(ctx: ProviderContext): Promise<ConnectionStatus> {
      const row = await getTokens({ userId: ctx.userId, provider: 'google_gmail' })
      const lastSync = await queryOne<{ finished_at: Date | null }>(
        `SELECT finished_at FROM object_syncs
         WHERE user_id = $1 AND source_provider = 'gmail' AND status = 'success'
         ORDER BY started_at DESC LIMIT 1`,
        [ctx.userId]
      )
      return {
        connected: Boolean(row),
        state: row ? 'connected' : 'not_connected',
        external_account_email: row?.external_account_email ?? null,
        scopes: row ? row.scopes.split(' ').filter(Boolean) : [],
        last_sync_at: lastSync?.finished_at ? lastSync.finished_at.toISOString() : null,
      }
    },

    async connectStartUrl(ctx, redirectAfter): Promise<string> {
      const state = signState({
        nonce: crypto.randomBytes(16).toString('hex'),
        redirect: redirectAfter.startsWith('/') ? redirectAfter : '/',
        user_id: ctx.userId,
        workspace_id: ctx.workspaceId,
      })
      const params = new URLSearchParams({
        client_id: env.googleClientId,
        redirect_uri: env.gmailOauthRedirectUri,
        response_type: 'code',
        scope: GMAIL_READONLY_SCOPE,
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent',
        state,
      })
      return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`
    },

    async handleCallback(_ctxUnused, params) {
      const claims = verifyState(params.state)
      if (!claims) throw new Error('gmail_invalid_state')

      const body = new URLSearchParams({
        code: params.code,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: env.gmailOauthRedirectUri,
        grant_type: 'authorization_code',
      })
      const tokRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
      if (!tokRes.ok) {
        const detail = await tokRes.text().catch(() => '')
        throw new Error(`gmail_token_exchange_failed:${tokRes.status}:${detail.slice(0, 200)}`)
      }
      const tok = (await tokRes.json()) as {
        access_token?: string
        refresh_token?: string
        expires_in?: number
        scope?: string
      }
      if (!tok.access_token) throw new Error('gmail_no_access_token')
      if (!tok.scope || !tok.scope.split(' ').includes(GMAIL_READONLY_SCOPE)) {
        throw new Error('gmail_scope_denied')
      }

      const profileEmail = await fetchProfileEmail(tok.access_token)

      await upsertTokens({
        workspaceId: claims.workspace_id,
        userId: claims.user_id,
        provider: 'google_gmail',
        scopes: tok.scope,
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token ?? null,
        expiresAt: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000),
        externalAccountEmail: profileEmail,
      })
    },

    async disconnect(ctx) {
      const tokens = await getDecryptedTokens({ userId: ctx.userId, provider: 'google_gmail' })
      if (tokens?.refresh_token) {
        // Best-effort revocation. Don't fail disconnect if Google is slow.
        try {
          await fetch(GOOGLE_REVOKE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: tokens.refresh_token }).toString(),
          })
        } catch (err) {
          console.warn('[gmail] revoke failed (non-fatal)', err instanceof Error ? err.message : err)
        }
      }
      await markDisconnected({ userId: ctx.userId, provider: 'google_gmail' })
    },

    async sync(ctx: ProviderContext, opts: SyncOptions) {
      const accessToken = await ensureFreshAccessToken(ctx)
      if (!accessToken) throw new Error('gmail_not_connected')

      const limit = Math.max(1, Math.min(opts.limit ?? env.gmailDefaultLimit, env.gmailSyncMaxLimit))
      const q = 'is:important OR is:unread'
      const list = await listMessageIds({ accessToken, q, limit })
      const objects: SalesObject[] = []
      for (const item of list) {
        const meta = await fetchMessageMetadata({ accessToken, id: item.id })
        if (!meta) continue
        const fromHeader = headerValue(meta, 'From')
        const subject = headerValue(meta, 'Subject') ?? '(no subject)'
        const dateHeader = headerValue(meta, 'Date')
        const from = parseFromHeader(fromHeader)
        const labels = meta.labelIds ?? []
        const isUnread = labels.includes('UNREAD')
        const isImportant = labels.includes('IMPORTANT')
        const receivedAt = meta.internalDate
          ? new Date(Number(meta.internalDate)).toISOString()
          : dateHeader
            ? new Date(dateHeader).toISOString()
            : new Date().toISOString()
        const snippet = (meta.snippet ?? '').slice(0, 4000)
        objects.push({
          node_type: 'email',
          external_id: item.id,
          title: subject,
          body: snippet,
          status: 'open',
          tags: [
            ...(isUnread ? ['unread'] : []),
            ...(isImportant ? ['important'] : []),
          ],
          external_url: `https://mail.google.com/mail/u/0/#inbox/${item.id}`,
          received_at: receivedAt,
          metadata: {
            source_provider: 'gmail',
            external_id: item.id,
            external_url: `https://mail.google.com/mail/u/0/#inbox/${item.id}`,
            received_at: receivedAt,
            from_name: from.name,
            from_email: from.email,
            subject,
            snippet,
            is_unread: isUnread,
            is_important: isImportant,
            thread_id: item.threadId,
            labels,
          },
        })
      }
      return {
        objects,
        cursor_watermark: list.length > 0 ? list[0].id : null,
      }
    },
  }
}
