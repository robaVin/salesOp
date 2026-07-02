import type { NoteRecord } from '../../types'

export interface RendererContext {
  /** All notes in the workspace — for renderers that aggregate (e.g. Prospect → related drafts). */
  allNotes: NoteRecord[]
  /** Workspace-wide stats from /api/stats. Optional; renderers should tolerate null. */
  stats: {
    open_followups: number
    pending_drafts: number
    open_objections: number
    stripe_checks_today: number
    accounts_needing_attention: number
  } | null
}

export interface RendererProps {
  note: NoteRecord
  selected: boolean
  ctx: RendererContext
}

export type Renderer = (props: RendererProps) => JSX.Element

export type DetailMode = 'focused' | 'immersive'

export interface DetailRendererProps extends RendererProps {
  mode: DetailMode
  /** Patch a note (title/body/status). Available in focused + immersive modes. */
  onPatch?: (patch: { title?: string; body?: string; status?: NoteRecord['status'] }) => void
  /** Exit the overlay (returns the user to canvas). */
  onExit?: () => void
  /** Open a sibling node by id — fly to it AND focus. */
  onOpenNode?: (nodeId: string) => void
  /** Delete this note (soft delete → Trash) and close the overlay. */
  onDelete?: () => void
}

export type DetailRenderer = (props: DetailRendererProps) => JSX.Element

export interface NodeRendererSet {
  /** Far-zoom canvas tile — icon + label + status color. Cheap. */
  compact: Renderer
  /** Mid/close-zoom canvas tile — title + status + small summary. */
  preview: Renderer
  /** Focused (≈86% viewport) AND Immersive (full viewport) overlay. */
  detail: DetailRenderer
  /** Default size when seeding a new node of this type. */
  defaultWidth: number
  defaultHeight: number
}
