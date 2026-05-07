import { Router } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/firebase'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'

export const actionsRouter = Router()
actionsRouter.use(requireAuth)

const VALID_TYPES = new Set(['archive', 'label', 'draft', 'delegate', 'delegate_recalled', 'snooze', 'priority_change'])
const VALID_CONFIDENCES = new Set(['high', 'med', 'low'])
const VALID_INITIATORS = new Set(['user', 'ai'])
const VALID_TARGET_KINDS = new Set(['thread', 'task', 'event'])

/** GET /api/actions — list AI actions for the authenticated user (last 24h) */
actionsRouter.get('/', async (req, res) => {
  try {
    const uid = req.session.uid!
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const snap = await db.collection(`users/${uid}/actions`)
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get()

    const actions = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      expiresAt: d.data().expiresAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    }))

    res.json({ data: actions })
  } catch (err) {
    console.error('GET /api/actions error:', err)
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to list actions', retryable: true } })
  }
})

/** POST /api/actions — create an AI action entry */
actionsRouter.post('/', csrfCheck, async (req, res) => {
  try {
    const uid = req.session.uid!
    const { type, target, sourceRef, confidence, initiator, reversible } = req.body

    // Validate required fields
    if (!type || !VALID_TYPES.has(type)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: `type must be one of: ${[...VALID_TYPES].join(', ')}`, retryable: false } })
    }
    if (!target?.kind || !VALID_TARGET_KINDS.has(target.kind) || !target.id || !target.label) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'target must have kind (thread|task|event), id, and label', retryable: false } })
    }
    if (!confidence || !VALID_CONFIDENCES.has(confidence)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'confidence must be high, med, or low', retryable: false } })
    }
    if (!initiator || !VALID_INITIATORS.has(initiator)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'initiator must be user or ai', retryable: false } })
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const ref = await db.collection(`users/${uid}/actions`).add({
      type,
      target,
      sourceRef: sourceRef ?? null,
      confidence,
      initiator,
      reversible: reversible ?? true,
      undone: false,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
    })

    res.json({ data: { id: ref.id } })
  } catch (err) {
    console.error('POST /api/actions error:', err)
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to create action', retryable: true } })
  }
})

/** POST /api/actions/:id/undo — undo an AI action */
actionsRouter.post('/:id/undo', csrfCheck, async (req, res) => {
  try {
    const uid = req.session.uid!
    const { id } = req.params

    const docRef = db.doc(`users/${uid}/actions/${id}`)
    const snap = await docRef.get()

    if (!snap.exists) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Action not found', retryable: false } })
    }

    const data = snap.data()!
    if (!data.reversible) {
      return res.status(400).json({ error: { code: 'NOT_REVERSIBLE', message: 'This action cannot be undone', retryable: false } })
    }
    if (data.undone) {
      return res.status(400).json({ error: { code: 'ALREADY_UNDONE', message: 'Action already undone', retryable: false } })
    }

    await docRef.update({ undone: true })

    res.json({ data: { id, undone: true } })
  } catch (err) {
    console.error('POST /api/actions/:id/undo error:', err)
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to undo action', retryable: true } })
  }
})
