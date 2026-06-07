import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { tasksGenerateLimit } from '../middleware/rateLimit'
import { getGmailClient, getCalendarClient } from '../lib/googleAuth'
import { TASKS_GENERATE_SYSTEM } from '../lib/prompts'

export const tasksRouter = Router()
tasksRouter.use(requireAuth)

const MODEL_TASKS = 'claude-haiku-4-5-20251001'
const MAX_SUGGESTIONS = 10

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

interface ContextItem {
  /** Synthetic id we hand to the model — `g_<gmailThreadId>` or `c_<eventId>`. */
  id: string
  /** Human-readable label rendered into the CONTEXT block. */
  label: string
  /** Short snippet (already truncated) shown to the model. */
  snippet: string
  /** What kind of source this is. */
  kind: 'email' | 'meeting'
}

interface RawSuggestion {
  title?: unknown
  bucket?: unknown
  source?: unknown
  notes?: unknown
  citations?: unknown
}

interface CleanSuggestion {
  title: string
  bucket: 'now' | 'next' | 'orbit'
  source: 'email' | 'meeting' | 'ai-suggested'
  notes: string | null
}

/**
 * Validate a raw model output against the context. Drops any suggestion
 * that doesn't cite a sourceId we actually injected — that's the
 * anti-hallucination guardrail. Mirrors the validateBriefJson pattern in
 * routes/claude.ts.
 */
function validateSuggestions(raw: unknown, validIds: Set<string>): CleanSuggestion[] {
  if (!Array.isArray(raw)) return []
  const allowedBuckets = new Set(['now', 'next', 'orbit'])
  const allowedSources = new Set(['email', 'meeting', 'ai-suggested'])

  const cleaned: CleanSuggestion[] = []
  for (const item of raw as RawSuggestion[]) {
    if (typeof item?.title !== 'string' || item.title.trim().length === 0) continue
    const title = item.title.trim().slice(0, 200)

    const bucket = typeof item.bucket === 'string' && allowedBuckets.has(item.bucket)
      ? (item.bucket as 'now' | 'next' | 'orbit')
      : 'orbit'

    const source = typeof item.source === 'string' && allowedSources.has(item.source)
      ? (item.source as 'email' | 'meeting' | 'ai-suggested')
      : 'ai-suggested'

    const notes = typeof item.notes === 'string' && item.notes.trim().length > 0
      ? item.notes.trim().slice(0, 500)
      : null

    // Citation enforcement: at least one citation must reference a real
    // sourceId from CONTEXT. Otherwise drop the suggestion.
    if (!Array.isArray(item.citations) || item.citations.length === 0) continue
    const hasRealCitation = (item.citations as Array<{ sourceId?: unknown }>).some((c) => {
      return typeof c?.sourceId === 'string' && validIds.has(c.sourceId)
    })
    if (!hasRealCitation) continue

    cleaned.push({ title, bucket, source, notes })
    if (cleaned.length >= MAX_SUGGESTIONS) break
  }
  return cleaned
}

/**
 * POST /api/tasks/generate
 * Body: { fromDays: number, toDays: number }
 *   fromDays — older end of window (e.g. 56 = "56 days ago")
 *   toDays   — newer end of window (e.g. 14 = "14 days ago", 0 = "now")
 *
 * Builds a Gmail `after:`/`before:` query with Unix timestamps, fetches
 * calendar events with `timeMin`/`timeMax`, hands a numbered CONTEXT
 * block to Claude, and returns suggestions whose citations resolve to a
 * real item in that block. Hallucinated citations (or missing
 * citations) cause the suggestion to be silently dropped.
 *
 * Returns: { data: { suggestions, window: { fromDays, toDays, emailCount, calCount } } }
 */
