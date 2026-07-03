import type { SlateProject, SlateStage } from './types'

/**
 * The staleness engine (spec §5) — pure date math shared by the board
 * (heat chips) and, later, the briefing engine's "Going Stale" section.
 *
 * Threshold resolution, in order:
 *   1. `staleness_days` in project.yaml — the explicit per-project dial —
 *      beats everything (the clock still follows the waiting_on state).
 *   2. `waiting_on` set → the project is out to someone: 14 days when that
 *      someone is one of the project's writers, 10 otherwise (buyer/
 *      platform/anyone else). The clock runs from waiting_on.since.
 *   3. Otherwise the stage default, clocked from last_touched:
 *        idea/concept                                   30
 *        treatment/outline/bible/pilot-outline          21
 *        draft1/pilot-draft/rewrites/polish/season-arc   7   (active writing)
 *        market-ready                                   10   (out to market)
 *   4. paused and dead projects are excluded from staleness entirely
 *      (paused gets resurfaced monthly by the briefing engine, not here).
 */

export type StalenessLevel = 'fresh' | 'aging' | 'stale'

export interface StalenessAssessment {
  /** paused/dead — no heat, no nagging */
  excluded: boolean
  /** days on the active clock (touch or waiting) */
  days: number
  threshold: number
  /** days / threshold; >= 1 means over the line */
  ratio: number
  level: StalenessLevel
  clock: 'touch' | 'waiting'
}

const STAGE_THRESHOLDS: Record<SlateStage, number> = {
  idea: 30,
  concept: 30,
  treatment: 21,
  outline: 21,
  bible: 21,
  'pilot-outline': 21,
  draft1: 7,
  'pilot-draft': 7,
  rewrites: 7,
  polish: 7,
  'season-arc': 7,
  'market-ready': 10,
}

export const AGING_RATIO = 0.7 // within sight of the threshold

const DAY_MS = 86_400_000

function daysBetween(fromISO: string, now: Date): number {
  const from = new Date(fromISO).getTime()
  if (Number.isNaN(from)) return 0
  return Math.max(0, Math.floor((now.getTime() - from) / DAY_MS))
}

export function assessStaleness(project: SlateProject, now: Date): StalenessAssessment {
  if (project.status !== 'active') {
    return { excluded: true, days: 0, threshold: 0, ratio: 0, level: 'fresh', clock: 'touch' }
  }

  const waiting = project.waiting_on ?? null
  const clock: 'touch' | 'waiting' = waiting ? 'waiting' : 'touch'

  let threshold: number
  if (project.staleness_days && project.staleness_days > 0) {
    threshold = project.staleness_days
  } else if (waiting) {
    const isWriter = (project.writers ?? []).some((w) => w.name === waiting.who)
    threshold = isWriter ? 14 : 10
  } else {
    threshold = STAGE_THRESHOLDS[project.stage] ?? 21
  }

  const since = waiting ? waiting.since : project.last_touched ?? project.updated_at
  const days = since ? daysBetween(since, now) : 0
  const ratio = threshold > 0 ? days / threshold : 0
  const level: StalenessLevel = ratio >= 1 ? 'stale' : ratio >= AGING_RATIO ? 'aging' : 'fresh'

  return { excluded: false, days, threshold, ratio, level, clock }
}
