import type {
  EngineSlip,
  LemonDeal,
  LemonDelegation,
  Script,
  Deadline,
} from '@shared/types'
import { THRESHOLDS, daysBetween } from './constants'

/**
 * Pure slip detection over tracker data. The hourly engine job feeds it
 * fresh reads from Firestore; tests feed it fixtures.
 */
export function detectSlips(
  input: {
    delegations: LemonDelegation[]
    deals: LemonDeal[]
    scripts: Script[]
    deadlines: Deadline[]
  },
  now: Date = new Date(),
): EngineSlip[] {
  const slips: EngineSlip[] = []
  const detectedAt = now.toISOString()

  for (const d of input.delegations) {
    if (d.status !== 'pending' || !d.expected_by) continue
    const overdue = daysBetween(d.expected_by, now)
    if (overdue <= 0) continue
    slips.push({
      id: `delegation:${d.id}`,
      kind: 'delegation',
      refId: d.id,
      summary: `${d.person}: ${d.task}`,
      detail: `Overdue ${overdue}d (expected ${d.expected_by})`,
      severity: overdue >= 3 ? 'critical' : 'warn',
      detectedAt,
    })
  }

  for (const deal of input.deals) {
    if (deal.status === 'closed' || !deal.updated_at) continue
    const idle = daysBetween(deal.updated_at, now)
    if (idle < THRESHOLDS.DEAL_STALL_DAYS) continue
    slips.push({
      id: `deal:${deal.id}`,
      kind: 'deal',
      refId: deal.id,
      summary: `${deal.name} has no movement in ${idle}d`,
      detail: deal.next_action ? `Next action: ${deal.next_action}` : undefined,
      severity: idle >= THRESHOLDS.DEAL_STALL_DAYS * 2 ? 'critical' : 'warn',
      detectedAt,
    })
  }

  for (const s of input.scripts) {
    if (s.stage === 'delivered' || !s.lastTouchedAt) continue
    const idle = daysBetween(s.lastTouchedAt, now)
    if (idle < THRESHOLDS.SCRIPT_STALE_DAYS) continue
    slips.push({
      id: `script:${s.id}`,
      kind: 'script',
      refId: s.id,
      summary: `${s.title} untouched for ${idle}d`,
      detail: `Stage: ${s.stage}${s.draftNumber ? ` ${s.draftNumber}` : ''}`,
      severity: idle >= THRESHOLDS.SCRIPT_STALE_DAYS * 2 ? 'critical' : 'warn',
      detectedAt,
    })
  }

  for (const dl of input.deadlines) {
    const daysOut = -daysBetween(dl.date, now) // future dates → positive
    if (daysOut < 0 || daysOut > THRESHOLDS.DEADLINE_WARN_DAYS) continue
    slips.push({
      id: `deadline:${dl.id}`,
      kind: 'deadline',
      refId: dl.id,
      summary: `${dl.title} in ${daysOut}d`,
      detail: dl.notes,
      severity:
        dl.severity === 'hard' && daysOut <= THRESHOLDS.DEADLINE_CRITICAL_DAYS
          ? 'critical'
          : 'warn',
      detectedAt,
    })
  }

  const order = { critical: 0, warn: 1 } as const
  return slips.sort((a, b) => order[a.severity] - order[b.severity])
}
