import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { query, queryOne } from '../services/db'
import { generateApiToken } from '../services/auth'
import { writeAudit } from '../services/auditLog'

export const apiTokensRouter = Router()

interface TokenRow {
  id: string
  name: string
  prefix: string
  last_used_at: Date | null
  revoked_at: Date | null
  created_at: Date
}

apiTokensRouter.get('/tokens', async (req: Request, res: Response) => {
  const rows = await query<TokenRow>(
    `SELECT id, name, prefix, last_used_at, revoked_at, created_at
     FROM api_tokens
     WHERE workspace_id = $1 AND user_id = $2
     ORDER BY created_at DESC`,
    [req.workspaceId, req.userId]
  )
  res.json({ data: rows, count: rows.length })
})

const createSchema = z.object({
  name: z.string().min(1).max(80),
})

apiTokensRouter.post('/tokens', async (req: Request, res: Response) => {
  // Bearer tokens cannot create new tokens — only cookie-authed sessions.
  if (req.authVia !== 'cookie') {
    res.status(403).json({ error: 'cookie_session_required' })
    return
  }
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', detail: parsed.error.issues })
    return
  }
  const t = generateApiToken()
  const row = await queryOne<TokenRow>(
    `INSERT INTO api_tokens (workspace_id, user_id, name, token_hash, prefix)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, name, prefix, last_used_at, revoked_at, created_at`,
    [req.workspaceId, req.userId, parsed.data.name, t.hash, t.prefix]
  )
  if (!row) {
    res.status(500).json({ error: 'insert_failed' })
    return
  }
  await writeAudit({
    workspaceId: req.workspaceId!,
    actorUserId: req.userId,
    actorRole: req.role,
    action: 'token.create',
    entityType: 'api_token',
    entityId: row.id,
    metadata: { name: row.name, prefix: row.prefix },
  })
  // The plaintext is returned ONCE.
  res.status(201).json({ token: row, plaintext: t.plaintext })
})

apiTokensRouter.delete('/tokens/:id', async (req: Request, res: Response) => {
  if (req.authVia !== 'cookie') {
    res.status(403).json({ error: 'cookie_session_required' })
    return
  }
  const row = await queryOne<{ id: string }>(
    `UPDATE api_tokens
     SET revoked_at = NOW()
     WHERE id = $1 AND workspace_id = $2 AND user_id = $3 AND revoked_at IS NULL
     RETURNING id`,
    [req.params.id, req.workspaceId, req.userId]
  )
  if (!row) {
    res.status(404).json({ error: 'token_not_found_or_revoked' })
    return
  }
  await writeAudit({
    workspaceId: req.workspaceId!,
    actorUserId: req.userId,
    actorRole: req.role,
    action: 'token.revoke',
    entityType: 'api_token',
    entityId: req.params.id,
  })
  res.status(204).end()
})
