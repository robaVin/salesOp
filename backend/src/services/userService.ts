import { query, queryOne, withTransaction } from './db'
import { hashPassword } from './auth'
import { seedStarterWorkspace } from './starterSeed'

export interface UserRow {
  id: string
  workspace_id: string
  name: string
  email: string
  role: 'manager' | 'ae' | 'sdr' | 'admin'
  password_hash: string | null
  email_verified: boolean
  last_login_at: Date | null
  google_sub: string | null
  avatar_url: string | null
  created_at: Date
}

export interface PublicUser {
  id: string
  workspace_id: string
  name: string
  email: string
  role: UserRow['role']
  avatar_url: string | null
}

export function toPublic(row: UserRow): PublicUser {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatar_url: row.avatar_url,
  }
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email.trim()]
  )
}

export async function findUserById(id: string): Promise<UserRow | null> {
  return queryOne<UserRow>(`SELECT * FROM users WHERE id = $1`, [id])
}

export async function touchLastLogin(userId: string): Promise<void> {
  await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId])
}

export async function findUserByGoogleSub(sub: string): Promise<UserRow | null> {
  return queryOne<UserRow>(`SELECT * FROM users WHERE google_sub = $1 LIMIT 1`, [sub])
}

export async function linkGoogleAccount(params: {
  userId: string
  googleSub: string
  avatarUrl?: string | null
  markVerified: boolean
}): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `UPDATE users
       SET google_sub = $2,
           avatar_url = COALESCE($3, avatar_url),
           email_verified = email_verified OR $4,
           last_login_at = NOW()
       WHERE id = $1
       RETURNING *`,
    [params.userId, params.googleSub, params.avatarUrl ?? null, params.markVerified]
  )
}

/**
 * Provision a new workspace + user for a Google profile. Mirrors signup() but
 * skips the password hash and pre-fills email/name/avatar from the OAuth
 * profile.
 */
export async function signupWithGoogle(params: {
  email: string
  name: string
  googleSub: string
  avatarUrl?: string | null
  emailVerified: boolean
}): Promise<UserRow> {
  return withTransaction(async (client) => {
    const wsRes = await client.query(
      `INSERT INTO workspaces (slug, name)
       VALUES ($1, $2)
       RETURNING id`,
      [
        await uniqueSlug(client, makeSlugInternal(params.name)),
        `${params.name}'s workspace`,
      ]
    )
    const workspaceId = wsRes.rows[0].id as string

    const userRes = await client.query(
      `INSERT INTO users
         (workspace_id, name, email, role, password_hash, email_verified,
          last_login_at, google_sub, avatar_url)
       VALUES ($1,$2,$3,'admin',NULL,$4,NOW(),$5,$6)
       RETURNING *`,
      [
        workspaceId,
        params.name,
        params.email.toLowerCase(),
        params.emailVerified,
        params.googleSub,
        params.avatarUrl ?? null,
      ]
    )

    const canvasRes = await client.query<{ id: string }>(
      `INSERT INTO canvases (workspace_id, name) VALUES ($1, 'Main board') RETURNING id`,
      [workspaceId]
    )
    await seedStarterWorkspace(client, workspaceId, canvasRes.rows[0].id)

    return userRes.rows[0] as UserRow
  })
}

function makeSlugInternal(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return base || 'workspace'
}

export interface SignupInput {
  email: string
  password: string
  name: string
  workspaceName?: string
}

/**
 * Create a new workspace and a user inside it. The user becomes the
 * workspace admin. Each signup gets its own private workspace — team
 * invitations are a V2 feature.
 */
export async function signup(input: SignupInput): Promise<UserRow> {
  const email = input.email.trim().toLowerCase()
  const password_hash = await hashPassword(input.password)
  const slug = makeSlug(input.workspaceName ?? input.name)

  return withTransaction(async (client) => {
    const wsRes = await client.query(
      `INSERT INTO workspaces (slug, name)
       VALUES ($1, $2)
       RETURNING id`,
      [await uniqueSlug(client, slug), input.workspaceName ?? `${input.name}'s workspace`]
    )
    const workspaceId = wsRes.rows[0].id as string

    const userRes = await client.query(
      `INSERT INTO users (workspace_id, name, email, role, password_hash, email_verified, last_login_at)
       VALUES ($1, $2, $3, 'admin', $4, FALSE, NOW())
       RETURNING *`,
      [workspaceId, input.name, email, password_hash]
    )

    // Seed the new workspace with a starter canvas + home nodes + a few
    // demo nodes so the user lands on a board that already feels alive.
    const canvasRes = await client.query<{ id: string }>(
      `INSERT INTO canvases (workspace_id, name) VALUES ($1, 'Main board') RETURNING id`,
      [workspaceId]
    )
    await seedStarterWorkspace(client, workspaceId, canvasRes.rows[0].id)

    return userRes.rows[0] as UserRow
  })
}

function makeSlug(name: string): string {
  return makeSlugInternal(name)
}

async function uniqueSlug(
  client: import('pg').PoolClient,
  base: string
): Promise<string> {
  let candidate = base
  for (let i = 0; i < 50; i++) {
    const existing = await client.query(`SELECT id FROM workspaces WHERE slug = $1`, [candidate])
    if (existing.rowCount === 0) return candidate
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`
  }
  return `${base}-${Date.now()}`
}
