import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { loadPrecomputed, isPrecomputeFresh, runPrecompute } from '../lib/precompute'
import { db } from '../lib/firebase'
import type { TodayProgress } from '@shared/consolidation-types'

export const todayRouter = Router()
todayRouter.use(requireAuth)

// Rate limit for precompute (expensive)
const precomputeCooldown = new Map<string, number>()

// A-9: Periodic cleanup sweep to prevent memory leak from stale cooldown entries
setInterval(() => {
  const now = Date.now()
  for (const [key, ts] of precomputeCooldown) {
    if (now - ts > 10 * 60 * 1000) precomputeCooldown.delete(key)
  }
}, 60_000)

todayRouter.get('/today', async (req, res) => {
  try {
    const payload = await loadPrecomputed(req.session.uid)
    if (!payload) {
      return res.json({ data: { priorities: [], northStar: '', precomputeAge: null, precomputeToday: false } })
    }
    res.json({
      data: {
        priorities: payload.priorities,
        northStar: payload.northStar,
        precomputeAge: payload.computedAt,
        precomputeToday: isPrecomputeFresh(payload),
        enrichedFlags: payload.enrichedFlags,
      },
    })
  } catch {
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Failed to load today data', retryable: true } })
  }
})

todayRouter.post('/precompute', csrfCheck, async (req, res) => {
  const uid = req.session.uid!

  // Rate limit: max once per 5 minutes
  const lastRun = precomputeCooldown.get(uid) ?? 0
  if (Date.now() - lastRun < 5 * 60 * 1000) {
    return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Precompute available in 5 minutes', retryable: true } })
  }
  precomputeCooldown.set(uid, Date.now())

  try {
    // Import assembleContext dynamically to avoid circular deps
    const { assembleContext } = await import('./claude')
    const payload = await runPrecompute(uid, assembleContext)
    res.json({ data: { ok: true, priorities: payload.priorities.length, flags: payload.enrichedFlags.length } })
  } catch (err) {
    console.error('[precompute] Error:', (err as Error).message)
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Precompute failed', retryable: true } })
  }
})

todayRouter.get('/today-progress', async (req, res) => {
  const uid = req.session.uid!
  const todayIso = new Date().toISOString().slice(0, 10)

  const progress: TodayProgress = { done: 0, queued: 0, deferred: 0, archived: 0, logged: 0, decisions: 0 }

  try {
    // One pass over the user's tasks: count completed-today and created-today.
    // (Previously two full scans; the second read the whole collection anyway.)
    const tasksSnap = await db.collection(`users/${uid}/tasks`).get()
    for (const doc of tasksSnap.docs) {
      const d = doc.data()
      const doneAt = d.doneAt || ''
      const createdAt = d.createdAt || ''
      if (d.done && typeof doneAt === 'string' && doneAt.startsWith(todayIso)) {
        progress.done++
      } else if (!d.done && typeof createdAt === 'string' && createdAt.startsWith(todayIso)) {
        progress.queued++
      }
    }
  } catch (err) {
    // Do NOT return fabricated zeros as if they were real (that reads as
    // "0 done today" instead of "we couldn't load it"). Surface the failure.
    console.error('[today-progress] Firestore read failed:', (err as Error).message)
    return res.status(500).json({
      error: { code: 'UPSTREAM_ERROR', message: 'Could not load today’s progress', retryable: true },
    })
  }

  res.json({ data: progress })
})

todayRouter.get('/relationships', async (req, res) => {
  try {
    const payload = await loadPrecomputed(req.session.uid)
    const flags = payload?.enrichedFlags ?? []
    res.json({ data: { flags } })
  } catch {
    res.json({ data: { flags: [] } })
  }
})

todayRouter.post('/relationship/log', csrfCheck, async (req, res) => {
  const uid = req.session.uid!
  const { slug, note } = req.body as { slug: string; note?: string }

  // S-12: Validate input lengths
  if (!slug || typeof slug !== 'string' || slug.length > 200) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'slug required (max 200 chars)', retryable: false } })
  }
  if (note && (typeof note !== 'string' || note.length > 2000)) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'note must be under 2000 chars', retryable: false } })
  }

  try {
    await db.collection(`users/${uid}/relationship_logs`).add({
      slug,
      note: note || 'Interaction logged from Lemon AI Center',
      loggedAt: new Date().toISOString(),
    })
    res.json({ data: { ok: true } })
  } catch {
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Failed to log interaction', retryable: true } })
  }
})
