import type { NoteRecord, NoteType } from '../types'

/**
 * Client-side node-relationship helpers.
 *
 * Mirror of the backend `nodeRelations` service: the ONE place the frontend
 * derives container membership and anchors from `parent_node_id` /
 * `promoted_from_node_id`. When these become a real graph, only this file
 * changes — renderers and components call these helpers, never the raw fields.
 */

/** Any container node: a user/AI workspace, or a system zone. */
export function isContainer(note: NoteRecord): boolean {
  return Boolean(note.is_workspace) || isSystemZone(note.node_type)
}

export function isSystemZone(nodeType: NoteType): boolean {
  return nodeType.endsWith('_zone')
}

export function isWorkspace(note: NoteRecord): boolean {
  return Boolean(note.is_workspace) && note.node_type === 'workspace'
}

/** Nodes that belong to a container via parent link (excludes the container). */
export function childrenOf(notes: NoteRecord[], containerId: string): NoteRecord[] {
  return notes.filter((n) => n.parent_node_id === containerId && n.id !== containerId)
}

/** Ids of every workspace node (for cheap claimed-node checks). */
export function workspaceIdSet(notes: NoteRecord[]): Set<string> {
  return new Set(notes.filter((n) => n.is_workspace).map((n) => n.id))
}

/**
 * A node is "claimed" once it's been moved/added into a user workspace. Claimed
 * nodes belong to that workspace exclusively — they leave their system zone and
 * the flat canvas, and are shown via the workspace's relationship view instead.
 */
export function isClaimedByWorkspace(note: NoteRecord, workspaceIds: Set<string>): boolean {
  return Boolean(note.parent_node_id && workspaceIds.has(note.parent_node_id))
}

/** The workspace's anchor — the source object it was created from. */
export function anchorOf(notes: NoteRecord[], container: NoteRecord): NoteRecord | null {
  if (!container.promoted_from_node_id) return null
  return notes.find((n) => n.id === container.promoted_from_node_id) ?? null
}

/** Node types that can be promoted into their own workspace. */
const PROMOTABLE: ReadonlySet<NoteType> = new Set<NoteType>([
  'email',
  'general_note',
  'task',
  'prospect',
  'account',
  'automation_result',
  'meeting',
  'capture',
  'voice_note',
])

/** Whether a node is eligible for "Create Workspace" / "Move to Workspace". */
export function canCreateWorkspaceFrom(note: NoteRecord): boolean {
  if (isContainer(note)) return false // never promote a zone or an existing workspace
  return PROMOTABLE.has(note.node_type)
}
