import type { NoteType } from '../../types'
import type { NodeRendererSet } from './types'
import { Generic } from './Generic'
import { DailyBriefing } from './DailyBriefing'
import { CommandCenter } from './CommandCenter'
import { Prospect } from './Prospect'

const REGISTRY: Partial<Record<NoteType, NodeRendererSet>> = {
  daily_briefing: DailyBriefing,
  command_center: CommandCenter,
  prospect: Prospect,
}

export function getRenderer(type: NoteType): NodeRendererSet {
  return REGISTRY[type] ?? Generic
}
