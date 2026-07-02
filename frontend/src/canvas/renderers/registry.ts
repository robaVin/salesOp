import type { NoteType } from '../../types'
import type { NodeRendererSet } from './types'
import { Generic } from './Generic'
import { DailyBriefing } from './DailyBriefing'
import { CommandCenter } from './CommandCenter'
import { Prospect } from './Prospect'
import { Email } from './Email'
import { Container } from './Container'

const REGISTRY: Partial<Record<NoteType, NodeRendererSet>> = {
  daily_briefing: DailyBriefing,
  command_center: CommandCenter,
  prospect: Prospect,
  email: Email,
  // System zones AND user/AI workspaces share one generic ContainerRenderer;
  // it discriminates internally (is_workspace vs node_type) so container
  // visuals + child aggregation stay in one file.
  home_zone: Container,
  email_zone: Container,
  notes_zone: Container,
  tasks_zone: Container,
  automation_zone: Container,
  workspace: Container,
}

export function getRenderer(type: NoteType): NodeRendererSet {
  return REGISTRY[type] ?? Generic
}
