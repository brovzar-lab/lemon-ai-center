import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { CHAT_SYSTEM } from '../lib/prompts'
import { csrfCheck } from '../middleware/csrfCheck'
import { chatLimit } from '../middleware/rateLimit'
import { getAnthropicClient } from '../lib/anthropic'
import { CLAUDE_MODELS } from '@shared/models'

export const chatRouter = Router()

const MODEL_CHAT = CLAUDE_MODELS.balanced

// --- Chat route: agentic — can read live state and act on the trackers ---

chatRouter.post('/chat', csrfCheck, chatLimit, async (req, res) => {
  const uid = req.session.uid!
  const { message, context } = req.body as { message: string; context?: string }

  // Input length validation
  if (typeof message !== 'string' || message.length === 0) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'message must be a non-empty string' } })
  }
  if (message.length > 10_000) {
    return res.status(400).json({ error: { code: 'INPUT_TOO_LONG', message: 'message must not exceed 10,000 characters' } })
  }
  if (context !== undefined && (typeof context !== 'string' || context.length > 30_000)) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'context must be a string of at most 30,000 characters' } })
  }

  const contextNote = context ? `\n\nContext:\n${context}` : ''

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const anthropic = getAnthropicClient()
  try {
    const { CHAT_TOOLS, executeChatTool, buildChatStateBlock } = await import(
      '../lib/engine/chatTools'
    )
    const stateBlock = await buildChatStateBlock(uid)
    const system = `${CHAT_SYSTEM}

You can ACT, not just talk. When Billy tells you something changed (an investor committed, he finished a draft, someone delivered, a new deadline), use the tools to update his trackers immediately — then confirm in one short sentence what you changed. Never claim you updated something without calling the tool. Internal organization is yours to do freely; you cannot send emails or change his calendar.

LIVE STATE (verified, current):
${stateBlock}`

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: message + contextNote },
    ]

    // Agentic loop: stream text; execute tools between rounds (max 5)
    for (let round = 0; round < 5; round++) {
      const stream = anthropic.messages.stream({
        model: MODEL_CHAT,
        // Sonnet 5 defaults to adaptive thinking; keep it off to preserve
        // behavior and protect the small token budget.
        thinking: { type: 'disabled' },
        max_tokens: 1024,
        system,
        tools: CHAT_TOOLS,
        messages,
      })

      stream.on('text', (text: string) => {
        res.write(`data: ${JSON.stringify({ type: 'token', text })}\n\n`)
      })

      const final = await stream.finalMessage()
      if (final.stop_reason !== 'tool_use') break

      messages.push({ role: 'assistant', content: final.content })
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const block of final.content) {
        if (block.type !== 'tool_use') continue
        let result: string
        try {
          result = await executeChatTool(uid, block.name, block.input as Record<string, any>)
        } catch (err) {
          result = `Tool failed: ${(err as Error).message}`
        }
        // Surface the action to the UI so Billy sees what changed
        res.write(`data: ${JSON.stringify({ type: 'action', tool: block.name, result })}\n\n`)
        results.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }
      messages.push({ role: 'user', content: results })
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
  } catch (err: any) {
    console.error('[chat] Error:', err?.status, err?.message ?? err)
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'An internal error occurred' })}\n\n`)
  }
  res.end()
})
