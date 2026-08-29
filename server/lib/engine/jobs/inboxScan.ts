import Anthropic from '@anthropic-ai/sdk'
import { FieldValue } from 'firebase-admin/firestore'
import { getGmailClient } from '../../googleAuth'
import { db } from '../../firebase'
import type {
  DealStatus,
  ProjectCategory,
  LemonDelegationStatus,
} from '@shared/types'
import { CLAUDE_MODELS } from '@shared/models'
import { tagThread, prioritizeThread, DEFAULT_TAG_PATTERNS } from '../../threadTags'
import { pregenerateCopilotDrafts, type DraftCandidate } from '../../copilot/pregenerate'

/**
 * Headless inbox scan — extracted from routes/scan.ts so both the SSE
 * route (manual button) and the 04:30 engine job share one implementation.
 */

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

interface ExtractionResult {
  deals: ExtractedDeal[]
  projects: ExtractedProject[]
  delegations: ExtractedDelegation[]
  memories: Array<{ text: string }>
}

export interface ScanStats {
  deals: number
  projects: number
  delegations: number
  memories: number
}

export type ScanProgress = (phase: string, message: string) => void

function extractHeader(
  headers: Array<{ name: string; value: string }>,
  name: string,
): string {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
  )
}

function extractBody(payload: any): string {
  if (!payload) return ''
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8')
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64url').toString('utf-8')
      }
    }
    for (const part of payload.parts) {
      const nested = extractBody(part)
      if (nested) return nested
    }
  }
  return ''
}

export async function runInboxScan(
  uid: string,
  maxThreads = 40,
  onProgress: ScanProgress = () => {},
): Promise<ScanStats> {
  // ── Phase 1: Fetch threads from Gmail ──
  onProgress('fetching', `Fetching ${maxThreads} email threads from Gmail…`)

  const gmail = await getGmailClient(uid)
  const listRes = await gmail.users.threads.list({
    userId: 'me',
    maxResults: maxThreads,
    q: 'in:inbox',
  })
  const threadStubs = listRes.data.threads ?? []
  onProgress('fetching', `Found ${threadStubs.length} threads. Loading full content…`)

  interface EmailDigest {
    threadId: string
    subject: string
    from: string
    fromDomain: string
    date: string
    body: string
    latestMessageId: string
    labels: string[]
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
        const from = extractHeader(headers, 'From')
        const fromDomain = from.match(/<([^>]+)>/)?.[1]?.split('@')[1]?.toLowerCase()
          ?? from.split('@')[1]?.toLowerCase() ?? ''
        return {
          threadId: t.id,
          subject: extractHeader(headers, 'Subject'),
          from,
          fromDomain,
          date: extractHeader(headers, 'Date'),
          body: extractBody(latest.payload).slice(0, 1500),
          latestMessageId: latest.id ?? '',
          labels: latest.labelIds ?? [],
        } as EmailDigest
      }),
    )
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) emails.push(r.value)
    }
    onProgress('fetching', `Loaded ${emails.length}/${threadStubs.length} threads…`)
  }

  // ── Phase 2: AI extraction ──
  onProgress('analyzing', `Sending ${emails.length} emails to AI for analysis…`)

  const emailBlock = emails
    .map(
      (e, i) =>
        `--- EMAIL ${i + 1} ---\nThread: ${e.threadId}\nFrom: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\n\n${e.body}\n`,
    )
    .join('\n')

  const extraction = await extractWithClaude(emailBlock)
  onProgress(
    'analyzing',
    `Extracted: ${extraction.deals.length} deals, ${extraction.projects.length} projects, ${extraction.delegations.length} delegations, ${extraction.memories.length} memory entries`,
  )

  // ── Phase 3: Write to Firestore ──
  onProgress('saving', 'Writing to database…')
  const stats = await writeToFirestore(uid, extraction)
  onProgress(
    'saving',
    `Saved: ${stats.deals} deals, ${stats.projects} projects, ${stats.delegations} delegations, ${stats.memories} memories`,
  )

  // ── Phase 4: pre-generate Copilot drafts for HOT reply-owed threads ──
  try {
    onProgress('saving', 'Pre-writing Copilot drafts…')
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const selfEmail = profile.data.emailAddress ?? ''
    const candidates: DraftCandidate[] = emails.map((e) => {
      const tag = tagThread(
        { from: e.from, fromDomain: e.fromDomain, subject: e.subject, labels: e.labels },
        DEFAULT_TAG_PATTERNS,
      )
      const priority = prioritizeThread({
        tag,
        unread: e.labels.includes('UNREAD'),
        receivedAt: e.date ? new Date(e.date).toISOString() : new Date().toISOString(),
        subject: e.subject,
        fromDomain: e.fromDomain,
        from: e.from,
      })
      const fromEmail = e.from.match(/<([^>]+)>/)?.[1] ?? e.from
      return {
        threadId: e.threadId,
        from: e.from,
        fromEmail,
        subject: e.subject,
        snippet: e.body.slice(0, 300),
        latestMessageId: e.latestMessageId,
        priority,
        latestFrom: e.from,
      }
    })
    if (selfEmail) await pregenerateCopilotDrafts(uid, selfEmail, candidates)
  } catch (err) {
    console.warn('[scan] Copilot pre-generation skipped:', (err as Error).message)
  }

  return stats
}

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
    model: CLAUDE_MODELS.balanced,
    thinking: { type: 'disabled' }, // Sonnet 5 defaults to adaptive thinking; keep it off.
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Analyze these ${emailBlock.split('--- EMAIL').length - 1} emails and extract deals, projects, delegations, and memory entries:\n\n${emailBlock}`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
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
  } catch {
    console.error('[scan] Failed to parse Claude response:', text.slice(0, 200))
    return { deals: [], projects: [], delegations: [], memories: [] }
  }
}

async function writeToFirestore(
  uid: string,
  data: ExtractionResult,
): Promise<ScanStats> {
  const basePath = `users/${uid}`
  const stats: ScanStats = { deals: 0, projects: 0, delegations: 0, memories: 0 }

  let batch = db.batch()
  let batchCount = 0

  async function flushIfNeeded() {
    if (batchCount >= 450) {
      await batch.commit()
      batch = db.batch()  // CRITICAL: create fresh batch after commit
      batchCount = 0
    }
  }

  // Dedup reads — limit to 10k docs to prevent OOM on large collections
  const existingDeals = await db.collection(`${basePath}/deals`).limit(10000).get()
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

  const existingProjects = await db.collection(`${basePath}/projects`).limit(10000).get()
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

  const existingDelegations = await db.collection(`${basePath}/delegations`).limit(10000).get()
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

  const existingMemories = await db.collection(`${basePath}/memories`).limit(10000).get()
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
