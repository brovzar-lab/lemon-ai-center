import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { getGmailClient, getCalendarClient } from '../lib/googleAuth'

export const tasksRouter = Router()
tasksRouter.use(requireAuth)

const HISTORY_DAYS = 14

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

// POST /api/tasks/generate
// Scans last 14 days of Gmail + Calendar, uses Claude to surface pending action items.
// Returns suggestions only — the client writes them to Firestore via the Firebase client SDK.
tasksRouter.post('/generate', csrfCheck, async (req, res) => {
  const uid = req.session.uid!
  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000)

  // ── Gmail ────────────────────────────────────────────────────────────────
  let emailLines: string[] = []
  try {
    const gmail = await getGmailClient(uid)
    const listRes = await gmail.users.threads.list({
      userId: 'me',
      maxResults: 30,
      q: `in:inbox after:${Math.floor(since.getTime() / 1000)}`,
    })
    const threads = listRes.data.threads ?? []

    for (const t of threads.slice(0, 20)) {
      try {
        const full = await gmail.users.threads.get({ userId: 'me', id: t.id!, format: 'METADATA' })
        const msgs = full.data.messages ?? []
        if (!msgs.length) continue
        const last = msgs[msgs.length - 1]
        const hdrs = (last.payload?.headers ?? []) as { name: string; value: string }[]
        const get = (n: string) => hdrs.find((h) => h.name.toLowerCase() === n)?.value ?? ''
        const dateStr = get('date')
        const dateLabel = dateStr ? new Date(dateStr).toLocaleDateString() : '?'
        emailLines.push(
          `[${dateLabel}] FROM: ${get('from')} | SUBJECT: ${get('subject')} | ${(t.snippet ?? '').slice(0, 200)}`,
        )
      } catch {}
    }
  } catch (err) {
    console.warn('[tasks/generate] Gmail fetch skipped:', (err as Error).message)
  }

  // ── Calendar ──────────────────────────────────────────────────────────────
  let calLines: string[] = []
  try {
    const calendar = await getCalendarClient(uid)
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: since.toISOString(),
      timeMax: new Date().toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20,
    })
    for (const item of (response.data.items ?? []) as any[]) {
      const start = item.start?.dateTime || item.start?.date || ''
      const label = start ? new Date(start).toLocaleDateString() : '?'
      calLines.push(`[${label}] MEETING: ${item.summary || '(No title)'} | ${(item.description ?? '').slice(0, 120)}`)
    }
  } catch (err) {
    console.warn('[tasks/generate] Calendar fetch skipped:', (err as Error).message)
  }

  // ── Claude ────────────────────────────────────────────────────────────────
  try {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })

    const prompt = `Today is ${today}.

You are a chief of staff helping Billy Rovzar (CEO, Lemon Studios) identify unfinished action items from the past 2 weeks.

EMAILS (last ${HISTORY_DAYS} days):
${emailLines.length ? emailLines.join('\n') : '(none)'}

CALENDAR EVENTS (last ${HISTORY_DAYS} days):
${calLines.length ? calLines.join('\n') : '(none)'}

Identify 5–12 concrete tasks likely still PENDING. Focus on emails needing replies, meeting follow-ups, and unresolved deals or deliverables.

Bucket assignments:
- "now"  = urgent/overdue, needs attention today
- "next" = important, this week
- "orbit" = watching, lower priority

Respond ONLY with a valid JSON array — no markdown, no explanation:
[{"title":"string","bucket":"now"|"next"|"orbit","source":"email"|"meeting"|"ai-suggested","notes":"string or null"}]

Keep titles concise and action-oriented (verb + object). Max 12 items.`

    const client = getAnthropicClient()
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (message.content[0] as any).text.trim()
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
    const suggestions = JSON.parse(jsonStr)

    res.json({ data: { suggestions } })
  } catch (err) {
    console.error('[tasks/generate] Claude error:', err)
    res.status(500).json({ error: { code: 'GENERATE_FAILED', message: 'Failed to generate tasks', retryable: true } })
  }
})
