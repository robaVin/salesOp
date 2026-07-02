-- 007_soft_delete.sql
--
-- Feature 3: Persistent Trash Bin.
--
-- Soft delete for canvas nodes. A node with `deleted_at` set is "in the trash":
-- hidden from the canvas and all aggregations, but recoverable until it is
-- permanently purged.
--
-- Backwards compatible: additive only. Existing rows get NULL deleted_at
-- (i.e. "not deleted"), so nothing changes for current data.

ALTER TABLE canvas_nodes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Live-node lookups (GET /api/notes, stats, renderers) filter on deleted_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_active
  ON canvas_nodes (workspace_id)
  WHERE deleted_at IS NULL;

-- Trash listing (GET /api/notes/trash) filters on deleted_at IS NOT NULL,
-- newest-deleted first.
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_trash
  ON canvas_nodes (workspace_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;
