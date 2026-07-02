import { query, queryOne } from './db'
import { writeAudit } from './auditLog'
import { resolveCanvasId } from './canvasService'
import { getLayoutStrategy } from './layoutStrategy'
import type { SalesObject, SourceProvider, SyncOptions } from '../sources/types'

/**
 * Universal ingest orchestrator.
 *
 * Given a SourceProvider, it:
 *   1. Opens an object_syncs row (status='running').
 *   2. Calls provider.sync() to obtain SalesObjects.
 *   3. Upserts each object into canvas_nodes, deduping via
 *      (workspace_id, source_type, source_id) which is the unique index
 *      created in migration 005.
 *   4. Finishes the object_syncs row and writes an audit log entry.
 *
 * Position policy is delegated to LayoutStrategy — no per-provider knowledge
 * lives in this module.
 */

interface IngestResult {
  syncId: string
  status: 'success' | 'partial' | 'failed'
  objects_added: number
  objects_updated: number
  cursor_watermark: string | null
  error: string | null
}

export async function runProviderSync(params: {
  workspaceId: string
  userId: string
  provider: SourceProvider
  opts: SyncOptions
}): Promise<IngestResult> {
  const { workspaceId, userId, provider, opts } = params

  // 1. Open sync row
  const opened = await queryOne<{ id: string }>(
    `INSERT INTO object_syncs
       (workspace_id, user_id, source_provider, source_kind, status)
     VALUES ($1, $2, $3, $4, 'running')
     RETURNING id`,
    [workspaceId, userId, provider.key, provider.producesNodeType]
  )
  if (!opened) throw new Error('object_sync_insert_failed')
  const syncId = opened.id

  const canvasId = await resolveCanvasId(workspaceId)

  let added = 0
  let updated = 0
  let cursor: string | null = null
  let status: IngestResult['status'] = 'success'
  let errorMessage: string | null = null

  try {
    const result = await provider.sync({ workspaceId, userId }, opts)
    cursor = result.cursor_watermark

    let offset = await nextInboxOffset(workspaceId, provider.key)
    for (const obj of result.objects) {
      try {
        const { didInsert, didUpdate } = await upsertSalesObject({
          workspaceId,
          userId,
          canvasId,
          providerKey: provider.key,
          obj,
          offset,
        })
        if (didInsert) {
          added += 1
          offset += 1
        } else if (didUpdate) {
          updated += 1
        }
      } catch (perObjErr) {
        console.warn(
          '[objectIngest] per-object upsert failed',
          provider.key,
          obj.external_id,
          perObjErr instanceof Error ? perObjErr.message : perObjErr
        )
        status = 'partial'
      }
    }
  } catch (err) {
    status = 'failed'
    errorMessage = err instanceof Error ? err.message : String(err)
  }

  await query(
    `UPDATE object_syncs
     SET status = $2,
         finished_at = NOW(),
         objects_added = $3,
         objects_updated = $4,
         cursor_watermark = $5,
         error = $6
     WHERE id = $1`,
    [syncId, status, added, updated, cursor, errorMessage]
  )

  await writeAudit({
    workspaceId,
    actorUserId: userId,
    action: status === 'success' || status === 'partial'
      ? `source.${provider.key}.sync.${status}`
      : `source.${provider.key}.sync.failed`,
    entityType: 'object_sync',
    entityId: syncId,
    metadata: {
      source_provider: provider.key,
      objects_added: added,
      objects_updated: updated,
      // never log token/body-scoped content; counts + status only
    },
  })

  return {
    syncId,
    status,
    objects_added: added,
    objects_updated: updated,
    cursor_watermark: cursor,
    error: errorMessage,
  }
}

async function nextInboxOffset(workspaceId: string, providerKey: string): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM canvas_nodes
     WHERE workspace_id = $1 AND source_type = $2`,
    [workspaceId, providerKey]
  )
  return Number(row?.n ?? 0)
}

async function upsertSalesObject(params: {
  workspaceId: string
  userId: string
  canvasId: string
  providerKey: string
  obj: SalesObject
  offset: number
}): Promise<{ didInsert: boolean; didUpdate: boolean }> {
  const { workspaceId, userId, canvasId, providerKey, obj, offset } = params
  const pos = getLayoutStrategy().positionForIngestedObject({
    workspaceId,
    providerKey,
    offset,
    nodeType: obj.node_type,
  })

  // Try INSERT first. If it collides on the source-dedup index, fall back to
  // UPDATE (which lets us refresh title/body/tags/metadata on re-sync).
  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO canvas_nodes
       (workspace_id, canvas_id, node_type, title, body, status, tags_json,
        position_x, position_y, width, height,
        source_type, source_id, metadata_json, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, 300, 190, $10, $11, $12::jsonb, $13)
     ON CONFLICT (workspace_id, source_type, source_id)
       WHERE source_type IS NOT NULL AND source_id IS NOT NULL
       DO NOTHING
     RETURNING id`,
    [
      workspaceId,
      canvasId,
      obj.node_type,
      obj.title.slice(0, 280),
      obj.body.slice(0, 8000),
      obj.status ?? 'open',
      JSON.stringify(obj.tags ?? []),
      pos.x,
      pos.y,
      providerKey,
      obj.external_id,
      JSON.stringify(obj.metadata ?? {}),
      userId,
    ]
  )
  if (inserted) return { didInsert: true, didUpdate: false }

  // Existed already — refresh mutable fields.
  const updated = await queryOne<{ id: string }>(
    `UPDATE canvas_nodes
     SET title = $4,
         body = $5,
         tags_json = $6::jsonb,
         metadata_json = $7::jsonb,
         updated_at = NOW()
     WHERE workspace_id = $1 AND source_type = $2 AND source_id = $3
     RETURNING id`,
    [
      workspaceId,
      providerKey,
      obj.external_id,
      obj.title.slice(0, 280),
      obj.body.slice(0, 8000),
      JSON.stringify(obj.tags ?? []),
      JSON.stringify(obj.metadata ?? {}),
    ]
  )
  return { didInsert: false, didUpdate: Boolean(updated) }
}
