import cron from 'node-cron'
import { db } from '../firebase'
import { ENGINE_TZ } from './constants'
import type { EngineJobId } from '@shared/types'
import { runInboxScan } from './jobs/inboxScan'
import { runMorningAssembly } from './jobs/morningAssembly'
import { runSlipDetect } from './jobs/slipDetect'
import { runNightly } from './jobs/nightly'
import { runEveningWrap } from './jobs/eveningWrap'
import { runWeeklyReview } from './jobs/weeklyReview'
import { runWatchlist } from './jobs/watchlist'
import { runSeedFromVault } from './jobs/seedFromVault'

/**
 * The Engine — every scheduled job that keeps the dashboard alive
 * without Billy clicking anything. Spec §4.
 *
 * Reliability rules:
 * - Every run writes a heartbeat to users/{uid}/engine_jobs/{jobId}
 * - On boot, jobs whose last success is older than their period run
 *   immediately (catch-up) — Railway restarts must not kill the schedule
 * - Failures land in the ledger and surface as banners in the UI
 */

interface JobDef {
  id: EngineJobId
  /** node-cron expression, evaluated in ENGINE_TZ */
  schedule: string
  /** Expected period in ms — drives boot catch-up */
  periodMs: number
  /** Run on boot when overdue? */
  catchUp: boolean
  run: (uid: string) => Promise<unknown>
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

export const JOBS: JobDef[] = [
  {
    id: 'inbox_scan',
    schedule: '30 */2 * * *',   // every 2 hours — always-fresh inbox intelligence
    periodMs: 2 * HOUR,
    catchUp: true,
    run: (uid) => runInboxScan(uid, 40),
  },
  {
    id: 'morning_assembly',
    schedule: '30 5 * * *',
    periodMs: DAY,
    catchUp: true,
    run: runMorningAssembly,
  },
  {
    id: 'slip_detect',
    schedule: '0 7-22 * * *',
    periodMs: HOUR,
    catchUp: true,
    run: runSlipDetect,
  },
  {
    id: 'evening_wrap',
    schedule: '0 18 * * *',
    periodMs: DAY,
    catchUp: false, // pointless to catch up in the morning
    run: runEveningWrap,
  },
  {
    id: 'nightly',
    schedule: '0 23 * * *',
    periodMs: DAY,
    catchUp: true,
    run: runNightly,
  },
  {
    id: 'weekly_review',
    schedule: '0 17 * * 0',
    periodMs: 7 * DAY,
    catchUp: true,
    run: runWeeklyReview,
  },
  {
    id: 'watchlist',
    schedule: '10 15 * * 1-5',
    periodMs: DAY,
    catchUp: false,
    run: runWatchlist,
  },
]

const running = new Set<EngineJobId>()

export async function runJob(uid: string, jobId: EngineJobId): Promise<void> {
  const def =
    jobId === 'seed_from_vault'
      ? { id: jobId, run: runSeedFromVault }
      : JOBS.find((j) => j.id === jobId)
  if (!def) throw new Error(`Unknown engine job: ${jobId}`)
  if (running.has(jobId)) {
    console.log(`[engine] ${jobId} already running — skipping`)
    return
  }

  running.add(jobId)
  const ledger = db.doc(`users/${uid}/engine_jobs/${jobId}`)
  const startedAt = Date.now()
  await ledger.set(
    { jobId, status: 'running', lastRun: new Date().toISOString() },
    { merge: true },
  )

  try {
    await def.run(uid)
    await ledger.set(
      {
        jobId,
        status: 'ok',
        lastRun: new Date(startedAt).toISOString(),
        lastSuccess: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        error: null,
      },
      { merge: true },
    )
    console.log(`[engine] ${jobId} ok in ${Date.now() - startedAt}ms`)
  } catch (err) {
    const message = (err as Error).message ?? String(err)
    await ledger.set(
      {
        jobId,
        status: 'error',
        lastRun: new Date(startedAt).toISOString(),
        durationMs: Date.now() - startedAt,
        error: message,
      },
      { merge: true },
    )
    console.error(`[engine] ${jobId} FAILED: ${message}`)
  } finally {
    running.delete(jobId)
  }
}

/** Boot catch-up: run anything whose last success is older than its period. */
async function catchUp(uid: string): Promise<void> {
  const snap = await db.collection(`users/${uid}/engine_jobs`).get()
  const ledger = new Map(snap.docs.map((d) => [d.id, d.data()]))

  for (const job of JOBS) {
    if (!job.catchUp) continue
    const lastSuccess = ledger.get(job.id)?.lastSuccess as string | undefined
    const age = lastSuccess ? Date.now() - new Date(lastSuccess).getTime() : Infinity
    if (age > job.periodMs * 1.25) {
      console.log(
        `[engine] Catch-up: ${job.id} last succeeded ${lastSuccess ?? 'never'} — running now`,
      )
      // Sequential on purpose — don't slam Gmail/Anthropic on boot
      await runJob(uid, job.id)
    }
  }
}

/** Wire the engine to the cron clock. Call once at server boot. */
export function initEngine(): void {
  const uid = process.env.CEO_UID
  if (!uid) {
    console.warn('[engine] CEO_UID not set — engine disabled (manual triggers still work)')
    return
  }

  for (const job of JOBS) {
    cron.schedule(job.schedule, () => void runJob(uid, job.id), { timezone: ENGINE_TZ })
  }
  console.log(`[engine] ${JOBS.length} jobs scheduled (${ENGINE_TZ})`)

  // Defer boot work so the server is responsive immediately:
  // first-run seeding, then overdue-job catch-up.
  setTimeout(() => {
    void (async () => {
      try {
        await runJob(uid, 'seed_from_vault')
        await catchUp(uid)
      } catch (err) {
        console.error('[engine] Boot sequence failed:', (err as Error).message)
      }
    })()
  }, 15_000)
}
