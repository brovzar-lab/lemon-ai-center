import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { getGmailClient } from '../lib/googleAuth'
import { db } from '../lib/firebase'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { FieldValue } from 'firebase-admin/firestore'
import type {
  DealStatus,
  ProjectCategory,
  LemonDelegationStatus,
} from '@shared/types'

export const scanRouter = Router()
scanRouter.use(requireAuth)

// ──────────────────────────────────────────────────────
// POST /api/scan/inbox
// Scans N Gmail threads, extracts deals, projects,
// delegations, and memory entries using Claude, then
// writes them to Firestore under users/{uid}/...
// ──────────────────────────────────────────────────────

interface ExtractedDeal {
  name: string
  counterparty?: string
  owner?: string
  value?: string
  status: DealStatus
  next_action?: string
  project?: string
}

interface ExtractedProject {
  title: string
  category: ProjectCategory
  format?: 'film' | 'series' | 'deal'
  platform?: string
  status_detail?: string
  next_action?: string
}

interface ExtractedDelegation {
  person: string
  task: string
  context?: string
  expected_by?: string
  status: LemonDelegationStatus
  email_ref?: string
}

interface ExtractedMemory {
  text: string
}

interface ExtractionResult {
  deals: ExtractedDeal[]
  projects: ExtractedProject[]
  delegations: ExtractedDelegation[]
  memories: ExtractedMemory[]
}

function extractHeader(
  headers: Array<{ name: string; value: string }>,
  name: string,
): string {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
    ''
  )
}

/**
 * Decode a Gmail message body (base64url → UTF-8 text).
 * Walks parts recursively to find text/plain content.
 */
function extractBody(payload: any): string {
  if (!payload) return ''

  // Direct body data
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8')
  }

  // Multipart — recurse into parts, prefer text/plain
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64url').toString('utf-8')
      }
    }
    // If no plain text found, try any nested part
    for (const part of payload.parts) {
      const nested = extractBody(part)
      if (nested) return nested
    }
  }

  return ''
}

scanRouter.post('/inbox', csrfCheck, async (req, res) => {
  const uid = req.session.uid!
  const maxThreads = Math.min(Number(req.body.maxThreads) || 40, 60)

  // Prevent concurrent scans
  const lockRef = db.doc(`users/${uid}/meta/scan_lock`)
  const lockSnap = await lockRef.get()
  if (lockSnap.exists) {
    const lockData = lockSnap.data()
    const lockAge = Date.now() - (lockData?.startedAt?.toMillis?.() ?? 0)
    // Allow re-scan if lock is older than 10 minutes (stale)
    if (lockAge < 10 * 60 * 1000) {
      return res.status(409).json({
        error: {
          code: 'SCAN_IN_PROGRESS',
          message: 'A scan is already running. Please wait.',
          retryable: false,
        },
      })
    }
  }

  await lockRef.set({ startedAt: FieldValue.serverTimestamp(), status: 'running' })

  // Stream progress updates via SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  function sendEvent(type: string, data: Record<string, unknown>) {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  try {
    // ── Phase 1: Fetch threads from Gmail ──────────────
    sendEvent('progress', { phase: 'fetching', message: `Fetching ${maxThreads} email threads from Gmail…` })

    const gmail = await getGmailClient(uid)
    const listRes = await gmail.users.threads.list({
      userId: 'me',
      maxResults: maxThreads,
      q: 'in:inbox',
    })
    const threadStubs = listRes.data.threads ?? []

    sendEvent('progress', {
      phase: 'fetching',
      message: `Found ${threadStubs.length} threads. Loading full content…`,
    })

    // Fetch full thread content in batches of 8
    interface EmailDigest {
      threadId: string
      subject: string
      from: string
      date: string
      body: string
    }

    const emails: EmailDigest[] = []
    const BATCH_SIZE = 8

    for (let i = 0; i < threadStubs.length; i += BATCH_SIZE) {
      const batch = threadStubs.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async (t) => {
          if (!t.id) return null
          const full = await gmail.users.threads.get({
            userId: 'me',
            id: t.id,
            format: 'FULL',
          })
          const msgs = full.data.messages ?? []
          if (!msgs.length) return null
          const latest = msgs[msgs.length - 1]
          const headers = (latest.payload?.headers ?? []) as Array<{
            name: string
            value: string
          }>
          const subject = extractHeader(headers, 'Subject')
          const from = extractHeader(headers, 'From')
          const date = extractHeader(headers, 'Date')
          const body = extractBody(latest.payload).slice(0, 1500) // cap per email
          return { threadId: t.id, subject, from, date, body } as EmailDigest
        }),
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) emails.push(r.value)
      }
      sendEvent('progress', {
        phase: 'fetching',
        message: `Loaded ${emails.length}/${threadStubs.length} threads…`,
      })
    }

    // ── Phase 2: AI Extraction ─────────────────────────
    sendEvent('progress', {
      phase: 'analyzing',
      message: `Sending ${emails.length} emails to AI for analysis…`,
    })

    const emailBlock = emails
      .map(
        (e, i) =>
          `--- EMAIL ${i + 1} ---\nThread: ${e.threadId}\nFrom: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\n\n${e.body}\n`,
      )
      .join('\n')

    const extraction = await extractWithClaude(emailBlock)

    sendEvent('progress', {
      phase: 'analyzing',
      message: `Extracted: ${extraction.deals.length} deals, ${extraction.projects.length} projects, ${extraction.delegations.length} delegations, ${extraction.memories.length} memory entries`,
    })

    // ── Phase 3: Write to Firestore ────────────────────
    sendEvent('progress', { phase: 'saving', message: 'Writing to database…' })

    const stats = await writeToFirestore(uid, extraction)

    sendEvent('progress', {
      phase: 'saving',
      message: `Saved: ${stats.deals} deals, ${stats.projects} projects, ${stats.delegations} delegations, ${stats.memories} memories`,
    })

    await lockRef.set({
      startedAt: FieldValue.serverTimestamp(),
      status: 'completed',
      stats,
    })

    sendEvent('done', {
      message: 'Scan complete!',
      stats,
    })
  } catch (err: any) {
    console.error('[scan] Error:', err.message || err)
    await lockRef.delete().catch(() => {})
    sendEvent('error', { message: err.message || 'Scan failed' })
  } finally {
    res.end()
  }
})

