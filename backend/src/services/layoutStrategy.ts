/**
 * Layout strategy for canvas objects.
 *
 * The workspace is divided into 5 zones (see migration 006). Every canvas
 * node has a "home zone" implied by its node_type. This module owns:
 *
 *   1. The zone grid (positions + sizes).
 *   2. Which zone hosts which node_type.
 *   3. positionForIngestedObject(providerKey, offset) → the point inside the
 *      right zone where the next ingested item of this provider's type should
 *      land. Same interface as before; now zone-aware.
 *   4. positionInsideZone(zoneType, offset) → for hand-created items during
 *      signup / manual creation.
 *
 * All positioning knowledge lives here. Providers and the ingest orchestrator
 * remain agnostic.
 */

export type ZoneType =
  | 'home_zone'
  | 'email_zone'
  | 'notes_zone'
  | 'tasks_zone'
  | 'automation_zone'

export interface ZoneRect {
  x: number
  y: number
  width: number
  height: number
}

// Fixed grid (must match migration 006 seeded positions/sizes).
export const ZONE_LAYOUT: Record<ZoneType, ZoneRect> = {
  home_zone: { x: 0, y: 0, width: 1800, height: 1000 },
  email_zone: { x: 2200, y: 0, width: 1800, height: 1000 },
  automation_zone: { x: 4400, y: 0, width: 1800, height: 1000 },
  notes_zone: { x: 0, y: 1400, width: 1800, height: 1000 },
  tasks_zone: { x: 2200, y: 1400, width: 1800, height: 1000 },
}

/**
 * Which zone hosts each node_type. Zones themselves are their own type —
 * they are not "inside" any other zone.
 */
const TYPE_TO_ZONE: Record<string, ZoneType> = {
  // Home
  daily_briefing: 'home_zone',
  command_center: 'home_zone',
  ai_assistant: 'home_zone',

  // Email
  email: 'email_zone',

  // Notes
  prospect: 'notes_zone',
  account: 'notes_zone',
  general_note: 'notes_zone',
  call_summary: 'notes_zone',
  objection: 'notes_zone',
  email_draft: 'notes_zone',
  linkedin_draft: 'notes_zone',
  capture: 'notes_zone',
  screenshot: 'notes_zone',
  voice_note: 'notes_zone',
  box: 'notes_zone',

  // Tasks
  task: 'tasks_zone',
  followup: 'tasks_zone',
  meeting: 'tasks_zone',

  // Automations
  automation_result: 'automation_zone',
  automation_hub: 'automation_zone',
  stripe: 'automation_zone',
}

export function zoneForNodeType(nodeType: string): ZoneType {
  return TYPE_TO_ZONE[nodeType] ?? 'notes_zone'
}

// -----------------------------------------------------------------------------
// Cascade math — where a new child lands within its zone.
// -----------------------------------------------------------------------------
//
// Zone bounds are 1800 wide × 1000 tall. Reserve 100px top gutter for the
// zone header (the zone renderer paints a title strip up there).
// Grid children as 3 columns × N rows.

const ZONE_PADDING_X = 40
const ZONE_HEADER_Y = 110
const CHILD_COLUMN_WIDTH = 300
const CHILD_ROW_HEIGHT = 200

function positionForOffsetInside(zone: ZoneRect, offset: number): { x: number; y: number } {
  const usableWidth = zone.width - ZONE_PADDING_X * 2
  const colsPerRow = Math.max(1, Math.floor(usableWidth / CHILD_COLUMN_WIDTH))
  const col = offset % colsPerRow
  const row = Math.floor(offset / colsPerRow)
  return {
    x: zone.x + ZONE_PADDING_X + col * CHILD_COLUMN_WIDTH,
    y: zone.y + ZONE_HEADER_Y + row * CHILD_ROW_HEIGHT,
  }
}

/**
 * Position for a newly-created node of a particular node_type. Places it
 * inside its home zone, cascading by offset.
 */
export function positionInsideZone(
  nodeType: string,
  offset: number
): { x: number; y: number } {
  const zone = ZONE_LAYOUT[zoneForNodeType(nodeType) as ZoneType]
  return positionForOffsetInside(zone, offset)
}

// -----------------------------------------------------------------------------
// LayoutStrategy contract used by objectIngest.
// -----------------------------------------------------------------------------

export interface LayoutStrategy {
  positionForIngestedObject(params: {
    workspaceId: string
    providerKey: string
    offset: number
    nodeType?: string
  }): { x: number; y: number }
}

