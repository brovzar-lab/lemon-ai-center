import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '../lib/firebase'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { chatLimit } from '../middleware/rateLimit'

export const draftReplyRouter = Router()
draftReplyRouter.use(requireAuth)

const MODEL = 'claude-sonnet-4-6'

interface VoiceProfile {
  trained: boolean
  emailsAnalyzed: number
  lastUpdated: string | null
  summary: string
  patterns: {
    openings: string[]
    closings: string[]
    avoid: string[]
    signature: string
  }
  tones: Record<string, string>
}

function buildVoicePrompt(profile: VoiceProfile, toneTier: string): string {
  const tone = profile.tones[toneTier] || profile.tones.peer || ''
  return `BILLY ROVZAR'S VOICE PROFILE:
${profile.summary}

TONE FOR THIS RECIPIENT (${toneTier}): ${tone}

SIGNATURE PATTERNS:
- Openings he uses: ${profile.patterns.openings.join(', ') || 'direct openings, no preamble'}
- Closings: ${profile.patterns.closings.join(' or ') || 'Billy'}
- Always avoids: ${profile.patterns.avoid.join(', ') || 'em dashes, corporate speak'}

${profile.trained
  ? `Profile trained on ${profile.emailsAnalyzed} of his sent emails.`
  : 'Profile not yet trained. Using base description.'}

NEVER use em dashes. Use commas or periods. Match the language of the original (ES or EN).`
}

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

  // Load voice profile
  let voiceProfile: VoiceProfile
  try {
    const snap = await db.collection('users').doc(uid).collection('voiceProfile').doc('current').get()
    voiceProfile = snap.exists ? (snap.data() as VoiceProfile) : getDefaultProfile()
  } catch {
    voiceProfile = getDefaultProfile()
  }

  const voicePrompt = buildVoicePrompt(voiceProfile, toneTier)

  // Stream the reply
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const anthropic = getAnthropicClient()
  try {
    const stream: any = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 600,
      system: `You are drafting an email reply AS Billy Rovzar, CEO of Lemon Studios.

${voicePrompt}

Write ONLY the email body. No subject line. No "Dear" unless the tone tier calls for formality. Keep it concise. Match the language of the incoming email (Spanish or English).`,
      messages: [
        {
          role: 'user',
          content: `Draft a reply to this email:
From: ${email.from} <${email.fromEmail}>
Subject: ${email.subject}
Content: ${email.snippet}`,
        },
      ],
    } as any)

    let fullDraft = ''
    for await (const text of stream.textStream) {
      fullDraft += text
      res.write(`data: ${JSON.stringify({ type: 'token', text })}\n\n`)
    }

    res.write(`data: ${JSON.stringify({ type: 'done', draft: fullDraft })}\n\n`)
  } catch {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Draft generation failed' })}\n\n`)
  }
  res.end()
})

function getDefaultProfile(): VoiceProfile {
  return {
    trained: false,
    emailsAnalyzed: 0,
    lastUpdated: null,
    summary: "Direct, peer-to-peer. Bilingual ES/EN. Never uses em dashes. Short sentences.",
    patterns: {
      openings: ['Quick one:', 'Heads up:', 'Just confirming:'],
      closings: ['Billy', 'B.'],
      avoid: ['em dashes', 'I hope this finds you well', 'circling back'],
      signature: 'Billy',
    },
    tones: {
      inner: 'Casual, direct, mixed Spanish/English.',
      peer: 'Warm but efficient. Match their language.',
      exec: 'Crisp, careful. No slang.',
      legal: 'Precise, formal-ish. Reference specifics.',
      talent: 'Generous, encouraging. Lead with the positive.',
    },
  }
}
