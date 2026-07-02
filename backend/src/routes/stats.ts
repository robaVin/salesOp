import { Router, Request, Response } from 'express'
import { query } from '../services/db'

export const statsRouter = Router()

interface CountRow {
  c: string
}

statsRouter.get('/stats', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId!
  const [openFollowups, pendingDrafts, openObjections, stripeToday, atRiskAccounts] =
    await Promise.all([
      query<CountRow>(
        `SELECT count(*)::text AS c FROM canvas_nodes
         WHERE workspace_id = $1 AND node_type = 'followup'
           AND status IN ('open','in_progress','needs_review')
           AND deleted_at IS NULL`,
        [workspaceId]
      ),
      query<CountRow>(
        `SELECT count(*)::text AS c FROM canvas_nodes
         WHERE workspace_id = $1
           AND node_type IN ('email_draft','linkedin_draft')
           AND status = 'open'
           AND deleted_at IS NULL`,
        [workspaceId]
      ),
      query<CountRow>(
        `SELECT count(*)::text AS c FROM canvas_nodes
         WHERE workspace_id = $1 AND node_type = 'objection'
           AND status IN ('open','in_progress','needs_review')
           AND deleted_at IS NULL`,
        [workspaceId]
      ),
      query<CountRow>(
        `SELECT count(*)::text AS c FROM automation_runs
         WHERE workspace_id = $1 AND routine_key = 'stripe.connection.check'
           AND created_at > NOW() - INTERVAL '24 hours'`,
        [workspaceId]
      ),
      query<CountRow>(
        `SELECT count(*)::text AS c FROM canvas_nodes
         WHERE workspace_id = $1 AND node_type = 'account'
           AND status IN ('needs_review','in_progress')
           AND deleted_at IS NULL`,
        [workspaceId]
      ),
    ])

  res.json({
    open_followups: Number(openFollowups[0]?.c ?? 0),
    pending_drafts: Number(pendingDrafts[0]?.c ?? 0),
    open_objections: Number(openObjections[0]?.c ?? 0),
    stripe_checks_today: Number(stripeToday[0]?.c ?? 0),
    accounts_needing_attention: Number(atRiskAccounts[0]?.c ?? 0),
  })
})
