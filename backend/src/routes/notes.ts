import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { query, queryOne } from '../services/db'
import { writeAudit } from '../services/auditLog'
import { resolveCanvasId } from '../services/canvasService'

export const notesRouter = Router()

const NODE_TYPES = [
  // existing
  'prospect',
  'account',
  'call_summary',
  'followup',
  'objection',
  'email_draft',
  'linkedin_draft',
  'automation_result',
  'task',
  'general_note',
  'box',
  // phase 1 spatial node taxonomy
  'daily_briefing',
  'command_center',
  'automation_hub',
  'stripe',
  'search',
  'ai_assistant',
  'inbox',
  'settings',
  'voice_note',
  'screenshot',
  'meeting',
  'capture',
] as const

const STATUSES = ['open', 'in_progress', 'resolved', 'dismissed', 'needs_review'] as const

const createSchema = z.object({
  node_type: z.enum(NODE_TYPES),
  title: z.string().min(1).max(280),
  body: z.string().default(''),
  status: z.enum(STATUSES).default('open'),
  tags: z.array(z.string()).default([]),
  position_x: z.number().default(0),
  position_y: z.number().default(0),
  width: z.number().default(260),
  height: z.number().default(160),
  source_type: z.string().nullish(),
  source_id: z.string().nullish(),
  metadata: z.record(z.unknown()).default({}),
})

const patchSchema = z.object({
  title: z.string().min(1).max(280).optional(),
  body: z.string().optional(),
  status: z.enum(STATUSES).optional(),
  tags: z.array(z.string()).optional(),
  position_x: z.number().optional(),
  position_y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  node_type: z.enum(NODE_TYPES).optional(),
  metadata: z.record(z.unknown()).optional(),
})

interface NodeRow {
  id: string
  workspace_id: string
  canvas_id: string
  node_type: string
  title: string
  body: string
  status: string
  tags_json: string[]
  position_x: number
  position_y: number
  width: number
  height: number
  source_type: string | null
  source_id: string | null
  metadata_json: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

notesRouter.get('/notes', async (req: Request, res: Response) => {
  const rows = await query<NodeRow>(
    `SELECT id, workspace_id, canvas_id, node_type, title, body, status,
            tags_json, position_x, position_y, width, height,
            source_type, source_id, metadata_json, created_at, updated_at
     FROM canvas_nodes
     WHERE workspace_id = $1
     ORDER BY created_at ASC`,
    [req.workspaceId]
  )
  res.json({ data: rows, count: rows.length })
})

notesRouter.get('/notes/:id', async (req: Request, res: Response) => {
  const row = await queryOne<NodeRow>(
    `SELECT * FROM canvas_nodes WHERE id = $1 AND workspace_id = $2`,
    [req.params.id, req.workspaceId]
  )
  if (!row) {
    res.status(404).json({ error: 'note_not_found' })
    return
  }
  res.json(row)
})

notesRouter.post('/notes', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', detail: parsed.error.issues })
    return
  }
  const input = parsed.data
  const workspaceId = req.workspaceId!
  const canvasId = await resolveCanvasId(workspaceId)
  const row = await queryOne<NodeRow>(
    `INSERT INTO canvas_nodes
       (workspace_id, canvas_id, node_type, title, body, status, tags_json,
        position_x, position_y, width, height, source_type, source_id, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14::jsonb)
     RETURNING *`,
    [
      workspaceId,
      canvasId,
      input.node_type,
      input.title,
      input.body,
      input.status,
      JSON.stringify(input.tags),
      input.position_x,
      input.position_y,
      input.width,
      input.height,
      input.source_type ?? null,
      input.source_id ?? null,
      JSON.stringify(input.metadata),
    ]
  )
  if (!row) {
    res.status(500).json({ error: 'insert_failed' })
    return
  }
  await writeAudit({
    workspaceId,
    actorUserId: req.userId,
    actorRole: req.role,
    action: 'note.create',
    entityType: 'canvas_node',
    entityId: row.id,
    afterJson: row,
  })
  res.status(201).json(row)
})

