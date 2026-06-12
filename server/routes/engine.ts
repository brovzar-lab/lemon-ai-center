import { Router } from 'express'
import { db } from '../lib/firebase'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { makeRateLimit } from '../middleware/rateLimit'
import { runJob, JOBS } from '../lib/engine'
import type { EngineJobId } from '@shared/types'

export const engineRouter = Router()
engineRouter.use(requireAuth)

const VALID_JOBS = new Set<string>([...JOBS.map((j) => j.id), 'seed_from_vault'])

/**
 * GET /api/engine/status — the job ledger (heartbeats) for the UI.
 */
engineRouter.get('/status', async (req, res) => {
  const uid = req.session.uid!
  const snap = await db.collection(`users/${uid}/engine_jobs`).get()
  res.json({ data: { jobs: snap.docs.map((d) => d.data()) } })
})

// Manual run-now is rate limited — each job hits Gmail/Anthropic
const runLimit = makeRateLimit(60_000, 4)

/**
 * POST /api/engine/run/:jobId — manual "run now" per job (settings UI).
 * Fire-and-forget: responds immediately; the ledger reports progress.
 */
engineRouter.post('/run/:jobId', csrfCheck, runLimit, async (req, res) => {
  const uid = req.session.uid!
  const jobId = req.params.jobId
  if (!VALID_JOBS.has(jobId)) {
    return res.status(400).json({
      error: { code: 'UNKNOWN_JOB', message: `Unknown job: ${jobId}`, retryable: false },
    })
  }
  void runJob(uid, jobId as EngineJobId)
  res.json({ data: { started: jobId } })
})
