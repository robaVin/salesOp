-- 008_promote_to_workspace.sql
--
-- "Create Workspace" — let a user turn any important Sales Object (email, note,
-- account, task, meeting, automation result…) into its own workspace/container
-- on the canvas. Everything stays a canvas_nodes row.
--
-- Backwards compatible: additive columns + one reference table. Existing system
-- zones (home_zone…automation_zone) are untouched and keep rendering.
--
-- Relationship model (kept deliberately simple so it can grow into a graph):
--   * parent_node_id        — a node belongs to a container (workspace/zone)
--   * promoted_from_node_id — the workspace's anchor (the source it was made from)
-- Both are self-references on canvas_nodes with ON DELETE SET NULL, so deleting
-- a container NEVER cascades into its children.

-- =============================================================================
-- 1. Relationship + workspace columns (all nullable / defaulted → additive)
-- =============================================================================
ALTER TABLE canvas_nodes ADD COLUMN IF NOT EXISTS parent_node_id uuid
  REFERENCES canvas_nodes(id) ON DELETE SET NULL;
ALTER TABLE canvas_nodes ADD COLUMN IF NOT EXISTS promoted_from_node_id uuid
  REFERENCES canvas_nodes(id) ON DELETE SET NULL;
ALTER TABLE canvas_nodes ADD COLUMN IF NOT EXISTS is_workspace boolean NOT NULL DEFAULT false;
ALTER TABLE canvas_nodes ADD COLUMN IF NOT EXISTS workspace_kind text;
ALTER TABLE canvas_nodes ADD COLUMN IF NOT EXISTS workspace_slug text;
ALTER TABLE canvas_nodes ADD COLUMN IF NOT EXISTS workspace_color text;
ALTER TABLE canvas_nodes ADD COLUMN IF NOT EXISTS workspace_icon text;
ALTER TABLE canvas_nodes ADD COLUMN IF NOT EXISTS workspace_status text NOT NULL DEFAULT 'active';

-- Forward-looking score placeholders so future AI ranking features don't need a
-- migration. Nullable, unused by this feature.
ALTER TABLE canvas_nodes ADD COLUMN IF NOT EXISTS importance_score double precision;
ALTER TABLE canvas_nodes ADD COLUMN IF NOT EXISTS workspace_score double precision;

-- =============================================================================
-- 2. Allow the new 'workspace' node_type (idempotent CHECK widen — same pattern
--    as migration 006). Full current list + 'workspace'.
-- =============================================================================
ALTER TABLE canvas_nodes DROP CONSTRAINT IF EXISTS canvas_nodes_node_type_check;
ALTER TABLE canvas_nodes ADD CONSTRAINT canvas_nodes_node_type_check
  CHECK (node_type IN (
    'prospect', 'account', 'call_summary', 'followup', 'objection',
    'email_draft', 'linkedin_draft', 'automation_result', 'task', 'general_note', 'box',
    'daily_briefing', 'command_center', 'automation_hub', 'stripe',
    'search', 'ai_assistant', 'inbox', 'settings',
    'voice_note', 'screenshot', 'meeting', 'capture',
    'email',
    'home_zone', 'email_zone', 'notes_zone', 'tasks_zone', 'automation_zone',
    -- NEW: user-created / AI-suggested containers
    'workspace'
  ));

-- =============================================================================
-- 3. Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_parent
  ON canvas_nodes (workspace_id, parent_node_id) WHERE parent_node_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_promoted
  ON canvas_nodes (promoted_from_node_id) WHERE promoted_from_node_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_is_workspace
  ON canvas_nodes (workspace_id) WHERE is_workspace = true;
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_workspace_kind
  ON canvas_nodes (workspace_id, workspace_kind) WHERE workspace_kind IS NOT NULL;

-- =============================================================================
-- 4. Workspace kinds — reference/lookup data (seeded, not hardcoded in the UI).
--    A tiny lookup table, NOT a workspace store: workspaces themselves remain
--    canvas_nodes rows. The frontend fetches this list for the kind selector.
-- =============================================================================
CREATE TABLE IF NOT EXISTS workspace_kinds (
  key         text PRIMARY KEY,
  label       text NOT NULL,
  description text,
  color       text NOT NULL,
  icon        text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO workspace_kinds (key, label, description, color, icon, sort_order) VALUES
  ('opportunity', 'Opportunity', 'A live deal or expansion in motion.',        '#7C3AED', 'target',        1),
  ('account',     'Account',     'A customer or company you manage over time.', '#0F766E', 'building',      2),
  ('issue',       'Issue',       'A problem, escalation, or blocker to resolve.','#DC2626', 'alert-triangle',3),
  ('project',     'Project',     'A scoped initiative with related work.',       '#2563EB', 'folder',        4),
  ('custom',      'Custom',      'A freeform workspace for anything.',           '#64748B', 'sparkles',      5)
ON CONFLICT (key) DO NOTHING;
