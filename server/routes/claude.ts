import { Router } from 'express'
import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/firebase'
import { getGmailClient, getCalendarClient } from '../lib/googleAuth'
import { getBrainEngine } from '../lib/brain'
import {
  JARVIS_SYSTEM,
  JARVIS_RETRY_SYSTEM,
  BILLY_LONG_BRIEF_SYSTEM,
  BILLY_SYSTEM,
  SPARK_SYSTEM,
  CHAT_SYSTEM,
  PROMPT_VERSION,
} from '../lib/prompts'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { briefLimit, chatLimit, sparkLimit } from '../middleware/rateLimit'
import { seeds } from '@shared/seeds'
import type { Citation, Claim } from '@shared/types'

export const claudeRouter = Router()
claudeRouter.use(requireAuth)

const MODEL_BRIEF = 'claude-opus-4-7'
const MODEL_PROSE = 'claude-sonnet-4-6'
const MODEL_CHAT = 'claude-sonnet-4-6'
const MODEL_SPARK = 'claude-haiku-4-5-20251001'

// Context budget caps (per plan: 12 threads × 200 chars + 8 events × 100 chars)
const MAX_THREADS = 12
const MAX_THREAD_SNIPPET_LEN = 200
const MAX_EVENTS = 8
const MAX_EVENT_DESC_LEN = 100
const MAX_CONTEXT_CHARS = 20_000
const MAX_VAULT_CHUNKS = 8

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

function computeBriefId(threadIds: string[]): string {
  const hash = crypto
    .createHash('sha256')
    .update(threadIds.slice(0, MAX_THREADS).join(':') + PROMPT_VERSION + MODEL_BRIEF)
    .digest('hex')
    .slice(0, 16)
  return hash + '-' + new Date().toISOString().slice(0, 10)
}

// --- Context assembly ---

interface ContextItem {
  type: 'gmail' | 'calendar' | 'obsidian'
  id: string
  label: string
  snippet: string
}

