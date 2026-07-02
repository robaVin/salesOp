import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { query, queryOne } from '../services/db'
import { writeAudit } from '../services/auditLog'
import { resolveCanvasId } from '../services/canvasService'
import { summarizeForContext } from '../services/aiSummarize'
import { childTypesForZone, positionInsideZone, zoneForNodeType } from '../services/layoutStrategy'

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
  // Feature 1: ingested via SourceProvider (Gmail today)
  'email',
  // Canvas Zones — first-class containers on the canvas
  'home_zone',
  'email_zone',
  'notes_zone',
  'tasks_zone',
  'automation_zone',
] as const

const STATUSES = ['open', 'in_progress', 'resolved', 'dismissed', 'needs_review'] as const

const createSchema = z.object({
  node_type: z.enum(NODE_TYPES),
  title: z.string().min(1).max(280),
  body: z.string().default(''),
  status: z.enum(STATUSES).default('open'),
  tags: z.array(z.string()).default([]),
  // When omitted, the server places the node inside its home zone
  // (see layoutStrategy). Explicit coordinates always win.
  position_x: z.number().optional(),
  position_y: z.number().optional(),
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
     WHERE workspace_id = $1 AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [req.workspaceId]
  )
  res.json({ data: rows, count: rows.length })
})

// Trash bin — soft-deleted nodes, most-recently-trashed first. Defined before
// '/notes/:id' so the literal path isn't captured by the :id param.
notesRouter.get('/notes/trash', async (req: Request, res: Response) => {
  const rows = await query<NodeRow & { deleted_at: Date }>(
    `SELECT id, workspace_id, canvas_id, node_type, title, body, status,
            tags_json, position_x, position_y, width, height,
            source_type, source_id, metadata_json, created_at, updated_at, deleted_at
     FROM canvas_nodes
     WHERE workspace_id = $1 AND deleted_at IS NOT NULL
     ORDER BY deleted_at DESC`,
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

  // Zone-aware placement: nodes created without explicit coordinates land in
  // the next free slot of their home zone (notes → Notes, emails → Email, …).
  let posX = input.position_x
  let posY = input.position_y
  if (posX === undefined || posY === undefined) {
    const siblingTypes = childTypesForZone(zoneForNodeType(input.node_type))
    const countRow = await queryOne<{ n: string }>(
      `SELECT count(*)::text AS n FROM canvas_nodes
       WHERE workspace_id = $1 AND node_type = ANY($2::text[])`,
      [workspaceId, siblingTypes]
    )
    const pos = positionInsideZone(input.node_type, Number(countRow?.n ?? 0))
    posX = posX ?? pos.x
    posY = posY ?? pos.y
  }

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
      posX,
      posY,
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

// Soft delete — moves the node to the trash. It disappears from the canvas but
// stays recoverable via /restore until permanently purged. This is the default
// destructive action everywhere in the UI (Inspector, palette): never a hard
// delete without explicit confirmation.
notesRouter.delete('/notes/:id', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId!
  const before = await queryOne<NodeRow>(
    `SELECT * FROM canvas_nodes WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
    [req.params.id, workspaceId]
  )
  if (!before) {
    res.status(404).json({ error: 'note_not_found' })
    return
  }
  await query(
    `UPDATE canvas_nodes SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND workspace_id = $2`,
    [req.params.id, workspaceId]
  )
  await writeAudit({
    workspaceId,
    actorUserId: req.userId,
    actorRole: req.role,
    action: 'note.trash',
    entityType: 'canvas_node',
    entityId: before.id,
    beforeJson: before,
  })
  res.status(204).end()
})

// Restore — bring a trashed node back to the canvas.
notesRouter.post('/notes/:id/restore', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId!
  const before = await queryOne<NodeRow>(
    `SELECT * FROM canvas_nodes WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NOT NULL`,
    [req.params.id, workspaceId]
  )
  if (!before) {
    res.status(404).json({ error: 'note_not_in_trash' })
    return
  }
  const after = await queryOne<NodeRow>(
    `UPDATE canvas_nodes SET deleted_at = NULL, updated_at = NOW()
     WHERE id = $1 AND workspace_id = $2
     RETURNING *`,
    [req.params.id, workspaceId]
  )
  await writeAudit({
    workspaceId,
    actorUserId: req.userId,
    actorRole: req.role,
    action: 'note.restore',
    entityType: 'canvas_node',
    entityId: before.id,
    beforeJson: before,
    afterJson: after,
  })
  res.json(after)
})

// Permanent delete — hard removal. Only reachable from the Trash bin after an
// explicit client-side confirmation. Requires the node to already be trashed,
// so a node can never be hard-deleted in a single step.
notesRouter.delete('/notes/:id/permanent', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId!
  const before = await queryOne<NodeRow>(
    `SELECT * FROM canvas_nodes WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NOT NULL`,
    [req.params.id, workspaceId]
  )
  if (!before) {
    res.status(404).json({ error: 'note_not_in_trash' })
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
    action: 'note.purge',
    entityType: 'canvas_node',
    entityId: before.id,
    beforeJson: before,
  })
  res.status(204).end()
})

// Lazy AI summary for a node. Cached in metadata_json.ai_summary so subsequent
// opens (or re-syncs of the same object) don't re-hit the model. Used by the
// Email renderer's Detail view on first open, but the endpoint is generic —
// any node type can call it. Meetings and voice notes will reuse this in later
// features.
notesRouter.post('/notes/:id/ai-summarize', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId!
  const note = await queryOne<NodeRow>(
    `SELECT * FROM canvas_nodes WHERE id = $1 AND workspace_id = $2`,
    [req.params.id, workspaceId]
  )
  if (!note) {
    res.status(404).json({ error: 'note_not_found' })
    return
  }

  const meta = (note.metadata_json ?? {}) as Record<string, unknown>
  const existing = typeof meta.ai_summary === 'string' ? meta.ai_summary : null
  if (existing && existing.length > 0) {
    res.json({
      summary: existing,
      cached: true,
      mocked: Boolean(meta.ai_summary_mocked),
      generated_at: typeof meta.ai_summary_generated_at === 'string'
        ? meta.ai_summary_generated_at
        : null,
    })
    return
  }

  // Choose what text to summarize. For emails, prefer subject + snippet from
  // metadata; for other node types, fall back to title + body.
  const isEmail = note.node_type === 'email'
  const purpose: 'email' | 'note' | 'meeting' =
    isEmail ? 'email' : note.node_type === 'meeting' ? 'meeting' : 'note'
  const subject = typeof meta.subject === 'string' ? meta.subject : ''
  const snippet = typeof meta.snippet === 'string' ? meta.snippet : ''
  const inputParts = [
    subject || note.title,
    snippet || note.body,
  ].filter((s) => s && s.length > 0)
  const text = inputParts.join('\n\n')
  if (!text) {
    res.status(400).json({ error: 'nothing_to_summarize' })
    return
  }

  try {
    const result = await summarizeForContext({ workspaceId, text, purpose })
    const generatedAt = new Date().toISOString()
    const nextMeta = {
      ...meta,
      ai_summary: result.summary,
      ai_summary_generated_at: generatedAt,
      ai_summary_mocked: result.mocked,
    }
    await query(
      `UPDATE canvas_nodes SET metadata_json = $1::jsonb, updated_at = NOW()
       WHERE id = $2 AND workspace_id = $3`,
      [JSON.stringify(nextMeta), note.id, workspaceId]
    )
    res.json({
      summary: result.summary,
      cached: false,
      mocked: result.mocked,
      generated_at: generatedAt,
    })
  } catch (err) {
    res.status(500).json({
      error: 'summarize_failed',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
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
