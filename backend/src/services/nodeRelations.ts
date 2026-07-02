import type { PoolClient } from 'pg'
import { query } from './db'

/**
 * Node relationship layer.
 *
 * Today a node's container membership is a single column, `parent_node_id`, and
 * a workspace's anchor is `promoted_from_node_id`. Both are modelled as simple
 * self-references on canvas_nodes. This module is the ONLY place that reads or
 * writes those columns, so when relationships grow into a real graph (a
 * `node_edges` / `node_relations` table with typed, many-to-many links) we swap
 * the internals here and every caller keeps working unchanged.
 *
 * Callers must never touch `parent_node_id` / `promoted_from_node_id` directly.
 */

type Queryable = Pick<PoolClient, 'query'>

/** Assign a node to a container (workspace or zone). Pass null to detach. */
export async function setParentContainer(
  client: Queryable,
  params: { workspaceId: string; nodeId: string; parentNodeId: string | null }
): Promise<void> {
  await client.query(
    `UPDATE canvas_nodes SET parent_node_id = $1, updated_at = NOW()
     WHERE id = $2 AND workspace_id = $3`,
    [params.parentNodeId, params.nodeId, params.workspaceId]
  )
}

/** True if the id refers to a live container node (workspace or system zone). */
export async function isContainerNode(
  workspaceId: string,
  nodeId: string
): Promise<boolean> {
  const rows = await query<{ ok: boolean }>(
    `SELECT (is_workspace = true OR node_type LIKE '%\\_zone') AS ok
     FROM canvas_nodes
     WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
    [nodeId, workspaceId]
  )
  return rows[0]?.ok === true
}

/** Direct children of a container (nodes whose parent is this container). */
export async function childrenOfContainer<T = unknown>(
  workspaceId: string,
  containerId: string,
  columns = 'id'
): Promise<T[]> {
  return query<T>(
    `SELECT ${columns} FROM canvas_nodes
     WHERE workspace_id = $1 AND parent_node_id = $2 AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [workspaceId, containerId]
  )
}
