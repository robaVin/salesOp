import { Router, Request, Response } from 'express'
import { query } from '../services/db'

export const auditRouter = Router()

interface AuditRow {
  id: string
  actor_user_id: string | null
  actor_role: string | null
  action: string
  entity_type: string
  entity_id: string | null
  metadata_json: Record<string, unknown>
  created_at: Date
}

auditRouter.get('/audit-log', async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 500)
  const rows = await query<AuditRow>(
    `SELECT id, actor_user_id, actor_role, action, entity_type, entity_id,
            metadata_json, created_at
     FROM audit_log
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [req.workspaceId, limit]
  )
  res.json({ data: rows, count: rows.length })
})
