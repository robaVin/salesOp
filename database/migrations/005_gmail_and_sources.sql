-- 005_gmail_and_sources.sql
--
-- Feature 1: Gmail Important Emails.
--
-- Adds three additive changes. All statements are idempotent (IF NOT EXISTS)
-- and backwards-compatible: they widen the schema without altering existing
-- rows or breaking existing queries.
--
-- 1. user_oauth_tokens         per-user, per-provider OAuth tokens (encrypted)
-- 2. object_syncs              universal ingest-run tracking (Gmail today; future providers reuse)
-- 3. canvas_nodes 'email'      new node_type value + source-based dedup index
--
-- Pre-run safety check for the dedup index (§3). Run this SELECT first; expect
-- zero rows. If rows come back, resolve the duplicates before applying:
--
--   SELECT workspace_id, source_type, source_id, count(*)
--   FROM canvas_nodes
--   WHERE source_type IS NOT NULL AND source_id IS NOT NULL
--   GROUP BY 1, 2, 3
--   HAVING count(*) > 1;

-- =============================================================================
-- 1. user_oauth_tokens
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_oauth_tokens (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id                  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider                 TEXT NOT NULL,               -- 'google' (first); 'slack', 'outlook', ... later
  scopes                   TEXT NOT NULL,               -- space-delimited scope string as granted by provider
  access_token_encrypted   TEXT NOT NULL,               -- AES-256-GCM(base64(iv||tag||ciphertext))
  refresh_token_encrypted  TEXT,                        -- Google returns refresh_token only on first consent
  expires_at               TIMESTAMPTZ,                 -- provider-issued access-token expiry
  external_account_email   TEXT,                        -- email the tokens grant access to (for display)
  connected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at          TIMESTAMPTZ,
  last_used_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_oauth_tokens_user
  ON user_oauth_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_user_oauth_tokens_workspace_provider
  ON user_oauth_tokens (workspace_id, provider);

-- =============================================================================
-- 2. object_syncs — universal ingest-run tracking
--
-- Records one row per sync execution from any SourceProvider. Feature 1 uses
-- source_provider='gmail'; future providers (slack, outlook, meetings, ...)
-- reuse this table.
-- =============================================================================
CREATE TABLE IF NOT EXISTS object_syncs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  source_provider   TEXT NOT NULL,                     -- 'gmail', later 'slack', 'outlook', ...
  source_kind       TEXT NOT NULL,                     -- node_type produced ('email', 'message', 'meeting', ...)
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running', 'success', 'partial', 'failed')),
  objects_added     INTEGER NOT NULL DEFAULT 0,
  objects_updated   INTEGER NOT NULL DEFAULT 0,
  cursor_watermark  TEXT,                              -- Gmail historyId today; Slack cursor / Outlook delta later
  error             TEXT
);

CREATE INDEX IF NOT EXISTS idx_object_syncs_user_time
  ON object_syncs (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_object_syncs_provider
  ON object_syncs (workspace_id, source_provider, started_at DESC);

-- =============================================================================
-- 3. canvas_nodes: add 'email' + dedup index
-- =============================================================================
ALTER TABLE canvas_nodes DROP CONSTRAINT IF EXISTS canvas_nodes_node_type_check;
ALTER TABLE canvas_nodes ADD CONSTRAINT canvas_nodes_node_type_check
  CHECK (node_type IN (
    'prospect', 'account', 'call_summary', 'followup', 'objection',
    'email_draft', 'linkedin_draft', 'automation_result', 'task', 'general_note', 'box',
    'daily_briefing', 'command_center', 'automation_hub', 'stripe',
    'search', 'ai_assistant', 'inbox', 'settings',
    'voice_note', 'screenshot', 'meeting', 'capture',
    'email'
  ));

-- Universal source-based dedup. Guarantees a provider (source_type='gmail',
-- source_id=<gmail_message_id>) can only produce one row per workspace even
-- if sync runs twice. Only enforced where both columns are set, so existing
-- rows without source metadata are untouched.
CREATE UNIQUE INDEX IF NOT EXISTS idx_canvas_nodes_source_dedup
  ON canvas_nodes (workspace_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

-- Thread-grouping index. Any ingested SalesObject that belongs to a conversation
-- (Gmail thread, Slack thread, Outlook conversation, meeting series) stores its
-- provider-side thread id at the canonical location metadata_json->>'thread_id'.
-- This partial index makes "give me every node in this thread within this
-- workspace" cheap, which is what future thread-grouping UX will read.
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_thread
  ON canvas_nodes (workspace_id, source_type, (metadata_json ->> 'thread_id'))
  WHERE metadata_json ? 'thread_id';
