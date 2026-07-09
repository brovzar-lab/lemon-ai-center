import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { chatLimit } from '../middleware/rateLimit'
import { CLAUDE_MODELS } from '@shared/models'
import { loadVoiceProfile, buildDraftRequest } from '../lib/copilot/generateDraft'

export const draftReplyRouter = Router()
draftReplyRouter.use(requireAuth)

const MODEL = CLAUDE_MODELS.balanced

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

// A-12: Rate limit — each call streams from Claude Sonnet
// POST /api/claude/draft-reply
draftReplyRouter.post('/', csrfCheck, chatLimit, async (req, res) => {
  const uid = req.session.uid!
  const { email, toneTier = 'peer' } = req.body as {
    email: { from: string; fromEmail: string; subject: string; snippet: string }
    toneTier: string
  }

  if (!email) {
    return res.status(400).json({ error: { message: 'Email context required' } })
  }

  // Load voice profile + build the request (shared with the non-streaming
  // scan-job path in lib/copilot/generateDraft.ts).
  const voiceProfile = await loadVoiceProfile(uid)
  const { system, messages } = buildDraftRequest(voiceProfile, email, toneTier)

  // Stream the reply
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const anthropic = getAnthropicClient()
  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      thinking: { type: 'disabled' }, // Sonnet 5 defaults to adaptive thinking; keep it off.
      max_tokens: 600,
      system,
      messages,
    })

    // SDK 0.110: MessageStream has no `textStream`; stream text via on('text')
    // and wait for finalMessage() — same pattern as aiChat.ts and brief.ts.
    let fullDraft = ''
    stream.on('text', (text: string) => {
      fullDraft += text
      res.write(`data: ${JSON.stringify({ type: 'token', text })}\n\n`)
    })
    await stream.finalMessage()

    res.write(`data: ${JSON.stringify({ type: 'done', draft: fullDraft })}\n\n`)
  } catch {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Draft generation failed' })}\n\n`)
  }
  res.end()
})
