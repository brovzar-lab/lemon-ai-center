import { readTrackers, writeState } from '../data'
import { detectSlips } from '../slips'
import { rankFronts } from '../ranker'

/**
 * Hourly: recompute slips and re-rank the five fronts so the Spine
 * reorders itself during the day as things move (or don't).
 */
export async function runSlipDetect(uid: string): Promise<void> {
  const trackers = await readTrackers(uid)
  const slips = detectSlips({
    delegations: trackers.delegations,
    deals: trackers.deals,
    scripts: trackers.scripts,
    deadlines: trackers.deadlines,
  })

  const fronts = rankFronts({
    investors: trackers.investors,
    fundState: trackers.fundState,
    scripts: trackers.scripts,
    deadlines: trackers.deadlines,
    slips,
    projects: trackers.projects,
    deals: trackers.deals,
    burnout: trackers.burnout,
    ventures: trackers.ventures,
  })

  const computedAt = new Date().toISOString()
  await Promise.all([
    writeState(uid, 'slips', { slips, computedAt }),
    writeState(uid, 'fronts', { fronts, computedAt }),
  ])
}
