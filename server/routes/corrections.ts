import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/firebase'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { makeRateLimit } from '../middleware/rateLimit'

export const correctionsRouter = Router()
correctionsRouter.use(requireAuth)

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

// A-11: Rate limit — each call triggers an Anthropic call + a Firestore write
const correctionsLimit = makeRateLimit(60_000, 5)

/**
 * POST /api/corrections
 * Body: { correction: string, context?: string }
 *
 * Saves a CEO correction as a persistent MEMORY entry in Firestore
 * (users/{uid}/memories), source 'manual'. Active memories are injected into
 * every future briefing (see assembleContext in brief.ts) and read by the AI
 * chat — so corrections take effect and survive redeploys, unlike the old
 * ephemeral Obsidian briefing-rules.md file.
 */
correctionsRouter.post('/', csrfCheck, correctionsLimit, async (req, res) => {
  const { correction, context } = req.body as { correction: string; context?: string }
  const uid = req.session.uid!

  if (!correction?.trim()) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Correction text is required', retryable: false },
    })
  }

  try {
    // Distill the correction into one clean, declarative memory statement.
    // If the AI step fails, fall back to storing the raw correction verbatim.
    let memory = correction.trim()
    let summary = 'Correction saved'
    try {
      const anthropic = getAnthropicClient()
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: `You convert a CEO's correction into ONE clear, declarative memory statement the assistant should remember and honor going forward.
Return ONLY valid JSON (no markdown): {"memory": "<one concise fact or instruction, e.g. 'Script Magazine is a newsletter — never surface it as HOT priority'>", "summary": "<≤8 word summary>"}`,
        messages: [{
          role: 'user',
          content: `CEO correction: "${correction}"${context ? `\n\nDashboard context: ${context}` : ''}`,
        }],
      })
      const aiText = response.content[0].type === 'text' ? response.content[0].text : '{}'
      const cleaned = aiText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
      const parsed = JSON.parse(cleaned) as { memory?: string; summary?: string }
      if (parsed.memory?.trim()) memory = parsed.memory.trim()
      if (parsed.summary?.trim()) summary = parsed.summary.trim()
    } catch {
      // Keep the raw correction as the memory text
    }

    await db.collection(`users/${uid}/memories`).add({
      text: memory,
      source: 'manual',
      active: true,
      learned_at: FieldValue.serverTimestamp(),
    })

    console.log(`[corrections] Saved memory: "${summary}"`)

    res.json({ data: { memory, summary, savedTo: 'memory' } })
  } catch (err) {
    console.error('[corrections] Error:', (err as Error).message)
    res.status(500).json({
      error: { code: 'CORRECTION_FAILED', message: 'Failed to save correction', retryable: true },
    })
  }
})

/**
 * GET /api/corrections/rules
 * Back-compat: returns the active memory statements as a newline list.
 */
correctionsRouter.get('/rules', async (req, res) => {
  const uid = req.session.uid!
  try {
    const snap = await db.collection(`users/${uid}/memories`).where('active', '==', true).get()
    const rules = snap.docs
      .map((d) => (d.data() as { text?: string }).text)
      .filter(Boolean)
      .map((t) => `- ${t}`)
      .join('\n')
    res.json({ data: { rules, exists: snap.size > 0 } })
  } catch {
    res.json({ data: { rules: '', exists: false } })
  }
})
