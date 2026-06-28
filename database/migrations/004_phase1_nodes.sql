-- 004_phase1_nodes.sql
-- Phase 1 of the AI Workspace redesign:
--  1. Extend canvas_nodes.node_type to allow the new spatial-node taxonomy.
--  2. Seed a Daily Briefing + Command Center node in every workspace that
--     doesn't already have them. Daily Briefing lives at (0, 0) and is the
--     Home anchor. Command Center is to its right.

-- 1. Widen the node_type check constraint.
ALTER TABLE canvas_nodes DROP CONSTRAINT IF EXISTS canvas_nodes_node_type_check;
ALTER TABLE canvas_nodes ADD CONSTRAINT canvas_nodes_node_type_check
  CHECK (node_type IN (
    'prospect','account','call_summary','followup','objection',
    'email_draft','linkedin_draft','automation_result','task','general_note','box',
    'daily_briefing','command_center','automation_hub','stripe',
    'search','ai_assistant','inbox','settings',
    'voice_note','screenshot','meeting','capture'
  ));

-- 2. Seed home nodes per workspace.
-- DailyBriefing at (0, 0). CommandCenter at (380, 0).
DO $$
DECLARE
  ws RECORD;
  primary_canvas UUID;
BEGIN
  FOR ws IN SELECT id FROM workspaces LOOP
    SELECT id INTO primary_canvas
    FROM canvases
    WHERE workspace_id = ws.id
    ORDER BY created_at
    LIMIT 1;

    IF primary_canvas IS NULL THEN
      INSERT INTO canvases (workspace_id, name) VALUES (ws.id, 'Main board')
      RETURNING id INTO primary_canvas;
    END IF;

    -- daily_briefing
    IF NOT EXISTS (
      SELECT 1 FROM canvas_nodes
      WHERE workspace_id = ws.id AND node_type = 'daily_briefing'
    ) THEN
      INSERT INTO canvas_nodes (
        workspace_id, canvas_id, node_type, title, body, status, tags_json,
        position_x, position_y, width, height, metadata_json
      ) VALUES (
        ws.id, primary_canvas, 'daily_briefing',
        'Today',
        'Your daily anchor. Zoom in for priorities, follow-ups, meetings, and recent captures.',
        'open', '["home"]', 0, 0, 320, 200,
        '{"home": true}'
      );
    END IF;

    -- command_center
    IF NOT EXISTS (
      SELECT 1 FROM canvas_nodes
      WHERE workspace_id = ws.id AND node_type = 'command_center'
    ) THEN
      INSERT INTO canvas_nodes (
        workspace_id, canvas_id, node_type, title, body, status, tags_json,
        position_x, position_y, width, height, metadata_json
      ) VALUES (
        ws.id, primary_canvas, 'command_center',
        'Command center',
        'Hot prospects, follow-ups due, drafts waiting, automation runs. Routed to the persona that should act on each.',
        'open', '[]', 380, 0, 320, 200, '{}'
      );
    END IF;
  END LOOP;
END $$;