notesRouter.patch('/notes/:id', async (req: Request, res: Response) => {
  const parsed = patchSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', detail: parsed.error.issues })
    return
  }
  const workspaceId = req.workspaceId!
  const before = await queryOne<NodeRow>(
    `SELECT * FROM canvas_nodes WHERE id = $1 AND workspace_id = $2`,
    [req.params.id, workspaceId]
  )
  if (!before) {
    res.status(404).json({ error: 'note_not_found' })
    return
  }

  const updates: string[] = []
  const values: unknown[] = []
  let i = 1
  const push = (col: string, val: unknown) => {
    updates.push(`${col} = $${i++}`)
    values.push(val)
  }

  const d = parsed.data
  if (d.title !== undefined) push('title', d.title)
  if (d.body !== undefined) push('body', d.body)
  if (d.status !== undefined) push('status', d.status)
  if (d.tags !== undefined) push('tags_json', JSON.stringify(d.tags))
  if (d.position_x !== undefined) push('position_x', d.position_x)
  if (d.position_y !== undefined) push('position_y', d.position_y)
  if (d.width !== undefined) push('width', d.width)
  if (d.height !== undefined) push('height', d.height)
  if (d.node_type !== undefined) push('node_type', d.node_type)
  if (d.metadata !== undefined) push('metadata_json', JSON.stringify(d.metadata))

  if (updates.length === 0) {
    res.json(before)
    return
  }
  updates.push('updated_at = NOW()')
  values.push(req.params.id, workspaceId)
  const idxId = i
  const idxWs = i + 1

  const after = await queryOne<NodeRow>(
    `UPDATE canvas_nodes SET ${updates.join(', ')}
     WHERE id = $${idxId} AND workspace_id = $${idxWs}
     RETURNING *`,
    values
  )

  const isPositionOnly =
    Object.keys(d).every((k) => k === 'position_x' || k === 'position_y') && Object.keys(d).length > 0
  if (after && !isPositionOnly) {
    await writeAudit({
      workspaceId,
      actorUserId: req.userId,
      actorRole: req.role,
      action: d.status ? `note.status.${d.status}` : 'note.update',
      entityType: 'canvas_node',
      entityId: after.id,
      beforeJson: before,
      afterJson: after,
    })
  }
  res.json(after)
})

notesRouter.delete('/notes/:id', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId!
  const before = await queryOne<NodeRow>(
    `SELECT * FROM canvas_nodes WHERE id = $1 AND workspace_id = $2`,
    [req.params.id, workspaceId]
  )
  if (!before) {
    res.status(404).json({ error: 'note_not_found' })
    return
  }
  await query(`DELETE FROM canvas_nodes WHERE id = $1 AND workspace_id = $2`, [
    req.params.id,
    workspaceId,
  ])
  await writeAudit({
    workspaceId,
    actorUserId: req.userId,
    actorRole: req.role,
    action: 'note.delete',
    entityType: 'canvas_node',
    entityId: before.id,
    beforeJson: before,
  })
  res.status(204).end()
})

// ----- edges -----

const edgeSchema = z.object({
  source_node_id: z.string().uuid(),
  target_node_id: z.string().uuid(),
  label: z.string().optional().nullable(),
})

interface EdgeRow {
  id: string
  workspace_id: string
  canvas_id: string
  source_node_id: string
  target_node_id: string
  label: string | null
  created_at: Date
}

notesRouter.get('/edges', async (req: Request, res: Response) => {
  const rows = await query<EdgeRow>(
    `SELECT * FROM canvas_edges WHERE workspace_id = $1 ORDER BY created_at ASC`,
    [req.workspaceId]
  )
  res.json({ data: rows, count: rows.length })
})

notesRouter.post('/edges', async (req: Request, res: Response) => {
  const parsed = edgeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', detail: parsed.error.issues })
    return
  }
  const workspaceId = req.workspaceId!
  const canvasId = await resolveCanvasId(workspaceId)
  const row = await queryOne<EdgeRow>(
    `INSERT INTO canvas_edges
       (workspace_id, canvas_id, source_node_id, target_node_id, label)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [
      workspaceId,
      canvasId,
      parsed.data.source_node_id,
      parsed.data.target_node_id,
      parsed.data.label ?? null,
    ]
  )
  res.status(201).json(row)
})

notesRouter.delete('/edges/:id', async (req: Request, res: Response) => {
  await query(`DELETE FROM canvas_edges WHERE id = $1 AND workspace_id = $2`, [
    req.params.id,
    req.workspaceId,
  ])
  res.status(204).end()
})
