/**
 * Universal SourceProvider contract.
 *
 * Every ingest surface (Gmail, Slack, Outlook, meetings, voice notes, browser
 * captures, HubSpot, ...) implements this. The object-ingest orchestrator is
 * provider-agnostic: it runs sync(), receives SalesObjects, upserts them into
 * canvas_nodes, and writes an object_syncs row.
 *
 * Adding a new source is one new folder under backend/src/sources/<key>/ plus
 * one registry entry. No schema changes.
 */

export type ConnectionState = 'not_connected' | 'connected' | 'error'

export interface ConnectionStatus {
  connected: boolean
  state: ConnectionState
  external_account_email: string | null
  scopes: string[]
  last_sync_at: string | null
  detail?: string
}

export interface SyncOptions {
  limit?: number
  cursor?: string | null
  force_full?: boolean
}

export interface SyncSummary {
  status: 'success' | 'partial' | 'failed'
  objects_added: number
  objects_updated: number
  cursor_watermark: string | null
  error?: string
}

/**
 * A single "Sales Object" emitted by a source during sync. The orchestrator
 * turns each one into a canvas_nodes row keyed by (workspace, source_type,
 * external_id) so re-syncing never duplicates.
 */
export interface SalesObject {
  node_type: string                    // 'email', later 'message', 'meeting', ...
  external_id: string                  // provider's stable ID — used with source_type for dedup
  title: string
  body: string
  status?: 'open' | 'in_progress' | 'resolved' | 'dismissed' | 'needs_review'
  tags?: string[]
  external_url?: string
  received_at?: string                 // ISO string
  metadata?: Record<string, unknown>
}

export interface ProviderContext {
  workspaceId: string
  userId: string
}

/**
 * The core contract. All providers are functions/objects returning this shape.
 */
export interface SourceProvider {
  key: string                           // 'gmail'
  displayName: string                   // 'Gmail'
  // Colour and visual style deliberately live on the RENDERER for the produced
  // node type, not here. A provider knows what kind of node it produces; the
  // renderer decides how that node looks. When Outlook lands and also produces
  // 'email' nodes, both providers share the Email renderer's yellow.
  producesNodeType: string              // 'email'

  /** Read current connection state without hitting the provider API. */
  status(ctx: ProviderContext): Promise<ConnectionStatus>

  /**
   * Return the URL a user's browser should navigate to in order to start the
   * OAuth flow. For non-OAuth providers return null and use a different flow.
   */
  connectStartUrl(
    ctx: ProviderContext,
    redirectAfter: string
  ): Promise<string | null>

  /**
   * Handle the OAuth callback. Providers with non-OAuth connect flows can
   * throw here.
   */
  handleCallback(
    ctx: ProviderContext,
    params: { code: string; state: string }
  ): Promise<void>

  /** Revoke provider-side and delete stored tokens. */
  disconnect(ctx: ProviderContext): Promise<void>

  /**
   * Yield SalesObjects. The orchestrator handles persistence and cursor
   * tracking. Providers should be idempotent per external_id.
   */
  sync(
    ctx: ProviderContext,
    opts: SyncOptions
  ): Promise<{ objects: SalesObject[]; cursor_watermark: string | null }>
}
