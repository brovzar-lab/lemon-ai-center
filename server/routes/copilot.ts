import { Router } from 'express'
import { db } from '../lib/firebase'
import { requireAuth } from '../middleware/requireAuth'
import type { CopilotDraft } from '@shared/types'

export const copilotRouter = Router()
copilotRouter.use(requireAuth)

// GET /api/copilot/drafts — cached drafts for the authed user, keyed by threadId.
copilotRouter.get('/drafts', async (req, res) => {
  const uid = req.session.uid!
  try {
    const snap = await db.collection(`users/${uid}/copilotDrafts`).get()
    const out: Record<string, CopilotDraft> = {}
    for (const d of snap.docs) out[d.id] = d.data() as CopilotDraft
    res.json({ data: out })
  } catch {
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Failed to load drafts', retryable: true } })
  }
})
