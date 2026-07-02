/**
 * Deterministic helpers for turning a source Sales Object into a workspace.
 * No AI, no network — pure functions so "Create Workspace" is cheap and
 * repeatable.
 */

interface SourceLike {
  node_type: string
  title: string
  metadata_json: Record<string, unknown> | null | undefined
}

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string {
  const v = meta?.[key]
  return typeof v === 'string' ? v : ''
}

/** A sensible default workspace title derived from the source node. */
export function defaultWorkspaceTitle(source: SourceLike): string {
  const meta = source.metadata_json
  if (source.node_type === 'email') {
    const who = metaString(meta, 'from_name') || metaString(meta, 'from_email')
    const subject = metaString(meta, 'subject') || source.title
    const base = who ? `${who} — ${subject}` : subject
    return truncate(base, 120) || 'New workspace'
  }
  // prospect / account / task / note / meeting / automation_result → its title.
  return truncate(source.title, 120) || 'New workspace'
}

/** URL/DOM-safe slug. A short random-free suffix is added by the caller. */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'workspace'
  )
}

/**
 * AI-ready metadata bag stored on the workspace node. Nothing here is generated
 * by a model at creation time — the AI-only fields are seeded null/false for a
 * future feature to fill in.
 */
export function buildWorkspaceMetadata(source: SourceLike, reason: string | null): Record<string, unknown> {
  return {
    promoted_from_type: source.node_type,
    promoted_from_title: truncate(source.title, 200),
    promoted_reason: reason,
    workspace_summary: null,
    related_object_count: 1, // the anchor
    ai_suggested: false,
  }
}

function truncate(s: string, n: number): string {
  const t = (s ?? '').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
