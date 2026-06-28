-- Sales Canvas — schema
-- One database, single workspace for V1. Multi-tenant shape is preserved so the
-- second workspace adds rows, not migrations.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- WORKSPACE + USERS (single-tenant for V1; shape is multi-tenant ready)
-- ============================================================

CREATE TABLE IF NOT EXISTS workspaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT UNIQUE,
  role         TEXT NOT NULL DEFAULT 'manager'
                 CHECK (role IN ('manager', 'ae', 'sdr', 'admin')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_workspace ON users (workspace_id);

-- ============================================================
-- CANVAS + NODES + EDGES
-- ============================================================

CREATE TABLE IF NOT EXISTS canvases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  viewport_json JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvases_workspace ON canvases (workspace_id);

CREATE TABLE IF NOT EXISTS canvas_nodes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  canvas_id     UUID NOT NULL REFERENCES canvases (id) ON DELETE CASCADE,
  node_type     TEXT NOT NULL CHECK (node_type IN (
    'prospect','account','call_summary','followup','objection',
    'email_draft','linkedin_draft','automation_result','task','general_note','box'
  )),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_progress','resolved','dismissed','needs_review')),
  tags_json     JSONB NOT NULL DEFAULT '[]',
  position_x    DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_y    DOUBLE PRECISION NOT NULL DEFAULT 0,
  width         DOUBLE PRECISION NOT NULL DEFAULT 260,
  height        DOUBLE PRECISION NOT NULL DEFAULT 160,
  source_type   TEXT,
  source_id     TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_by    UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvas_nodes_canvas ON canvas_nodes (canvas_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_status ON canvas_nodes (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_type ON canvas_nodes (workspace_id, node_type);

CREATE TABLE IF NOT EXISTS canvas_edges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  canvas_id      UUID NOT NULL REFERENCES canvases (id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES canvas_nodes (id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES canvas_nodes (id) ON DELETE CASCADE,
  label          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvas_edges_canvas ON canvas_edges (canvas_id);
CREATE INDEX IF NOT EXISTS idx_canvas_edges_source ON canvas_edges (source_node_id);

-- ============================================================
-- AUTOMATIONS
-- ============================================================

-- The routine registry lives in code (backend/src/automations/registry.ts).
-- Events and runs are persisted here for audit + history surfaces.

CREATE TABLE IF NOT EXISTS automation_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  routine_key     TEXT NOT NULL,
  trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('hotkey','manual','palette','email','schedule')),
  trigger_payload_json JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_events_workspace_time
  ON automation_events (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS automation_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  routine_key           TEXT NOT NULL,
  trigger_type          TEXT NOT NULL,
  trigger_payload_json  JSONB NOT NULL DEFAULT '{}',
  status                TEXT NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running','success','needs_review','failed','skipped')),
  result_json           JSONB NOT NULL DEFAULT '{}',
  created_note_id       UUID REFERENCES canvas_nodes (id) ON DELETE SET NULL,
  error                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_workspace_time
  ON automation_runs (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_routine
  ON automation_runs (workspace_id, routine_key, created_at DESC);

-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  actor_role    TEXT,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT,
  before_json   JSONB,
  after_json    JSONB,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_workspace_time
  ON audit_log (workspace_id, created_at DESC);

-- ============================================================
-- CONNECTORS (credentials, status)
-- ============================================================

CREATE TABLE IF NOT EXISTS connectors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'disconnected'
                   CHECK (status IN ('active','paused','error','disconnected')),
  config_json    JSONB NOT NULL DEFAULT '{}',
  last_check_at  TIMESTAMPTZ,
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, kind)
);

-- ============================================================
-- AI OUTPUTS (caching + cost tracking)
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_outputs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  task          TEXT NOT NULL,           -- 'summarize' | 'draft_email' | 'draft_linkedin' | ...
  input_hash    TEXT NOT NULL,
  model         TEXT NOT NULL,
  output_json   JSONB NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_outputs_dedup
  ON ai_outputs (workspace_id, task, input_hash);
