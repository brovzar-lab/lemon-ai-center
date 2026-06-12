import { Router } from 'express'
import { db } from '../lib/firebase'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { FieldValue } from 'firebase-admin/firestore'
import { runInboxScan } from '../lib/engine/jobs/inboxScan'

export const scanRouter = Router()
scanRouter.use(requireAuth)

// ──────────────────────────────────────────────────────
// POST /api/scan/inbox
// Manual trigger for the inbox scan. The implementation
// lives in lib/engine/jobs/inboxScan.ts and is shared
// with the 04:30 engine cron job; this route adds the
// scan lock + SSE progress stream for the UI button.
// ──────────────────────────────────────────────────────

scanRouter.post('/inbox', csrfCheck, async (req, res) => {
  const uid = req.session.uid!
  const maxThreads = Math.min(Number(req.body.maxThreads) || 40, 60)

  // Prevent concurrent scans
  const lockRef = db.doc(`users/${uid}/meta/scan_lock`)
  const lockSnap = await lockRef.get()
  if (lockSnap.exists) {
    const lockData = lockSnap.data()
    const lockAge = Date.now() - (lockData?.startedAt?.toMillis?.() ?? 0)
    // Allow re-scan if lock is older than 10 minutes (stale)
    if (lockAge < 10 * 60 * 1000) {
      return res.status(409).json({
        error: {
          code: 'SCAN_IN_PROGRESS',
          message: 'A scan is already running. Please wait.',
          retryable: false,
        },
      })
    }
  }

  await lockRef.set({ startedAt: FieldValue.serverTimestamp(), status: 'running' })

  // Stream progress updates via SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  function sendEvent(type: string, data: Record<string, unknown>) {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  try {
    const stats = await runInboxScan(uid, maxThreads, (phase, message) =>
      sendEvent('progress', { phase, message }),
    )

    await lockRef.set({
      startedAt: FieldValue.serverTimestamp(),
      status: 'completed',
      stats,
    })

    sendEvent('done', { message: 'Scan complete!', stats })
  } catch (err: any) {
    console.error('[scan] Error:', err.message || err)
    await lockRef.delete().catch(() => {})
    sendEvent('error', { message: err.message || 'Scan failed' })
  } finally {
    res.end()
  }
})

// ── Status endpoint ──────────────────────────────────

scanRouter.get('/status', async (req, res) => {
  const uid = req.session.uid!
  const lockRef = db.doc(`users/${uid}/meta/scan_lock`)
  const lockSnap = await lockRef.get()
  if (!lockSnap.exists) {
    return res.json({ data: { status: 'idle' } })
  }
  res.json({ data: lockSnap.data() })
})
