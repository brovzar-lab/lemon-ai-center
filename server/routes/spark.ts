import { Router } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/firebase'
import { SPARK_SYSTEM } from '../lib/prompts'
import { csrfCheck } from '../middleware/csrfCheck'
import { sparkLimit } from '../middleware/rateLimit'
import { getAnthropicClient } from '../lib/anthropic'
import { CLAUDE_MODELS } from '@shared/models'

export const sparkRouter = Router()

const MODEL_SPARK = CLAUDE_MODELS.fast

// --- Spark route ---

sparkRouter.post('/spark', csrfCheck, sparkLimit, async (req, res) => {
  const uid = req.session.uid!

  const cacheDoc = await db.collection(`users/${uid}/spark_cache`).doc('current').get()
  if (cacheDoc.exists) {
    const data = cacheDoc.data()!
    const expiresAt: number = data.expiresAt?.toMillis?.() ?? 0
    if (expiresAt > Date.now()) {
      return res.json({ data: { text: data.text, cached: true } })
    }
  }

  const anthropic = getAnthropicClient()
  try {
    const response = await anthropic.messages.create({
      model: MODEL_SPARK,
      max_tokens: 150,
      system: SPARK_SYSTEM,
      messages: [{ role: 'user', content: 'Generate a spark question.' }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    await db.collection(`users/${uid}/spark_cache`).doc('current').set({
      text,
      generatedAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    res.json({ data: { text, cached: false } })
  } catch {
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Spark generation failed', retryable: true } })
  }
})
