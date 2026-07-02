-- 006_canvas_zones.sql
--
-- Canvas Zones — first-class container nodes on the canvas.
--
-- Zones are Sales Objects (rows in canvas_nodes) with new node_type values.
-- They are large containers positioned on a fixed grid so every workspace
-- has the same spatial map. Emails, notes, tasks, etc. land inside their
-- zone by default (positioning handled in backend/src/services/layoutStrategy.ts).
--
-- Backwards compatible: additive only. Existing nodes stay where they are.
--
-- 1. Widen node_type CHECK to allow the 5 zone types.
-- 2. Seed the 5 zones for every workspace that doesn't already have them.

-- =============================================================================
-- 1. Widen node_type CHECK
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
    -- NEW: zones (first-class canvas containers)
    'home_zone', 'email_zone', 'notes_zone', 'tasks_zone', 'automation_zone'
  ));

-- =============================================================================
-- 2. Seed the 5 zones for every workspace lacking them
--
-- Grid layout (canvas coords, top-left origin):
--
--   x:      0            2200         4400
--   y=0     [Home]       [Email]      [Automation]      each 1800 x 1000
--   y=1400  [Notes]      [Tasks]                        each 1800 x 1000
--
-- Zone size 1800x1000 gives each zone room for a substantial dashboard and a
-- 400px horizontal / 400px vertical gutter between neighbours.
-- =============================================================================

DO $$
DECLARE
  ws RECORD;
  primary_canvas UUID;
BEGIN
  FOR ws IN SELECT id FROM workspaces LOOP
    SELECT id INTO primary_canvas FROM canvases
     WHERE workspace_id = ws.id
     ORDER BY created_at ASC LIMIT 1;

    IF primary_canvas IS NULL THEN
      INSERT INTO canvases (workspace_id, name) VALUES (ws.id, 'Main board')
        RETURNING id INTO primary_canvas;
    END IF;

    -- Home Zone (0, 0)
    INSERT INTO canvas_nodes
      (workspace_id, canvas_id, node_type, title, body, status,
       tags_json, position_x, position_y, width, height, metadata_json)
    SELECT ws.id, primary_canvas, 'home_zone',
      'Home',
      'Your daily anchor. Today, priorities, hot signals.',
      'open', '["zone"]'::jsonb,
      0, 0, 1800, 1000,
      jsonb_build_object('zone_key', 'home',
                         'child_types', jsonb_build_array('daily_briefing', 'command_center'))
    WHERE NOT EXISTS (
      SELECT 1 FROM canvas_nodes
      WHERE workspace_id = ws.id AND node_type = 'home_zone'
    );

    -- Email Zone (2200, 0)
    INSERT INTO canvas_nodes
      (workspace_id, canvas_id, node_type, title, body, status,
       tags_json, position_x, position_y, width, height, metadata_json)
    SELECT ws.id, primary_canvas, 'email_zone',
      'Email',
      'Every message that matters — synced from your inboxes.',
      'open', '["zone"]'::jsonb,
      2200, 0, 1800, 1000,
      jsonb_build_object('zone_key', 'email',
                         'child_types', jsonb_build_array('email'))
    WHERE NOT EXISTS (
      SELECT 1 FROM canvas_nodes
      WHERE workspace_id = ws.id AND node_type = 'email_zone'
    );

    -- Automation Zone (4400, 0)
    INSERT INTO canvas_nodes
      (workspace_id, canvas_id, node_type, title, body, status,
       tags_json, position_x, position_y, width, height, metadata_json)
    SELECT ws.id, primary_canvas, 'automation_zone',
      'Automations',
      'Routines you run. Results, alerts, needs-review.',
      'open', '["zone"]'::jsonb,
      4400, 0, 1800, 1000,
      jsonb_build_object('zone_key', 'automation',
                         'child_types', jsonb_build_array('automation_result', 'stripe', 'automation_hub'))
    WHERE NOT EXISTS (
      SELECT 1 FROM canvas_nodes
      WHERE workspace_id = ws.id AND node_type = 'automation_zone'
    );

    -- Notes Zone (0, 1400)
    INSERT INTO canvas_nodes
      (workspace_id, canvas_id, node_type, title, body, status,
       tags_json, position_x, position_y, width, height, metadata_json)
    SELECT ws.id, primary_canvas, 'notes_zone',
      'Notes',
      'Prospects, accounts, objections, drafts, captures.',
      'open', '["zone"]'::jsonb,
      0, 1400, 1800, 1000,
      jsonb_build_object('zone_key', 'notes',
                         'child_types', jsonb_build_array(
                           'prospect', 'account', 'general_note',
                           'call_summary', 'objection',
                           'email_draft', 'linkedin_draft',
                           'capture', 'screenshot', 'voice_note'))
    WHERE NOT EXISTS (
      SELECT 1 FROM canvas_nodes
      WHERE workspace_id = ws.id AND node_type = 'notes_zone'
    );

    -- Tasks Zone (2200, 1400)
    INSERT INTO canvas_nodes
      (workspace_id, canvas_id, node_type, title, body, status,
       tags_json, position_x, position_y, width, height, metadata_json)
    SELECT ws.id, primary_canvas, 'tasks_zone',
      'Tasks',
      'What you owe someone. What someone owes you. Meetings.',
      'open', '["zone"]'::jsonb,
      2200, 1400, 1800, 1000,
      jsonb_build_object('zone_key', 'tasks',
                         'child_types', jsonb_build_array('task', 'followup', 'meeting'))
    WHERE NOT EXISTS (
      SELECT 1 FROM canvas_nodes
      WHERE workspace_id = ws.id AND node_type = 'tasks_zone'
    );
  END LOOP;
END $$;
