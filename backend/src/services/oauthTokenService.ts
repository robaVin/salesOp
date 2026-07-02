import { query, queryOne } from './db'
import { decrypt, encrypt } from './tokenEncryption'

export interface OauthTokenRow {
  id: string
  workspace_id: string
  user_id: string
  provider: string
  scopes: string
  access_token_encrypted: string
  refresh_token_encrypted: string | null
  expires_at: Date | null
  external_account_email: string | null
  connected_at: Date
  disconnected_at: Date | null
  last_used_at: Date | null
}

export interface DecryptedTokens {
  access_token: string
  refresh_token: string | null
  expires_at: Date | null
  scopes: string
  external_account_email: string | null
}

export async function getTokens(params: {
  userId: string
  provider: string
}): Promise<OauthTokenRow | null> {
  return queryOne<OauthTokenRow>(
    `SELECT * FROM user_oauth_tokens
     WHERE user_id = $1 AND provider = $2 AND disconnected_at IS NULL
     LIMIT 1`,
    [params.userId, params.provider]
  )
}

export async function getDecryptedTokens(params: {
  userId: string
  provider: string
}): Promise<DecryptedTokens | null> {
  const row = await getTokens(params)
  if (!row) return null
  return {
    access_token: decrypt(row.access_token_encrypted),
    refresh_token: row.refresh_token_encrypted ? decrypt(row.refresh_token_encrypted) : null,
    expires_at: row.expires_at,
    scopes: row.scopes,
    external_account_email: row.external_account_email,
  }
}

export async function upsertTokens(params: {
  workspaceId: string
  userId: string
  provider: string
  scopes: string
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  externalAccountEmail: string | null
}): Promise<OauthTokenRow> {
  const accessEnc = encrypt(params.accessToken)
  const refreshEnc = params.refreshToken ? encrypt(params.refreshToken) : null

  // Preserve an existing refresh_token if the new response doesn't include one
  // (Google only returns refresh_token on the first consent unless prompt=consent).
  const row = await queryOne<OauthTokenRow>(
    `INSERT INTO user_oauth_tokens
       (workspace_id, user_id, provider, scopes, access_token_encrypted,
        refresh_token_encrypted, expires_at, external_account_email, connected_at, disconnected_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NULL)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       scopes = EXCLUDED.scopes,
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       refresh_token_encrypted = COALESCE(EXCLUDED.refresh_token_encrypted, user_oauth_tokens.refresh_token_encrypted),
       expires_at = EXCLUDED.expires_at,
       external_account_email = COALESCE(EXCLUDED.external_account_email, user_oauth_tokens.external_account_email),
       connected_at = COALESCE(user_oauth_tokens.connected_at, NOW()),
       disconnected_at = NULL
     RETURNING *`,
    [
      params.workspaceId,
      params.userId,
      params.provider,
      params.scopes,
      accessEnc,
      refreshEnc,
      params.expiresAt,
      params.externalAccountEmail,
    ]
  )
  if (!row) throw new Error('upsertTokens: no row returned')
  return row
}

export async function markDisconnected(params: {
  userId: string
  provider: string
}): Promise<void> {
  await query(
    `UPDATE user_oauth_tokens
     SET disconnected_at = NOW(),
         access_token_encrypted = '',
         refresh_token_encrypted = NULL
     WHERE user_id = $1 AND provider = $2 AND disconnected_at IS NULL`,
    [params.userId, params.provider]
  )
}

export async function updateAccessToken(params: {
  userId: string
  provider: string
  accessToken: string
  expiresAt: Date | null
}): Promise<void> {
  await query(
    `UPDATE user_oauth_tokens
     SET access_token_encrypted = $3, expires_at = $4, last_used_at = NOW()
     WHERE user_id = $1 AND provider = $2 AND disconnected_at IS NULL`,
    [params.userId, params.provider, encrypt(params.accessToken), params.expiresAt]
  )
}

export async function touchUsed(params: { userId: string; provider: string }): Promise<void> {
  await query(
    `UPDATE user_oauth_tokens SET last_used_at = NOW()
     WHERE user_id = $1 AND provider = $2 AND disconnected_at IS NULL`,
    [params.userId, params.provider]
  )
}
