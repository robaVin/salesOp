export interface RoutineContext {
  workspaceId: string
  triggerType: 'hotkey' | 'manual' | 'palette' | 'email' | 'schedule'
  triggerPayload: Record<string, unknown>
}

export interface RoutineResult {
  status: 'success' | 'needs_review' | 'failed' | 'skipped'
  result: Record<string, unknown>
  // Note that should be created on the canvas.
  note: {
    title: string
    body: string
    status: 'open' | 'in_progress' | 'resolved' | 'dismissed' | 'needs_review'
    tags?: string[]
  } | null
  error?: string
}

export interface Routine {
  key: string
  displayName: string
  description: string
  // Read-only routines never write to external systems. Audit copy is gentler.
  readOnly: boolean
  run(ctx: RoutineContext): Promise<RoutineResult>
}