async function assembleContext(uid: string): Promise<{ items: ContextItem[]; block: string; threadIds: string[] }> {
  const items: ContextItem[] = []
  const threadIds: string[] = []

  // Fetch Gmail threads
  try {
    const gmail = await getGmailClient(uid)
    const response = await gmail.users.threads.list({ userId: 'me', maxResults: MAX_THREADS })
    const threads = response.data.threads || []
    for (const t of threads.slice(0, MAX_THREADS)) {
      if (!t.id) continue
      threadIds.push(t.id)
      try {
        const detail = await gmail.users.threads.get({ userId: 'me', id: t.id, format: 'metadata', metadataHeaders: ['Subject', 'From'] })
        const headers = detail.data.messages?.[0]?.payload?.headers || []
        const subject = headers.find((h: any) => h.name === 'Subject')?.value ?? '(no subject)'
        const from = headers.find((h: any) => h.name === 'From')?.value ?? ''
        const snippet = (detail.data.messages?.[0]?.snippet ?? '').slice(0, MAX_THREAD_SNIPPET_LEN)
        items.push({ type: 'gmail', id: t.id, label: `${from}: ${subject}`, snippet })
      } catch {
        items.push({ type: 'gmail', id: t.id, label: '(thread metadata unavailable)', snippet: '' })
      }
    }
  } catch {
    // Gmail unavailable — proceed without
  }

  // Fetch Calendar events
  try {
    const calendar = await getCalendarClient(uid)
    const now = new Date()
    const eod = new Date(now)
    eod.setHours(23, 59, 59, 999)
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: eod.toISOString(),
      maxResults: MAX_EVENTS,
      singleEvents: true,
      orderBy: 'startTime',
    })
    for (const ev of (response.data.items || []).slice(0, MAX_EVENTS)) {
      const summary = ev.summary ?? '(no title)'
      // Only include events with "BR" in the title (Billy Rovzar's meetings)
      if (!summary.toUpperCase().includes('BR')) continue
      const id = ev.id ?? ''
      const start = ev.start?.dateTime ?? ev.start?.date ?? ''
      const desc = (ev.description ?? '').slice(0, MAX_EVENT_DESC_LEN)
      items.push({ type: 'calendar', id, label: `${summary} at ${start}`, snippet: desc })
    }
  } catch {
    // Calendar unavailable — proceed without
  }

  // ── Obsidian Brain context ──────────────────────────
  // Query the vault for notes relevant to today's emails and meetings
  const brain = getBrainEngine()
  if (brain && brain.isReady()) {
    try {
      // Build a search query from email subjects and meeting titles
      const searchTerms = items
        .map((item) => {
          // Extract key terms from labels (strip email addresses, "at" timestamps)
          const clean = item.label
            .replace(/<[^>]+>/g, '')  // email addresses
            .replace(/\bat\b.*$/i, '') // "at 2:00 PM" etc
            .replace(/[()]/g, '')
            .trim()
          return clean
        })
        .filter((t) => t.length > 3)
        .slice(0, 6)

      // Search for each term and collect unique chunks
      const seenPaths = new Set<string>()
      for (const term of searchTerms) {
        const chunks = brain.getRelevantChunks(term, 3)
        for (const chunk of chunks) {
          if (seenPaths.has(chunk.docPath) || items.length >= MAX_THREADS + MAX_EVENTS + MAX_VAULT_CHUNKS) break
          seenPaths.add(chunk.docPath)
          items.push({
            type: 'obsidian',
            id: `vault:${chunk.docPath}`,
            label: `[Vault] ${chunk.docPath} — ${chunk.heading}`,
            snippet: chunk.text.slice(0, 300),
          })
        }
      }
    } catch (err) {
      console.warn('[brain] Context injection failed:', (err as Error).message)
    }
  }

  // Build CONTEXT block for the prompt
  const lines = items.map(
    (item, i) => `[${i + 1}] ${item.type.toUpperCase()} id="${item.id}" — ${item.label}\n    ${item.snippet}`,
  )
  let block = `CONTEXT (${items.length} items):\n${lines.join('\n')}`

  // ── Load CEO briefing rules from the vault ──────────────
  // These are hard constraints set by the CEO via the correction system
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH
  if (vaultPath) {
    try {
      const rulesPath = require('path').join(vaultPath, 'wiki/personal/productivity/briefing-rules.md')
      const rulesContent = require('fs').readFileSync(rulesPath, 'utf-8')
      // Strip frontmatter
      const rulesBody = rulesContent.replace(/^---[\s\S]*?---\s*/m, '').trim()
      block = `OPERATING RULES (from CEO — these override all other instructions):\n${rulesBody}\n\n${block}`
    } catch {
      // Rules file not found — proceed without
    }
  }

  // Enforce total context budget
  if (block.length > MAX_CONTEXT_CHARS) {
    block = block.slice(0, MAX_CONTEXT_CHARS) + '\n... (truncated to budget)'
  }

  return { items, block, threadIds }
}

// --- JSON validation ---

interface ParsedBrief {
  overview: Claim[]
  oneThing: Claim & { why: string }
  decisionOptions?: { label: string; text: string; detail: string }[]
  soulNote?: string
}

function validateBriefJson(raw: string, contextIds: string[]): { ok: true; data: ParsedBrief } | { ok: false; reason: string } {
  let parsed: any
  try {
    // Strip markdown fences if model added them despite instruction
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    return { ok: false, reason: 'Invalid JSON' }
  }

  if (!Array.isArray(parsed.overview) || parsed.overview.length !== 5) {
    return { ok: false, reason: `overview must have exactly 5 items, got ${parsed.overview?.length ?? 'none'}` }
  }

  if (!parsed.oneThing?.text || !parsed.oneThing?.why) {
    return { ok: false, reason: 'oneThing missing text or why' }
  }

  // Validate all claims have ≥1 citation
  const allClaims: { text: string; citations: any[] }[] = [...parsed.overview, parsed.oneThing]
  for (const claim of allClaims) {
    if (!Array.isArray(claim.citations) || claim.citations.length === 0) {
      return { ok: false, reason: `Claim "${claim.text?.slice(0, 50)}..." has zero citations` }
    }
  }

  // Validate sourceIds exist in context or are 'inferred' or vault-prefixed
  const validIds = new Set([...contextIds, 'inferred'])
  for (const claim of allClaims) {
    for (const cite of claim.citations) {
      if (!validIds.has(cite.sourceId) && !cite.sourceId?.startsWith('vault:')) {
        return { ok: false, reason: `sourceId "${cite.sourceId}" not in context` }
      }
    }
  }

  return { ok: true, data: parsed as ParsedBrief }
}

