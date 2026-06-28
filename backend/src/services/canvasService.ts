import { queryOne } from './db'

/**
 * Resolve the primary canvas for a workspace. Creates one on demand if the
 * workspace was set up without a canvas row (defensive; signup seeds one).
 */
export async function resolveCanvasId(workspaceId: string): Promise<string> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM canvases WHERE workspace_id = $1 ORDER BY created_at LIMIT 1`,
    [workspaceId]
  )
  if (existing) return existing.id
  const created = await queryOne<{ id: string }>(
    `INSERT INTO canvases (workspace_id, name) VALUES ($1, 'Main board') RETURNING id`,
    [workspaceId]
  )
  if (!created) throw new Error('canvas_create_failed')
  return created.id
}