// ── Claude extraction ────────────────────────────────

async function extractWithClaude(emailBlock: string): Promise<ExtractionResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const systemPrompt = `You are a CEO executive assistant AI that extracts structured business intelligence from emails.

Your job is to analyze a batch of emails and extract:

1. **Deals** — active business deals, partnerships, licensing agreements, distribution deals, co-productions, investments. Include counterparty, estimated value if mentioned, current status, and next action.

2. **Projects** — film, series, or business projects being worked on. Include category (development, pre_production, production, post_production, deals_business), format (film/series/deal), platform if mentioned, and next action.

3. **Delegations** — tasks the CEO has assigned or that someone else owes them. Include the person's name, the task, any deadline mentioned, and whether it's pending/completed.

4. **Memory entries** — persistent facts the CEO should remember. Things like: "Maria handles all Warner licensing", "Creel prefers to negotiate in Spanish", "Sundance deadline is January 15". Only extract truly useful persistent facts, not transient info.

Rules:
- Deduplicate: if multiple emails reference the same deal/project, merge into one entry
- Status inference: if an email says "contract signed" → closed; "waiting for response" → pending_signature; "reviewing terms" → in_review; otherwise → active
- For delegations, infer "expected_by" from any deadline language ("by Friday", "end of week", "before the 15th")
- Value: extract dollar amounts when mentioned ("$7.5M deal", "budget of 2M")
- Be conservative: only extract things that are clearly deals/projects/delegations, not casual mentions
- Do NOT extract newsletters, marketing emails, or social notifications as deals/projects

Respond with a single JSON object (no markdown fencing):
{
  "deals": [{ "name": "...", "counterparty": "...", "owner": "...", "value": "...", "status": "active|pending_signature|in_review|closed", "next_action": "...", "project": "..." }],
  "projects": [{ "title": "...", "category": "development|pre_production|production|post_production|deals_business", "format": "film|series|deal", "platform": "...", "status_detail": "...", "next_action": "..." }],
  "delegations": [{ "person": "...", "task": "...", "context": "...", "expected_by": "2025-06-15", "status": "pending|completed" }],
  "memories": [{ "text": "..." }]
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Analyze these ${emailBlock.split('--- EMAIL').length - 1} emails and extract deals, projects, delegations, and memory entries:\n\n${emailBlock}`,
      },
    ],
  })

  const text =
    response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    // Try to parse the JSON, stripping markdown fences if present
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim()
    const parsed = JSON.parse(cleaned)
    return {
      deals: Array.isArray(parsed.deals) ? parsed.deals : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      delegations: Array.isArray(parsed.delegations) ? parsed.delegations : [],
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
    }
  } catch (parseErr) {
    console.error('[scan] Failed to parse Claude response:', text.slice(0, 200))
    return { deals: [], projects: [], delegations: [], memories: [] }
  }
}

