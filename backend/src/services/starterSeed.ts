import type { PoolClient } from 'pg'

/**
 * Seed a fresh workspace with home nodes (Daily Briefing + Command Center)
 * plus a small starter set of prospects/account/followup so the canvas feels
 * alive on first sign-in. Idempotent against re-runs because Phase-1 only
 * adds workspaces from this code path.
 */
export async function seedStarterWorkspace(
  client: PoolClient,
  workspaceId: string,
  canvasId: string
): Promise<void> {
  // Home anchor.
  await client.query(
    `INSERT INTO canvas_nodes
       (workspace_id, canvas_id, node_type, title, body, status, tags_json,
        position_x, position_y, width, height, metadata_json)
     VALUES ($1, $2, 'daily_briefing',
             'Today',
             'Your daily anchor. Zoom in for priorities, follow-ups, meetings, and recent captures.',
             'open', '["home"]'::jsonb, 0, 0, 320, 200,
             '{"home": true}'::jsonb)`,
    [workspaceId, canvasId]
  )

  // Command center.
  await client.query(
    `INSERT INTO canvas_nodes
       (workspace_id, canvas_id, node_type, title, body, status, tags_json,
        position_x, position_y, width, height, metadata_json)
     VALUES ($1, $2, 'command_center',
             'Command center',
             'Hot prospects, follow-ups due, drafts waiting, automation runs.',
             'open', '[]'::jsonb, 380, 0, 320, 200, '{}'::jsonb)`,
    [workspaceId, canvasId]
  )

  // Three starter prospects, vertically stacked to the right.
  const starterProspects = [
    {
      name: 'Ava Chen — Northstar Robotics',
      body: 'VP Ops · 240-person fleet. Met at the ops conference. Evaluating canvas tools.',
      x: 760,
      y: -120,
    },
    {
      name: 'Daniel Park — Kestrel Freight',
      body: 'Director of Driver Services · 80 trucks · Slack-heavy. Asked about Stripe billing.',
      x: 760,
      y: 80,
    },
    {
      name: 'Priya Iyer — Halcyon Logistics',
      body: 'COO · 320 power units · in the middle of a TMS modernization.',
      x: 760,
      y: 280,
    },
  ]
  const prospectIds: string[] = []
  for (const p of starterProspects) {
    const res = await client.query<{ id: string }>(
      `INSERT INTO canvas_nodes
         (workspace_id, canvas_id, node_type, title, body, status, tags_json,
          position_x, position_y, width, height, metadata_json)
       VALUES ($1, $2, 'prospect', $3, $4, 'open', '[]'::jsonb,
               $5, $6, 260, 160, '{}'::jsonb)
       RETURNING id`,
      [workspaceId, canvasId, p.name, p.body, p.x, p.y]
    )
    prospectIds.push(res.rows[0].id)
  }

  // One starter account.
  await client.query(
    `INSERT INTO canvas_nodes
       (workspace_id, canvas_id, node_type, title, body, status, tags_json,
        position_x, position_y, width, height, metadata_json)
     VALUES ($1, $2, 'account', 'Account · Helios Trucking',
             'Pilot live. Stripe billing connected. Q1 expansion conversation underway.',
             'in_progress', '["pilot-live"]'::jsonb, 1080, -120, 260, 160, '{}'::jsonb)`,
    [workspaceId, canvasId]
  )

  // One starter followup, attached to the first prospect.
  await client.query(
    `INSERT INTO canvas_nodes
       (workspace_id, canvas_id, node_type, title, body, status, tags_json,
        position_x, position_y, width, height, source_type, source_id, metadata_json)
     VALUES ($1, $2, 'followup',
             'FU: send Ava the pilot one-pager',
             'Promised by Friday.',
             'open', '["this-week"]'::jsonb, 1080, 80, 260, 140,
             'prospect', $3, '{}'::jsonb)`,
    [workspaceId, canvasId, prospectIds[0]]
  )
}
