import type { Routine } from './types'
import { stripeConnectionCheck } from './stripeConnectionCheck'

const ROUTINES: Routine[] = [stripeConnectionCheck]

const byKey = new Map<string, Routine>(ROUTINES.map((r) => [r.key, r]))

export function getRoutine(key: string): Routine | null {
  return byKey.get(key) ?? null
}

export function listRoutines(): Routine[] {
  return ROUTINES
}
