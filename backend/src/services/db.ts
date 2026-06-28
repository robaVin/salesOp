import { Pool, PoolClient } from 'pg'
import { env } from '../config/env'

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

pool.on('error', (err) => {
  console.error('[db] pool error:', err.message)
})

export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  const client = await pool.connect()
  try {
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    client.release()
  }
}

export async function queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

let cachedWorkspaceId: string | null = null

export async function getDefaultWorkspaceId(): Promise<string> {
  if (cachedWorkspaceId) return cachedWorkspaceId
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM workspaces WHERE slug = $1 LIMIT 1',
    [env.defaultWorkspaceSlug]
  )
  if (!row) {
    throw new Error(`Workspace ${env.defaultWorkspaceSlug} not seeded. Run db:apply + db:seed.`)
  }
  cachedWorkspaceId = row.id
  return row.id
}

export async function getDefaultCanvasId(workspaceId: string): Promise<string> {
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM canvases WHERE workspace_id = $1 ORDER BY created_at LIMIT 1',
    [workspaceId]
  )
  if (!row) {
    throw new Error('No canvas seeded for workspace.')
  }
  return row.id
}

export async function getDefaultUserId(workspaceId: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE workspace_id = $1 ORDER BY created_at LIMIT 1',
    [workspaceId]
  )
  return row?.id ?? null
}

export async function healthCheck(): Promise<boolean> {
  try {
    const row = await queryOne<{ ok: number }>('SELECT 1 AS ok')
    return row?.ok === 1
  } catch {
    return false
  }
}
