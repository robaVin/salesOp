export type NoteType =
  // legacy / general
  | 'prospect'
  | 'account'
  | 'call_summary'
  | 'followup'
  | 'objection'
  | 'email_draft'
  | 'linkedin_draft'
  | 'automation_result'
  | 'task'
  | 'general_note'
  | 'box'
  // phase 1 spatial node taxonomy
  | 'daily_briefing'
  | 'command_center'
  | 'automation_hub'
  | 'stripe'
  | 'search'
  | 'ai_assistant'
  | 'inbox'
  | 'settings'
  | 'voice_note'
  | 'screenshot'
  | 'meeting'
  | 'capture'

export type NoteStatus = 'open' | 'in_progress' | 'resolved' | 'dismissed' | 'needs_review'

export interface NoteRecord {
  id: string
  workspace_id: string
  canvas_id: string
  node_type: NoteType
  title: string
  body: string
  status: NoteStatus
  tags_json: string[]
  position_x: number
  position_y: number
  width: number
  height: number
  source_type: string | null
  source_id: string | null
  metadata_json: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface EdgeRecord {
  id: string
  workspace_id: string
  canvas_id: string
  source_node_id: string
  target_node_id: string
  label: string | null
  created_at: string
}

export interface AutomationRunRecord {
  id: string
  routine_key: string
  trigger_type: string
  status: 'running' | 'success' | 'needs_review' | 'failed' | 'skipped'
  result_json: Record<string, unknown>
  created_note_id: string | null
  error: string | null
  created_at: string
  completed_at: string | null
}

export interface StatsResponse {
  open_followups: number
  pending_drafts: number
  open_objections: number
  stripe_checks_today: number
  accounts_needing_attention: number
}