tasksRouter.post('/generate', csrfCheck, tasksGenerateLimit, async (req, res) => {
  const uid = req.session.uid!
  const fromDays: number = Math.min(Math.max(Number(req.body.fromDays) || 14, 1), 180)
  const toDays: number = Math.min(Math.max(Number(req.body.toDays) || 0, 0), fromDays - 1)

  const windowDays = fromDays - toDays
  const now = Date.now()
  const since = new Date(now - fromDays * 86_400_000)
  const until = new Date(now - toDays * 86_400_000)

  // Scale how many threads to fetch based on window size (matches spec)
  const maxFetch = windowDays <= 14 ? 30 : windowDays <= 56 ? 50 : 60
  const maxProcess = windowDays <= 14 ? 20 : windowDays <= 56 ? 35 : 45

  const items: ContextItem[] = []

  // ── Gmail ────────────────────────────────────────────────────────────────
  let emailCount = 0
  try {
    const gmail = await getGmailClient(uid)
    const sinceUnix = Math.floor(since.getTime() / 1000)
    const untilUnix = Math.floor(until.getTime() / 1000)
    const q = toDays === 0
      ? `in:inbox after:${sinceUnix}`
      : `in:inbox after:${sinceUnix} before:${untilUnix}`

    const listRes = await gmail.users.threads.list({ userId: 'me', maxResults: maxFetch, q })
    const threads = listRes.data.threads ?? []

    // A-2: Parallelize thread fetches in batches to eliminate N+1 queries
    const BATCH_SIZE = 10
    for (let i = 0; i < threads.slice(0, maxProcess).length; i += BATCH_SIZE) {
      const batch = threads.slice(0, maxProcess).slice(i, i + BATCH_SIZE)
      const settled = await Promise.allSettled(
        batch.map(async (t) => {
          if (!t.id) return null
          const full = await gmail.users.threads.get({ userId: 'me', id: t.id, format: 'METADATA' })
          const msgs = full.data.messages ?? []
          if (!msgs.length) return null
          const last = msgs[msgs.length - 1]
          const hdrs = (last.payload?.headers ?? []) as { name: string; value: string }[]
          const hdr = (n: string) => hdrs.find((h) => h.name.toLowerCase() === n)?.value ?? ''
          const dateStr = hdr('date')
          const dateLabel = dateStr ? new Date(dateStr).toLocaleDateString() : '?'
          const from = hdr('from')
          const subject = hdr('subject')
          return {
            id: `g_${t.id}`,
            label: `[${dateLabel}] FROM: ${from} | SUBJECT: ${subject}`,
            snippet: (t.snippet ?? '').slice(0, 200),
            kind: 'email' as const,
          }
        }),
      )
      for (const result of settled) {
        if (result.status === 'fulfilled' && result.value) {
          items.push(result.value)
          emailCount++
        }
      }
    }
  } catch (err) {
    console.warn('[tasks/generate] Gmail fetch skipped:', (err as Error).message)
  }

  // ── Calendar ──────────────────────────────────────────────────────────────
  let calCount = 0
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
    for (const ev of (response.data.items ?? []) as any[]) {
      if (!ev.id) continue
      // Skip transparent / declined / cancelled — same rule as the brief
      if (ev.transparency === 'transparent') continue
      if (ev.status === 'cancelled') continue
      const myAttendee = (ev.attendees ?? []).find((a: any) => a.self)
      if (myAttendee?.responseStatus === 'declined') continue

      const start = ev.start?.dateTime || ev.start?.date || ''
      const dateLabel = start ? new Date(start).toLocaleDateString() : '?'
      items.push({
        id: `c_${ev.id}`,
        label: `[${dateLabel}] MEETING: ${ev.summary || '(No title)'}`,
        snippet: (ev.description ?? '').slice(0, 200),
        kind: 'meeting',
      })
      calCount++
    }
  } catch (err) {
    console.warn('[tasks/generate] Calendar fetch skipped:', (err as Error).message)
  }

  // ── Build CONTEXT block ──────────────────────────────────────────────────
  const validIds = new Set(items.map((i) => i.id))
  const contextLines = items.map(
    (item, i) => `[${i + 1}] ${item.kind.toUpperCase()} id="${item.id}" — ${item.label}\n    ${item.snippet}`,
  )
  const windowLabel = toDays === 0
    ? `the last ${fromDays} days`
    : `${fromDays}–${toDays} days ago`

  // Fast exit when nothing to scan — no Claude call needed.
  if (items.length === 0) {
    return res.json({
      data: {
        suggestions: [],
        window: { fromDays, toDays, emailCount, calCount },
      },
    })
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const userMessage = `Today is ${today}.\n\nWindow: ${windowLabel}.\n\nCONTEXT (${items.length} items):\n${contextLines.join('\n')}\n\nIdentify UNFINISHED action items strictly from the CONTEXT above. Output ONLY the JSON array per schema.`

  // ── Claude ────────────────────────────────────────────────────────────────
  try {
    const client = getAnthropicClient()
    const message = await client.messages.create({
      model: MODEL_TASKS,
      max_tokens: 1500,
      system: TASKS_GENERATE_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      console.warn('[tasks/generate] Claude returned non-JSON; returning empty suggestions')
      return res.json({
        data: {
          suggestions: [],
          window: { fromDays, toDays, emailCount, calCount },
        },
      })
    }

    const suggestions = validateSuggestions(parsed, validIds)
    res.json({
      data: {
        suggestions,
        window: { fromDays, toDays, emailCount, calCount },
      },
    })
  } catch (err) {
    console.error('[tasks/generate] Claude error:', err)
    res.status(500).json({
      error: { code: 'GENERATE_FAILED', message: 'Failed to generate tasks', retryable: true },
    })
  }
})
