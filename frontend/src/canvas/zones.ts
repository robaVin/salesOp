import type { NoteRecord, NoteType } from '../types'

/**
 * Zone taxonomy for the minimap navigator. Single source of truth:
 * the minimap dot colors, the click-to-fly grouping, and the legend
 * all derive from this file.
 */
export type ZoneKey = 'prospects' | 'accounts' | 'followups' | 'drafts' | 'system'

export const ZONE_ORDER: ZoneKey[] = ['prospects', 'accounts', 'followups', 'drafts', 'system']

export const ZONE_LABELS: Record<ZoneKey, string> = {
  prospects: 'Prospects',
  accounts: 'Accounts',
  followups: 'Followups',
  drafts: 'Drafts',
  system: 'System',
}

/** Tailwind 500-shade hexes already used by the canvas palette (see nodeStyles / minimap). */
export const ZONE_COLORS: Record<ZoneKey, string> = {
  prospects: '#3b82f6', // blue-500
  accounts: '#a855f7', // purple-500
  followups: '#f59e0b', // amber-500
  drafts: '#10b981', // emerald-500
  system: '#64748b', // slate-500
}

export const AT_RISK_COLOR = '#ef4444' // red-500

const ZONE_OF_TYPE: Partial<Record<NoteType, ZoneKey>> = {
  prospect: 'prospects',
  account: 'accounts',
  followup: 'followups',
  objection: 'followups',
  call_summary: 'followups',
  email_draft: 'drafts',
  linkedin_draft: 'drafts',
  automation_result: 'system',
  automation_hub: 'system',
  stripe: 'system',
}

/** Zone a note belongs to, or null for types outside the zone taxonomy. */
export function zoneOf(note: Pick<NoteRecord, 'node_type'>): ZoneKey | null {
  return ZONE_OF_TYPE[note.node_type] ?? null
}

/**
 * Same definition the backend stats endpoint and the Command Center
 * renderer use for "accounts needing attention".
 */
export function isAtRiskAccount(note: Pick<NoteRecord, 'node_type' | 'status'>): boolean {
  return (
    note.node_type === 'account' &&
    (note.status === 'needs_review' || note.status === 'in_progress')
  )
}

/** Zone color for a minimap dot; null means "not in a zone, use the fallback". */
export function minimapZoneColor(
  note: Pick<NoteRecord, 'node_type' | 'status'>
): string | null {
  if (isAtRiskAccount(note)) return AT_RISK_COLOR
  const zone = zoneOf(note)
  return zone ? ZONE_COLORS[zone] : null
}
