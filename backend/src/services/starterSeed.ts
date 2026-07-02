import type { PoolClient } from 'pg'
import { ZONE_LAYOUT, positionInsideZone, seedZonesSQL } from './layoutStrategy'

/**
 * Seed a fresh workspace with the 5 canvas zones + home nodes + a small
 * starter set of prospects/account/followup so the canvas feels alive on
 * first sign-in.
 *
 * The 5 zones themselves are also seeded by migration 006 for every existing
 * workspace, but signup runs its own seed for two reasons: (a) it happens
 * inside the signup transaction so a new user always has zones ready, and
 * (b) starter items get positioned inside the correct zone from the start.
 */
export async function seedStarterWorkspace(
  client: PoolClient,
  workspaceId: string,
  canvasId: string
): Promise<void> {
  // 1. Seed the 5 zones for this workspace.
  await client.query(seedZonesSQL(), [workspaceId, canvasId])

  // 2. Home anchor + Command Center — positioned inside the Home Zone.
  const home = positionInsideZone('home_zone', 0)
  await client.query(
    `INSERT INTO canvas_nodes
       (workspace_id, canvas_id, node_type, title, body, status, tags_json,
        position_x, position_y, width, height, metadata_json)
     VALUES ($1, $2, 'daily_briefing',
             'Today',
             'Your daily anchor. Zoom in for priorities, follow-ups, meetings, and recent captures.',
             'open', '["home"]'::jsonb, $3, $4, 320, 200,
             '{"home": true}'::jsonb)`,
    [workspaceId, canvasId, home.x, home.y]
  )
  const cc = positionInsideZone('home_zone', 1)
  await client.query(
    `INSERT INTO canvas_nodes
       (workspace_id, canvas_id, node_type, title, body, status, tags_json,
        position_x, position_y, width, height, metadata_json)
     VALUES ($1, $2, 'command_center',
             'Command center',
             'Hot prospects, follow-ups due, drafts waiting, automation runs.',
             'open', '[]'::jsonb, $3, $4, 320, 200, '{}'::jsonb)`,
    [workspaceId, canvasId, cc.x, cc.y]
  )

  // 3. Three starter prospects — inside Notes Zone.
  const starterProspects = [
    {
      name: 'Ava Chen — Northstar Robotics',
      body: 'VP Ops · 240-person fleet. Met at the ops conference. Evaluating canvas tools.',
    },
    {
      name: 'Daniel Park — Kestrel Freight',
      body: 'Director of Driver Services · 80 trucks · Slack-heavy. Asked about Stripe billing.',
    },
    {
      name: 'Priya Iyer — Halcyon Logistics',
      body: 'COO · 320 power units · in the middle of a TMS modernization.',
    },
  ]
  const prospectIds: string[] = []
  for (let i = 0; i < starterProspects.length; i++) {
    const p = starterProspects[i]
    const pos = positionInsideZone('notes_zone', i)
    const res = await client.query<{ id: string }>(
      `INSERT INTO canvas_nodes
         (workspace_id, canvas_id, node_type, title, body, status, tags_json,
          position_x, position_y, width, height, metadata_json)
       VALUES ($1, $2, 'prospect', $3, $4, 'open', '[]'::jsonb,
               $5, $6, 260, 160, '{}'::jsonb)
       RETURNING id`,
      [workspaceId, canvasId, p.name, p.body, pos.x, pos.y]
    )
    prospectIds.push(res.rows[0].id)
  }

  // 4. One starter account — Notes Zone, next slot.
  const acctPos = positionInsideZone('notes_zone', starterProspects.length)
  await client.query(
    `INSERT INTO canvas_nodes
       (workspace_id, canvas_id, node_type, title, body, status, tags_json,
        position_x, position_y, width, height, metadata_json)
     VALUES ($1, $2, 'account', 'Account · Helios Trucking',
             'Pilot live. Stripe billing connected. Q1 expansion conversation underway.',
             'in_progress', '["pilot-live"]'::jsonb, $3, $4, 260, 160, '{}'::jsonb)`,
    [workspaceId, canvasId, acctPos.x, acctPos.y]
  )

  // 5. One starter followup — Tasks Zone.
  const fuPos = positionInsideZone('tasks_zone', 0)
  await client.query(
    `INSERT INTO canvas_nodes
       (workspace_id, canvas_id, node_type, title, body, status, tags_json,
        position_x, position_y, width, height, source_type, source_id, metadata_json)
     VALUES ($1, $2, 'followup',
             'FU: send Ava the pilot one-pager',
             'Promised by Friday.',
             'open', '["this-week"]'::jsonb, $3, $4, 260, 140,
             'prospect', $5, '{}'::jsonb)`,
    [workspaceId, canvasId, fuPos.x, fuPos.y, prospectIds[0]]
  )

  // Silence unused import warning if ZONE_LAYOUT is not referenced elsewhere.
  void ZONE_LAYOUT
}
