import { Router } from 'express'
import { db } from '../lib/firebase'
import { requireAuth } from '../middleware/requireAuth'
import { requireCronSecret } from '../middleware/cronAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { makeRateLimit } from '../middleware/rateLimit'
import { runJob, JOBS } from '../lib/engine'
import type { EngineJobId } from '@shared/types'

export const engineRouter = Router()

const VALID_JOBS = new Set<string>([...JOBS.map((j) => j.id), 'seed_from_vault'])

/**
 * C-2: POST /api/engine/cron/:jobId — Railway Cron HTTP trigger.
 *
 * Secured by ENGINE_CRON_SECRET (not a user session).
 * Runs the job synchronously so the cron service can report success/failure.
 * Registered BEFORE requireAuth so it doesn't need a session cookie.
 */
engineRouter.post('/cron/:jobId', requireCronSecret, async (req, res) => {
  const uid = process.env.CEO_UID
  if (!uid) {
    res.status(503).json({
      error: { code: 'NO_UID', message: 'CEO_UID not configured', retryable: false },
    })
    return
  }
  const jobId = req.params.jobId
  if (!VALID_JOBS.has(jobId)) {
    res.status(400).json({
      error: { code: 'UNKNOWN_JOB', message: `Unknown job: ${jobId}`, retryable: false },
    })
    return
  }

  const startedAt = Date.now()
  try {
    await runJob(uid, jobId as EngineJobId)
    res.json({ data: { ok: true, jobId, durationMs: Date.now() - startedAt } })
  } catch (err) {
    res.status(500).json({
      error: { code: 'JOB_FAILED', message: (err as Error).message, retryable: true },
    })
  }
})

// All routes below require an authenticated user session
engineRouter.use(requireAuth)


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
 * POST /api/engine/actions/:id/approve | /dismiss — the autonomy boundary.
 * Outward-facing actions the engine proposed execute only on approval.
 */
engineRouter.post('/actions/:id/:verdict', csrfCheck, async (req, res) => {
  const uid = req.session.uid!
  const { id, verdict } = req.params
  if (verdict !== 'approve' && verdict !== 'dismiss') {
    return res.status(400).json({
      error: { code: 'BAD_VERDICT', message: 'Use approve or dismiss', retryable: false },
    })
  }

  const ref = db.doc(`users/${uid}/actions/${id}`)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.approvalStatus !== 'pending') {
    return res.status(404).json({
      error: { code: 'NOT_PENDING', message: 'No pending action with that id', retryable: false },
    })
  }

  if (verdict === 'dismiss') {
    await ref.update({ approvalStatus: 'dismissed' })
    return res.json({ data: { status: 'dismissed' } })
  }

  const action = snap.data()!
  try {
    if (action.type === 'calendar_block') {
      const { getCalendarClient } = await import('../lib/googleAuth')
      const calendar = await getCalendarClient(uid)
      const p = action.payload as { date: string; startHour: number; endHour: number; title: string }
      const pad = (n: number) => String(n).padStart(2, '0')
      const event = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: p.title,
          description: 'Protected writing block — proposed by Lemon AI Center, approved by Billy.',
          start: {
            dateTime: `${p.date}T${pad(p.startHour)}:00:00`,
            timeZone: 'America/Mexico_City',
          },
          end: {
            dateTime: `${p.date}T${pad(p.endHour)}:00:00`,
            timeZone: 'America/Mexico_City',
          },
        },
      })
      await ref.update({
        approvalStatus: 'approved',
        'target.id': event.data.id ?? '',
      })
      return res.json({ data: { status: 'approved', eventId: event.data.id } })
    }

    // Unknown outward action types: mark approved but execute nothing
    await ref.update({ approvalStatus: 'approved' })
    res.json({ data: { status: 'approved' } })
  } catch (err) {
    console.error('[engine] Approval execution failed:', (err as Error).message)
    res.status(500).json({
      error: { code: 'EXEC_FAILED', message: 'Action approved but execution failed — try again', retryable: true },
    })
  }
})

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
