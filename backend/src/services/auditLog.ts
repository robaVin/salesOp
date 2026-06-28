import { query } from './db'

export interface AuditEntry {
  workspaceId: string
  actorUserId?: string | null
  actorRole?: string | null
  action: string
  entityType: string
  entityId?: string | null
  beforeJson?: unknown
  afterJson?: unknown
  metadata?: Record<string, unknown>
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  await query(
    `INSERT INTO audit_log
       (workspace_id, actor_user_id, actor_role, action, entity_type, entity_id,
        before_json, after_json, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)`,
    [
      entry.workspaceId,
      entry.actorUserId ?? null,
      entry.actorRole ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      JSON.stringify(entry.beforeJson ?? null),
      JSON.stringify(entry.afterJson ?? null),
      JSON.stringify(entry.metadata ?? {}),
    ]
  )
}