/**
 * The default strategy maps every ingested object into its home zone by
 * node_type. Provider identity is used for cascading within a zone if
 * multiple providers produce the same node_type (e.g. Gmail + Outlook both
 * emit 'email'): the whole email zone shares one offset counter today, so
 * they interleave naturally.
 */
class ZoneAwareLayoutStrategy implements LayoutStrategy {
  positionForIngestedObject(params: {
    workspaceId: string
    providerKey: string
    offset: number
    nodeType?: string
  }): { x: number; y: number } {
    const zone =
      ZONE_LAYOUT[
        zoneForNodeType(params.nodeType ?? providerToNodeType(params.providerKey)) as ZoneType
      ]
    return positionForOffsetInside(zone, params.offset)
  }
}

function providerToNodeType(providerKey: string): string {
  // Fallback — orchestrator normally passes nodeType explicitly. This keeps
  // the strategy well-defined even if a caller forgets to pass it.
  if (providerKey === 'gmail' || providerKey === 'outlook') return 'email'
  return 'general_note'
}

let cached: LayoutStrategy = new ZoneAwareLayoutStrategy()

export function getLayoutStrategy(): LayoutStrategy {
  return cached
}

export function setLayoutStrategy(strategy: LayoutStrategy): void {
  cached = strategy
}

// -----------------------------------------------------------------------------
// Migration-parity: seedZonesSQL() returns a parameterised query the signup
// flow can run against a specific workspace+canvas so new signups get zones
// inside the same transaction (no wait for migration timing).
// -----------------------------------------------------------------------------

/**
 * Returns a multi-statement SQL string that seeds all 5 zones for a workspace.
 * Uses ON CONFLICT DO NOTHING semantics by checking existence before insert —
 * safe against re-runs.
 *
 * Placeholders: $1 = workspace_id (UUID), $2 = canvas_id (UUID)
 */
export function seedZonesSQL(): string {
  const rows: string[] = []
  for (const [zoneType, rect] of Object.entries(ZONE_LAYOUT) as Array<[ZoneType, ZoneRect]>) {
    const meta = zoneMetadataFor(zoneType)
    rows.push(`
      INSERT INTO canvas_nodes
        (workspace_id, canvas_id, node_type, title, body, status,
         tags_json, position_x, position_y, width, height, metadata_json)
      SELECT $1, $2, '${zoneType}',
        ${sqlLit(meta.title)}, ${sqlLit(meta.description)}, 'open',
        '["zone"]'::jsonb, ${rect.x}, ${rect.y}, ${rect.width}, ${rect.height},
        ${sqlLit(JSON.stringify({ zone_key: meta.zoneKey, child_types: meta.childTypes }))}::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM canvas_nodes
        WHERE workspace_id = $1 AND node_type = '${zoneType}'
      );
    `)
  }
  return rows.join('\n')
}

function sqlLit(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'"
}

interface ZoneMeta {
  title: string
  description: string
  zoneKey: string
  childTypes: string[]
}

function zoneMetadataFor(zone: ZoneType): ZoneMeta {
  switch (zone) {
    case 'home_zone':
      return {
        title: 'Home',
        description: 'Your daily anchor. Today, priorities, hot signals.',
        zoneKey: 'home',
        childTypes: ['daily_briefing', 'command_center', 'ai_assistant'],
      }
    case 'email_zone':
      return {
        title: 'Email',
        description: 'Every message that matters — synced from your inboxes.',
        zoneKey: 'email',
        childTypes: ['email'],
      }
    case 'automation_zone':
      return {
        title: 'Automations',
        description: 'Routines you run. Results, alerts, needs-review.',
        zoneKey: 'automation',
        childTypes: ['automation_result', 'stripe', 'automation_hub'],
      }
    case 'notes_zone':
      return {
        title: 'Notes',
        description: 'Prospects, accounts, objections, drafts, captures.',
        zoneKey: 'notes',
        childTypes: [
          'prospect',
          'account',
          'general_note',
          'call_summary',
          'objection',
          'email_draft',
          'linkedin_draft',
          'capture',
          'screenshot',
          'voice_note',
        ],
      }
    case 'tasks_zone':
      return {
        title: 'Tasks',
        description: 'What you owe someone. What someone owes you. Meetings.',
        zoneKey: 'tasks',
        childTypes: ['task', 'followup', 'meeting'],
      }
  }
}

/**
 * Returns the list of node_types visible inside a zone. Used by the frontend
 * Zone renderer to aggregate its children. Kept here so backend and frontend
 * share one source of truth (frontend imports via a mirrored constants file).
 */
export function childTypesForZone(zoneType: ZoneType): string[] {
  return zoneMetadataFor(zoneType).childTypes
}