// ── Firestore writes ─────────────────────────────────

async function writeToFirestore(
  uid: string,
  data: ExtractionResult,
): Promise<{ deals: number; projects: number; delegations: number; memories: number }> {
  const basePath = `users/${uid}`
  const stats = { deals: 0, projects: 0, delegations: 0, memories: 0 }

  // Batch writes in groups of 500 (Firestore limit)
  const batch = db.batch()
  let batchCount = 0

  async function flushIfNeeded() {
    if (batchCount >= 450) {
      await batch.commit()
      batchCount = 0
    }
  }

  // ── Deals ──
  // First, get existing deals to avoid duplicates (match by name)
  const existingDeals = await db.collection(`${basePath}/deals`).get()
  const existingDealNames = new Set(
    existingDeals.docs.map((d) => (d.data().name || '').toLowerCase()),
  )

  for (const deal of data.deals) {
    if (!deal.name?.trim()) continue
    if (existingDealNames.has(deal.name.toLowerCase())) continue
    const ref = db.collection(`${basePath}/deals`).doc()
    batch.set(ref, {
      name: deal.name,
      counterparty: deal.counterparty || null,
      owner: deal.owner || null,
      value: deal.value || null,
      status: deal.status || 'active',
      next_action: deal.next_action || null,
      project: deal.project || null,
      source: 'auto_scan',
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    })
    stats.deals++
    batchCount++
    await flushIfNeeded()
  }

  // ── Projects ──
  const existingProjects = await db.collection(`${basePath}/projects`).get()
  const existingProjectTitles = new Set(
    existingProjects.docs.map((d) => (d.data().title || '').toLowerCase()),
  )

  for (const project of data.projects) {
    if (!project.title?.trim()) continue
    if (existingProjectTitles.has(project.title.toLowerCase())) continue
    const ref = db.collection(`${basePath}/projects`).doc()
    batch.set(ref, {
      title: project.title,
      category: project.category || 'development',
      format: project.format || null,
      platform: project.platform || null,
      status_detail: project.status_detail || null,
      next_action: project.next_action || null,
      sort_order: stats.projects,
      source: 'auto_scan',
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    })
    stats.projects++
    batchCount++
    await flushIfNeeded()
  }

  // ── Delegations ──
  const existingDelegations = await db.collection(`${basePath}/delegations`).get()
  const existingDelegationKeys = new Set(
    existingDelegations.docs.map(
      (d) => `${(d.data().person || '').toLowerCase()}::${(d.data().task || '').toLowerCase()}`,
    ),
  )

  for (const delegation of data.delegations) {
    if (!delegation.person?.trim() || !delegation.task?.trim()) continue
    const key = `${delegation.person.toLowerCase()}::${delegation.task.toLowerCase()}`
    if (existingDelegationKeys.has(key)) continue
    const ref = db.collection(`${basePath}/delegations`).doc()
    batch.set(ref, {
      person: delegation.person,
      task: delegation.task,
      context: delegation.context || null,
      expected_by: delegation.expected_by || null,
      status: delegation.status || 'pending',
      source: 'auto_scan',
      created_at: FieldValue.serverTimestamp(),
    })
    stats.delegations++
    batchCount++
    await flushIfNeeded()
  }

  // ── Memory entries ──
  const existingMemories = await db.collection(`${basePath}/memories`).get()
  const existingMemoryTexts = new Set(
    existingMemories.docs.map((d) => (d.data().text || '').toLowerCase()),
  )

  for (const memory of data.memories) {
    if (!memory.text?.trim()) continue
    if (existingMemoryTexts.has(memory.text.toLowerCase())) continue
    const ref = db.collection(`${basePath}/memories`).doc()
    batch.set(ref, {
      text: memory.text,
      source: 'auto',
      active: true,
      learned_at: FieldValue.serverTimestamp(),
    })
    stats.memories++
    batchCount++
    await flushIfNeeded()
  }

  if (batchCount > 0) {
    await batch.commit()
  }

  return stats
}

// ── Status endpoint ──────────────────────────────────

scanRouter.get('/status', async (req, res) => {
  const uid = req.session.uid!
  const lockRef = db.doc(`users/${uid}/meta/scan_lock`)
  const lockSnap = await lockRef.get()
  if (!lockSnap.exists) {
    return res.json({ data: { status: 'idle' } })
  }
  res.json({ data: lockSnap.data() })
})
