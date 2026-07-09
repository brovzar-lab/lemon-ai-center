import Anthropic from '@anthropic-ai/sdk'
import { db } from '../firebase'
import { CLAUDE_MODELS } from '@shared/models'

export interface VoiceProfile {
  trained: boolean
  emailsAnalyzed: number
  lastUpdated: string | null
  summary: string
  patterns: { openings: string[]; closings: string[]; avoid: string[]; signature: string }
  tones: Record<string, string>
}

export interface EmailContext {
  from: string
  fromEmail: string
  subject: string
  snippet: string
}

export function getDefaultProfile(): VoiceProfile {
  return {
    trained: false,
    emailsAnalyzed: 0,
    lastUpdated: null,
    summary: 'Direct, peer-to-peer. Bilingual ES/EN. Never uses em dashes. Short sentences.',
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

export async function loadVoiceProfile(uid: string): Promise<VoiceProfile> {
  try {
    const snap = await db.collection('users').doc(uid).collection('voiceProfile').doc('current').get()
    return snap.exists ? (snap.data() as VoiceProfile) : getDefaultProfile()
  } catch {
    return getDefaultProfile()
  }
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

export function buildDraftRequest(profile: VoiceProfile, email: EmailContext, toneTier: string) {
  const voicePrompt = buildVoicePrompt(profile, toneTier)
  return {
    system: `You are drafting an email reply AS Billy Rovzar, CEO of Lemon Studios.

${voicePrompt}

Write ONLY the email body. No subject line. No "Dear" unless the tone tier calls for formality. Keep it concise. Match the language of the incoming email (Spanish or English).`,
    messages: [
      {
        role: 'user' as const,
        content: `Draft a reply to this email:
From: ${email.from} <${email.fromEmail}>
Subject: ${email.subject}
Content: ${email.snippet}`,
      },
    ],
  }
}

export async function generateDraft(uid: string, email: EmailContext, toneTier = 'peer'): Promise<string> {
  const profile = await loadVoiceProfile(uid)
  const { system, messages } = buildDraftRequest(profile, email, toneTier)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await anthropic.messages.create({
    model: CLAUDE_MODELS.balanced,
    thinking: { type: 'disabled' },
    max_tokens: 600,
    system,
    messages,
  })
  return res.content[0]?.type === 'text' ? res.content[0].text : ''
}
