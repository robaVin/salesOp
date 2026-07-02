import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { query, queryOne } from '../services/db'
import { writeAudit } from '../services/auditLog'
import { resolveCanvasId } from '../services/canvasService'
import { getRoutine, listRoutines } from '../automations/registry'
import { childTypesForZone, positionInsideZone, zoneForNodeType } from '../services/layoutStrategy'

export const automationsRouter = Router()

const runSchema = z.object({
  routine_key: z.string().min(1),
  trigger_type: z.enum(['hotkey', 'manual', 'palette', 'email', 'schedule']).default('manual'),
  trigger_payload: z.record(z.unknown()).default({}),
  position: z
    .object({ x: z.number(), y: z.number() })
    .optional(),
})

automationsRouter.get('/automations/routines', (_req: Request, res: Response) => {
  res.json({
    data: listRoutines().map((r) => ({
      key: r.key,
      display_name: r.displayName,
      description: r.description,
      read_only: r.readOnly,
    })),
  })
})

automationsRouter.get('/automations/runs', async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 100)
  const rows = await query(
    `SELECT id, routine_key, trigger_type, status, result_json, created_note_id, error,
            created_at, completed_at
     FROM automation_runs
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [req.workspaceId, limit]
  )
  res.json({ data: rows, count: rows.length })
})

automationsRouter.post('/automations/run', async (req: Request, res: Response) => {
  const parsed = runSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', detail: parsed.error.issues })
    return
  }
  const routine = getRoutine(parsed.data.routine_key)
  if (!routine) {
    res.status(404).json({ error: 'routine_not_found' })
    return
  }

  const workspaceId = req.workspaceId!
  const canvasId = await resolveCanvasId(workspaceId)

  await query(
    `INSERT INTO automation_events
       (workspace_id, routine_key, trigger_type, trigger_payload_json)
     VALUES ($1,$2,$3,$4::jsonb)`,
    [
      workspaceId,
      routine.key,
      parsed.data.trigger_type,
      JSON.stringify(parsed.data.trigger_payload),
    ]
  )

  const runRow = await queryOne<{ id: string }>(
    `INSERT INTO automation_runs
       (workspace_id, routine_key, trigger_type, trigger_payload_json, status)
     VALUES ($1,$2,$3,$4::jsonb,'running')
     RETURNING id`,
    [
      workspaceId,
      routine.key,
      parsed.data.trigger_type,
      JSON.stringify(parsed.data.trigger_payload),
    ]
  )
  if (!runRow) {
    res.status(500).json({ error: 'run_record_failed' })
    return
  }

  const result = await routine.run({
    workspaceId,
    triggerType: parsed.data.trigger_type,
    triggerPayload: parsed.data.trigger_payload,
  })

  let noteId: string | null = null
  if (result.note) {
    // Default placement: next free slot inside the Automation zone.
    let position = parsed.data.position
    if (!position) {
      const siblingTypes = childTypesForZone(zoneForNodeType('automation_result'))
      const countRow = await queryOne<{ n: string }>(
        `SELECT count(*)::text AS n FROM canvas_nodes
         WHERE workspace_id = $1 AND node_type = ANY($2::text[])`,
        [workspaceId, siblingTypes]
      )
      position = positionInsideZone('automation_result', Number(countRow?.n ?? 0))
    }
    const noteRow = await queryOne<{ id: string }>(
      `INSERT INTO canvas_nodes
         (workspace_id, canvas_id, node_type, title, body, status, tags_json,
          position_x, position_y, width, height, source_type, source_id, metadata_json)
       VALUES ($1,$2,'automation_result',$3,$4,$5,$6::jsonb,$7,$8,260,180,'automation',$9,$10::jsonb)
       RETURNING id`,
      [
        workspaceId,
        canvasId,
        result.note.title,
        result.note.body,
        result.note.status,
        JSON.stringify(result.note.tags ?? []),
        position.x,
        position.y,
        runRow.id,
        JSON.stringify({ routine_key: routine.key, run_id: runRow.id }),
      ]
    )
    noteId = noteRow?.id ?? null
  }

  await query(
    `UPDATE automation_runs
     SET status = $2, result_json = $3::jsonb, created_note_id = $4, error = $5,
         completed_at = NOW()
     WHERE id = $1`,
    [
      runRow.id,
      result.status,
      JSON.stringify(result.result),
      noteId,
      result.error ?? null,
    ]
  )

  await writeAudit({
    workspaceId,
    actorUserId: req.userId,
    actorRole: req.role,
    action: `automation.${routine.key}.${result.status}`,
    entityType: 'automation_run',
    entityId: runRow.id,
    metadata: {
      routine_key: routine.key,
      trigger_type: parsed.data.trigger_type,
      read_only: routine.readOnly,
      note_id: noteId,
    },
  })

  res.json({
    run_id: runRow.id,
    status: result.status,
    created_note_id: noteId,
    result: result.result,
    error: result.error ?? null,
  })
})
