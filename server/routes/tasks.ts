import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { getGmailClient, getCalendarClient } from '../lib/googleAuth'

export const tasksRouter = Router()
tasksRouter.use(requireAuth)

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

// POST /api/tasks/generate
// Body: { fromDays: number, toDays: number }
//   fromDays — how many days ago the window STARTS (the older end)
//   toDays   — how many days ago the window ENDS   (the newer end, 0 = now)
// Returns AI-suggested tasks. Client writes them to Firestore.
tasksRouter.post('/generate', csrfCheck, async (req, res) => {
  const uid = req.session.uid!
  const fromDays: number = Math.min(Math.max(Number(req.body.fromDays) || 14, 1), 180)
  const toDays: number = Math.min(Math.max(Number(req.body.toDays) || 0, 0), fromDays - 1)

  const windowDays = fromDays - toDays
  const now = Date.now()
  const since = new Date(now - fromDays * 86_400_000)
  const until = new Date(now - toDays * 86_400_000)

  // Scale how many threads to fetch based on window size
  const maxFetch = windowDays <= 14 ? 30 : windowDays <= 56 ? 50 : 60
  const maxProcess = windowDays <= 14 ? 20 : windowDays <= 56 ? 35 : 45

  // ── Gmail ────────────────────────────────────────────────────────────────
  let emailLines: string[] = []
  try {
    const gmail = await getGmailClient(uid)
    const sinceUnix = Math.floor(since.getTime() / 1000)
    const untilUnix = Math.floor(until.getTime() / 1000)
    const q = toDays === 0
      ? `in:inbox after:${sinceUnix}`
      : `in:inbox after:${sinceUnix} before:${untilUnix}`

    const listRes = await gmail.users.threads.list({ userId: 'me', maxResults: maxFetch, q })
    const threads = listRes.data.threads ?? []

    for (const t of threads.slice(0, maxProcess)) {
      try {
        const full = await gmail.users.threads.get({ userId: 'me', id: t.id!, format: 'METADATA' })
        const msgs = full.data.messages ?? []
        if (!msgs.length) continue
        const last = msgs[msgs.length - 1]
        const hdrs = (last.payload?.headers ?? []) as { name: string; value: string }[]
        const hdr = (n: string) => hdrs.find((h) => h.name.toLowerCase() === n)?.value ?? ''
        const dateStr = hdr('date')
        const dateLabel = dateStr ? new Date(dateStr).toLocaleDateString() : '?'
        emailLines.push(
          `[${dateLabel}] FROM: ${hdr('from')} | SUBJECT: ${hdr('subject')} | ${(t.snippet ?? '').slice(0, 200)}`,
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
      timeMax: until.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 30,
    })
    for (const item of (response.data.items ?? []) as any[]) {
      const start = item.start?.dateTime || item.start?.date || ''
      const label = start ? new Date(start).toLocaleDateString() : '?'
      calLines.push(
        `[${label}] MEETING: ${item.summary || '(No title)'} | ${(item.description ?? '').slice(0, 120)}`,
      )
    }
  } catch (err) {
    console.warn('[tasks/generate] Calendar fetch skipped:', (err as Error).message)
  }

  // ── Claude ────────────────────────────────────────────────────────────────
  try {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    const windowLabel = toDays === 0
      ? `last ${fromDays} days`
      : `${fromDays} to ${toDays} days ago`

    const prompt = `Today is ${today}.

You are a chief of staff helping Billy Rovzar (CEO, Lemon Studios) identify unfinished action items from the ${windowLabel}.

EMAILS (${windowLabel}):
${emailLines.length ? emailLines.join('\n') : '(none retrieved)'}

CALENDAR EVENTS (${windowLabel}):
${calLines.length ? calLines.join('\n') : '(none retrieved)'}

Identify 5–15 concrete tasks that are likely still PENDING (not yet resolved). Focus on:
- Emails that needed a reply and likely didn't get one
- Meetings that generated follow-up actions
- Deals, decisions, or deliverables that appear unresolved
- Anything the CEO would regret forgetting

Bucket assignments (relative to TODAY, not to the window):
- "now"   = overdue or needs immediate attention
- "next"  = should happen this week
- "orbit" = important to track, lower urgency

Respond ONLY with a valid JSON array — no markdown, no explanation:
[{"title":"string","bucket":"now"|"next"|"orbit","source":"email"|"meeting"|"ai-suggested","notes":"string or null"}]

Keep titles concise and action-oriented (verb + object). Max 15 items.`

    const client = getAnthropicClient()
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (message.content[0] as any).text.trim()
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
    const suggestions = JSON.parse(jsonStr)

    res.json({ data: { suggestions, window: { fromDays, toDays, emailCount: emailLines.length, calCount: calLines.length } } })
  } catch (err) {
    console.error('[tasks/generate] Claude error:', err)
    res.status(500).json({ error: { code: 'GENERATE_FAILED', message: 'Failed to generate tasks', retryable: true } })
  }
})
