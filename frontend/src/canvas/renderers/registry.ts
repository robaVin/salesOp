import type { NoteType } from '../../types'
import type { NodeRendererSet } from './types'
import { Generic } from './Generic'
import { DailyBriefing } from './DailyBriefing'
import { CommandCenter } from './CommandCenter'
import { Prospect } from './Prospect'
import { Email } from './Email'
import { Zone } from './Zone'

const REGISTRY: Partial<Record<NoteType, NodeRendererSet>> = {
  daily_briefing: DailyBriefing,
  command_center: CommandCenter,
  prospect: Prospect,
  email: Email,
  // Zones share one renderer; it discriminates on node_type internally so
  // the four zones' colours/icons/child-types stay in one file.
  home_zone: Zone,
  email_zone: Zone,
  notes_zone: Zone,
  tasks_zone: Zone,
  automation_zone: Zone,
}

export function getRenderer(type: NoteType): NodeRendererSet {
  return REGISTRY[type] ?? Generic
}
