import { Router } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/firebase'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import fs from 'fs'
import path from 'path'

export const capturesRouter = Router()
capturesRouter.use(requireAuth)

const VALID_KINDS = new Set(['todo', 'idea', 'delegate', 'decision'])

/** POST /api/captures — create a capture (todo/idea/delegate/decision) */
capturesRouter.post('/', csrfCheck, async (req, res) => {
  try {
    const uid = req.session.uid!
    const { text, kind, type, context, choice, detail, timestamp } = req.body

    // Support both the old {text, kind} shape and the new decision {type, context, choice, detail} shape
    const captureKind = kind || type
    const captureText = text || (choice ? `${context ? context + '\n→ ' : ''}${choice}` : '')

    if (!captureText || typeof captureText !== 'string' || captureText.length > 2000) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'text is required (max 2000 chars)', retryable: false } })
    }
    if (!captureKind || !VALID_KINDS.has(captureKind)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'kind must be todo, idea, delegate, or decision', retryable: false } })
    }

    // Save to Firestore
    const ref = await db.collection(`users/${uid}/captures`).add({
      text: captureText.trim(),
      kind: captureKind,
      context: context || null,
      reviewed: false,
      createdAt: FieldValue.serverTimestamp(),
    })

    // For decisions: also write to Obsidian vault as a markdown log entry
    if (captureKind === 'decision') {
      try {
        const vaultPath = process.env.OBSIDIAN_VAULT_PATH
        if (vaultPath) {
          const decisionsDir = path.join(vaultPath, 'raw')
          if (!fs.existsSync(decisionsDir)) fs.mkdirSync(decisionsDir, { recursive: true })
          const decisionsFile = path.join(decisionsDir, 'decisions-log.md')
          const date = new Date(timestamp || Date.now())
          const dateStr = date.toISOString().split('T')[0]
          const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          const entry = `\n## ${dateStr} ${timeStr}\n**Context:** ${context || 'N/A'}\n**Decision:** ${choice}\n**Rationale:** ${detail || 'N/A'}\n\n---`

          // Create file with header if it doesn't exist
          if (!fs.existsSync(decisionsFile)) {
            fs.writeFileSync(decisionsFile, '# CEO Decision Log\n\nDecisions made from the dashboard, synced automatically.\n\n---', 'utf8')
          }
          fs.appendFileSync(decisionsFile, entry, 'utf8')

          // On Railway: commit + push so the decision flows back to Mac
          if (process.env.OBSIDIAN_VAULT_GIT_URL) {
            const { exec } = require('child_process')
            exec(
              `cd "${vaultPath}" && git add raw/decisions-log.md && git commit -m "decision: ${dateStr}" && git push`,
              { timeout: 30_000 },
              (err: Error | null) => {
                if (err) console.warn('[captures] Git push failed (non-fatal):', err.message)
                else console.log('[captures] Decision pushed to GitHub')
              }
            )
          }
        }
      } catch (vaultErr) {
        // Non-fatal — decision is saved in Firestore regardless
        console.warn('[captures] Could not write decision to vault:', vaultErr)
      }
    }

    res.json({ data: { id: ref.id } })
  } catch (err) {
    console.error('POST /api/captures error:', err)
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to create capture', retryable: true } })
  }
})

/** GET /api/captures — list captures for the authenticated user */
capturesRouter.get('/', async (req, res) => {
  try {
    const uid = req.session.uid!
    const snap = await db.collection(`users/${uid}/captures`)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get()

    const captures = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    }))

    res.json({ data: captures })
  } catch (err) {
    console.error('GET /api/captures error:', err)
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to list captures', retryable: true } })
  }
})

/** PATCH /api/captures/:id/review — mark a capture as reviewed */
capturesRouter.patch('/:id/review', csrfCheck, async (req, res) => {
  try {
    const uid = req.session.uid!
    const { id } = req.params

    await db.doc(`users/${uid}/captures/${id}`).update({
      reviewed: true,
    })

    res.json({ data: { id, reviewed: true } })
  } catch (err) {
    console.error('PATCH /api/captures/:id/review error:', err)
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to mark capture reviewed', retryable: true } })
  }
})