// --- Brief route ---

claudeRouter.post('/brief', csrfCheck, briefLimit, async (req, res) => {
  const uid = req.session.uid!
  const { forceRefresh = false } = req.body

  // Assemble context (threads + calendar)
  const { items, block: contextBlock, threadIds } = await assembleContext(uid)
  const contextIds = items.map((i) => i.id)
  const briefId = computeBriefId(threadIds)

  // Check cache (unless forceRefresh)
  if (!forceRefresh) {
    const cacheDoc = await db.collection(`users/${uid}/briefs`).doc(briefId).get()
    if (cacheDoc.exists) {
      const cached = cacheDoc.data()!
      return res.json({ data: { ...cached, isStale: false }, streaming: false })
    }
  }

  // Fetch last brief for stale fallback
  let staleBrief: { jarvis: string; billy: string; generatedAt?: string; overview?: any; oneThing?: any; longBrief?: string } | null = null
  const lastBriefSnap = await db
    .collection(`users/${uid}/briefs`)
    .orderBy('generatedAt', 'desc')
    .limit(1)
    .get()
  if (!lastBriefSnap.empty) {
    const d = lastBriefSnap.docs[0].data()
    staleBrief = {
      jarvis: d.jarvis,
      billy: d.billy,
      generatedAt: d.generatedAt?.toDate?.()?.toISOString(),
      overview: d.overview,
      oneThing: d.oneThing,
      longBrief: d.longBrief,
    }
  }

  // Begin SSE stream
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const sendEvent = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  // Send stale/seed data immediately
  const initial = staleBrief ?? { jarvis: seeds.brief.jarvis, billy: seeds.brief.billy, isDemo: true }
  sendEvent({ type: 'cached', ...initial, isStale: true })

  const anthropic = getAnthropicClient()
  let jarvisText = ''
  let billyText = ''
  let parsedOverview: Claim[] | undefined
  let parsedOneThing: (Claim & { why: string }) | undefined
  let parsedDecisionOptions: { label: string; text: string; detail: string }[] | undefined
  let parsedSoulNote: string | undefined
  let longBriefText: string | undefined
  let degraded = false

  try {
    // ---- PASS 1: Structured JSON (blocking, Opus) ----
    const userMessage = `Today is ${new Date().toDateString()}.\n\n${contextBlock}`
    let pass1Result: ReturnType<typeof validateBriefJson> = { ok: false, reason: 'not attempted' }

    for (let attempt = 0; attempt < 2; attempt++) {
      const systemPrompt = attempt === 0 ? JARVIS_SYSTEM : JARVIS_RETRY_SYSTEM
      const response = await anthropic.messages.create({
        model: MODEL_BRIEF,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })

      const raw = response.content[0].type === 'text' ? response.content[0].text : ''
      pass1Result = validateBriefJson(raw, contextIds)
      if (pass1Result.ok) break
    }

    if (pass1Result.ok) {
      parsedOverview = pass1Result.data.overview
      parsedOneThing = pass1Result.data.oneThing
      parsedDecisionOptions = pass1Result.data.decisionOptions
      parsedSoulNote = pass1Result.data.soulNote
      sendEvent({ type: 'overview', overview: parsedOverview })
      sendEvent({ type: 'oneThing', oneThing: parsedOneThing })
      if (parsedDecisionOptions) sendEvent({ type: 'decisionOptions', decisionOptions: parsedDecisionOptions })
      if (parsedSoulNote) sendEvent({ type: 'soulNote', soulNote: parsedSoulNote })
      // Generate legacy jarvis text from overview for backward compat
      jarvisText = parsedOverview.map((c, i) => `${i + 1}. ${c.text}`).join('\n')
    } else {
      // Both attempts failed — degraded mode
      degraded = true
      sendEvent({ type: 'degraded', reason: pass1Result.reason })
    }

    // ---- PASS 2: Prose (streaming, Sonnet) ----
    if (parsedOverview && parsedOneThing) {
      // Long brief: dual-voice prose conditioned on pass-1 JSON
      const longBriefStream: any = anthropic.messages.stream({
        model: MODEL_PROSE,
        max_tokens: 600,
        system: BILLY_LONG_BRIEF_SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify({ overview: parsedOverview, oneThing: parsedOneThing }) }],
      } as any)

      longBriefText = ''
      for await (const text of longBriefStream.textStream) {
        longBriefText += text
        sendEvent({ type: 'token', voice: 'billy', text })
      }
      billyText = longBriefText
    } else {
      // Degraded: fall back to legacy streaming
      const jarvisStream: any = anthropic.messages.stream({
        model: MODEL_BRIEF,
        max_tokens: 800,
        system: JARVIS_SYSTEM.split('## Task')[0] + 'Generate a concise, analytical morning briefing under 150 words.',
        messages: [{ role: 'user', content: `Today is ${new Date().toDateString()}. ${contextBlock}` }],
      } as any)
      for await (const text of jarvisStream.textStream) {
        jarvisText += text
        sendEvent({ type: 'token', voice: 'jarvis', text })
      }

      const billyStream: any = anthropic.messages.stream({
        model: MODEL_CHAT,
        max_tokens: 400,
        system: BILLY_SYSTEM,
        messages: [{ role: 'user', content: jarvisText }],
      } as any)
      for await (const text of billyStream.textStream) {
        billyText += text
        sendEvent({ type: 'token', voice: 'billy', text })
      }
    }

    // ---- Save to Firestore ----
    const generatedAt = new Date()
    const briefDoc: Record<string, any> = {
      jarvis: jarvisText,
      billy: billyText,
      generatedAt: FieldValue.serverTimestamp(),
      inboxSnapshot: threadIds.slice(0, MAX_THREADS),
      model: MODEL_BRIEF,
      promptVersion: String(PROMPT_VERSION),
      expiresAt: new Date(generatedAt.getTime() + 90 * 60 * 1000),
    }

    if (parsedOverview) briefDoc.overview = parsedOverview
    if (parsedOneThing) briefDoc.oneThing = parsedOneThing
    if (parsedDecisionOptions) briefDoc.decisionOptions = parsedDecisionOptions
    if (parsedSoulNote) briefDoc.soulNote = parsedSoulNote
    if (longBriefText) briefDoc.longBrief = longBriefText
    if (degraded) briefDoc.degraded = true

    await db.collection(`users/${uid}/briefs`).doc(briefId).set(briefDoc)

    sendEvent({
      type: 'done',
      jarvis: jarvisText,
      billy: billyText,
      generatedAt: generatedAt.toISOString(),
      briefId,
      overview: parsedOverview,
      oneThing: parsedOneThing,
      longBrief: longBriefText,
      decisionOptions: parsedDecisionOptions,
      soulNote: parsedSoulNote,
      degraded,
    })
  } catch {
    sendEvent({ type: 'error', message: 'Brief generation failed' })
  }

  res.end()
})

// --- Chat route (unchanged) ---

claudeRouter.post('/chat', csrfCheck, chatLimit, async (req, res) => {
  const { message, context } = req.body as { message: string; context?: string }
  const contextNote = context ? `\n\nContext:\n${context}` : ''

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const anthropic = getAnthropicClient()
  try {
    const stream = anthropic.messages.stream({
      model: MODEL_CHAT,
      max_tokens: 1024,
      system: CHAT_SYSTEM,
      messages: [{ role: 'user', content: message + contextNote }],
    })

    stream.on('text', (text: string) => {
      res.write(`data: ${JSON.stringify({ type: 'token', text })}\n\n`)
    })

    await stream.finalMessage()
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
  } catch (err: any) {
    console.error('[chat] Error:', err?.status, err?.message ?? err)
    const msg = err?.message ?? 'Unknown error'
    res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`)
  }
  res.end()
})

// --- Spark route (unchanged) ---

claudeRouter.post('/spark', csrfCheck, sparkLimit, async (req, res) => {
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
