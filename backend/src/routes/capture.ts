import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { env } from '../config/env'
import { queryOne } from '../services/db'
import { writeAudit } from '../services/auditLog'
import { summarizeText } from '../services/aiSummarize'
import { resolveCanvasId } from '../services/canvasService'
import { findUserByEmail } from '../services/userService'

export const captureRouter = Router()

const captureSchema = z.object({
  text: z.string().min(1).max(20_000),
  source_url: z.string().max(2048).optional(),
  source_title: z.string().max(280).optional(),
  source_kind: z.string().max(40).optional(),
})

interface NoteRow {
  id: string
  node_type: string
  title: string
  body: string
  status: string
  tags_json: string[]
  position_x: number
  position_y: number
  metadata_json: Record<string, unknown>
  created_at: Date
}

// Captures land in a vertical "inbox" column on the left of the canvas — close
// to origin so they're visible on a fresh empty canvas, and predictable so the
// frontend can auto-pan to them.
const CAPTURE_INBOX_X = 80
const CAPTURE_INBOX_Y_BASE = 80
const CAPTURE_INBOX_SPACING = 200
const CAPTURE_INBOX_COLUMN_COUNT = 12
let captureCounter = 0

/**
 * Dev-only fallback: when the request arrives with no auth context and
 * `DEV_CAPTURE_NO_AUTH=true` is set in env, look up the configured fallback
 * user and pretend the request came from them. Production-safe because env.ts
 * forces this flag to false when NODE_ENV=production.
 */
async function resolveDevFallback(): Promise<{
  workspaceId: string
  userId: string
  role: string
} | null> {
  if (!env.devCaptureNoAuth) return null
  if (!env.devCaptureUserEmail) return null
  const user = await findUserByEmail(env.devCaptureUserEmail)
  if (!user) return null
  return {
    workspaceId: user.workspace_id,
    userId: user.id,
    role: user.role,
  }
}

captureRouter.post('/capture', async (req: Request, res: Response) => {
  const parsed = captureSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', detail: parsed.error.issues })
    return
  }

  // Auth: real session/token first, then dev fallback if enabled.
  let workspaceId = req.workspaceId
  let userId = req.userId
  let role = req.role
  let usingDevFallback = false
  if (!workspaceId) {
    const fallback = await resolveDevFallback()
    if (fallback) {
      workspaceId = fallback.workspaceId
      userId = fallback.userId
      role = fallback.role
      usingDevFallback = true
    } else {
      res.status(401).json({ error: 'unauthenticated' })
      return
    }
  }

  const canvasId = await resolveCanvasId(workspaceId)

  let summary
  try {
    summary = await summarizeText({ workspaceId, text: parsed.data.text })
  } catch (err) {
    res
      .status(500)
      .json({ error: 'summarize_failed', detail: err instanceof Error ? err.message : String(err) })
    return
  }

  const slot = captureCounter % (CAPTURE_INBOX_COLUMN_COUNT * 2)
  const column = Math.floor(slot / CAPTURE_INBOX_COLUMN_COUNT) // 0 or 1
  const row = slot % CAPTURE_INBOX_COLUMN_COUNT
  const x = CAPTURE_INBOX_X + column * 280
  const y = CAPTURE_INBOX_Y_BASE + row * CAPTURE_INBOX_SPACING
  captureCounter += 1

  const metadata: Record<string, unknown> = {
    captured: true,
    captured_at: new Date().toISOString(),
    captured_via:
      req.authVia === 'token'
        ? 'extension'
        : usingDevFallback
          ? 'dev_fallback'
          : 'web',
  }
  if (parsed.data.source_url) metadata.source_url = parsed.data.source_url
  if (parsed.data.source_title) metadata.source_title = parsed.data.source_title
  if (parsed.data.source_kind) metadata.source_kind = parsed.data.source_kind

  const tags = Array.from(new Set([...(summary.tags ?? []), 'captured']))

  const note = await queryOne<NoteRow>(
    `INSERT INTO canvas_nodes
       (workspace_id, canvas_id, node_type, title, body, status, tags_json,
        position_x, position_y, width, height, source_type, source_id, metadata_json)
     VALUES ($1,$2,$3,$4,$5,'open',$6::jsonb,$7,$8,260,180,'capture',$9,$10::jsonb)
     RETURNING id, node_type, title, body, status, tags_json, position_x, position_y,
               metadata_json, created_at`,
    [
      workspaceId,
      canvasId,
      summary.node_type,
      summary.title,
      summary.body,
      JSON.stringify(tags),
      x,
      y,
      parsed.data.source_url ?? null,
      JSON.stringify(metadata),
    ]
  )

  if (!note) {
    res.status(500).json({ error: 'note_insert_failed' })
    return
  }

  await writeAudit({
    workspaceId,
    actorUserId: userId,
    actorRole: role,
    action: 'capture.create',
    entityType: 'canvas_node',
    entityId: note.id,
    metadata: {
      source_kind: parsed.data.source_kind ?? null,
      source_url: parsed.data.source_url ?? null,
      api_token_id: req.apiTokenId ?? null,
      auth_via: req.authVia ?? (usingDevFallback ? 'dev_fallback' : 'unknown'),
      mocked: summary.mocked,
      cached: summary.cached,
    },
  })

  res.status(201).json({ note, summary })
})
