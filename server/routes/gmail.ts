import { Router } from 'express'
import { z } from 'zod'
import { getGmailClient } from '../lib/googleAuth'
import { tagThread, prioritizeThread, DEFAULT_TAG_PATTERNS } from '../lib/threadTags'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { gmailLimit, gmailSendLimit } from '../middleware/rateLimit'
import { respondIfReauthRequired } from '../lib/googleErrors'
import { writeAuditLog } from '../lib/auditLog'
import { db } from '../lib/firebase'
import type { InboxThread, ThreadTag, ThreadPriority } from '@shared/types'

// H-1: Sanitize CRLF from MIME header values to prevent header injection
function sanitizeHeader(val: string): string {
  return val.replace(/[\r\n]/g, '')
}

// M-1: Zod schema for email send — validates email format, lengths, and required fields
const SendSchema = z.object({
  threadId: z.string().min(1).max(50),
  to: z.string().email('Invalid email address'),
  subject: z.string().max(500, 'Subject must be at most 500 characters'),
  body: z.string().max(50_000, 'Body must be at most 50,000 characters'),
})

export const gmailRouter = Router()
gmailRouter.use(requireAuth)

function extractHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function getDomain(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/\S+/)
  const email = match ? match[1] || match[0] : fromHeader
  return email.split('@')[1]?.toLowerCase() ?? ''
}

gmailRouter.get('/threads', gmailLimit, async (req, res) => {
  const uid = req.session.uid!
  try {
    const gmail = await getGmailClient(uid)
    const listRes = await gmail.users.threads.list({ userId: 'me', maxResults: 20, q: 'in:inbox' })
    const threads = listRes.data.threads ?? []
    const results: InboxThread[] = []

    // A-1: Parallelize thread fetches in batches to eliminate N+1 queries
    const BATCH_SIZE = 10
    for (let i = 0; i < threads.length; i += BATCH_SIZE) {
      const batch = threads.slice(i, i + BATCH_SIZE)
      const settled = await Promise.allSettled(
        batch.map(async (t) => {
          if (!t.id) return null
          const full = await gmail.users.threads.get({ userId: 'me', id: t.id!, format: 'METADATA' })
          const msgs = full.data.messages ?? []
          if (!msgs.length) return null
          const first = msgs[msgs.length - 1]
          const headers = (first.payload?.headers ?? []) as { name: string; value: string }[]
          const from = extractHeader(headers, 'From')
          const subject = extractHeader(headers, 'Subject')
          const date = extractHeader(headers, 'Date')
          const fromDomain = getDomain(from)
          const labels = first.labelIds ?? []
          const unread = labels.includes('UNREAD')
          const tag: ThreadTag = tagThread({ from, fromDomain, subject, labels }, DEFAULT_TAG_PATTERNS)
          const receivedAt = date ? new Date(date).toISOString() : new Date().toISOString()
          const priority: ThreadPriority = prioritizeThread({ tag, unread, receivedAt, subject, fromDomain, from })
          return { id: t.id!, subject, from, fromDomain, snippet: t.snippet ?? '', unread, receivedAt, tag, priority, labels } as InboxThread
        }),
      )
      for (const result of settled) {
        if (result.status === 'fulfilled' && result.value) results.push(result.value)
      }
    }

    const order: Record<ThreadPriority, number> = { HOT: 0, MED: 1, LOW: 2 }
    results.sort((a, b) => order[a.priority] - order[b.priority])
    res.json({ data: results })
  } catch (err: any) {
    if (respondIfReauthRequired(res, err)) return
    if (err.code === 403 || err.message?.includes('PERMISSION_DENIED')) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Gmail access denied', retryable: false } })
    }
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Gmail unavailable', retryable: true } })
  }
})

gmailRouter.get('/threads/:id', gmailLimit, async (req, res) => {
  const uid = req.session.uid!
  try {
    const gmail = await getGmailClient(uid)
    const thread = await gmail.users.threads.get({ userId: 'me', id: req.params.id, format: 'FULL' })
    res.json({ data: thread.data })
  } catch (err) {
    if (respondIfReauthRequired(res, err)) return
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Failed to fetch thread', retryable: true } })
  }
})

gmailRouter.post('/send', csrfCheck, gmailSendLimit, async (req, res) => {
  const uid = req.session.uid!
  // M-1: Validate input with Zod
  const parsed = SendSchema.safeParse(req.body)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: msg, retryable: false } })
  }
  const { threadId, to, subject, body } = parsed.data
  try {
    const gmail = await getGmailClient(uid)
    // H-1: Sanitize To and Subject to prevent CRLF header injection
    const raw = Buffer.from(
      `To: ${sanitizeHeader(to)}\r\nSubject: ${sanitizeHeader(subject)}\r\nContent-Type: text/plain\r\n\r\n${body}`
    ).toString('base64url')
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId } })
    writeAuditLog(uid, 'gmail_send', req.ip || '', req.headers['user-agent'] || '', { threadId }).catch(() => {})
    res.json({ data: { sent: true } })
  } catch (err) {
    if (respondIfReauthRequired(res, err)) return
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Send failed', retryable: true } })
  }
})

gmailRouter.post('/label', csrfCheck, gmailLimit, async (req, res) => {
  const uid = req.session.uid!
  const { messageId, addLabelIds = [], removeLabelIds = [] } = req.body
  try {
    const gmail = await getGmailClient(uid)
    await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: { addLabelIds, removeLabelIds } })
    res.json({ data: { ok: true } })
  } catch (err) {
    if (respondIfReauthRequired(res, err)) return
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Label failed', retryable: true } })
  }
})

gmailRouter.post('/archive', csrfCheck, gmailLimit, async (req, res) => {
  const uid = req.session.uid!
  const { messageId } = req.body
  try {
    const gmail = await getGmailClient(uid)
    await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: { removeLabelIds: ['INBOX'] } })
    // H-4: Track for undo in Firestore (survives deploys)
    await db.collection(`users/${uid}/triage_undo`).doc(messageId).set({
      action: 'archive', originalLabels: ['INBOX'], at: Date.now(),
      expiresAt: new Date(Date.now() + UNDO_TTL_MS),
    })
    res.json({ data: { archived: true } })
  } catch (err) {
    if (respondIfReauthRequired(res, err)) return
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Archive failed', retryable: true } })
  }
})

// --- Consolidation: Email Triage Enhancements (from DASH-2) ---

// H-4: Undo entries are now stored in Firestore instead of an in-memory Map.
// This survives Railway deploys/restarts. Entries have a 10-minute TTL.
const UNDO_TTL_MS = 10 * 60 * 1000

gmailRouter.post('/triage/defer', csrfCheck, gmailLimit, async (req, res) => {
  const uid = req.session.uid!
  const { messageId, deferLabel = 'CEO-DEFERRED' } = req.body as { messageId: string; deferLabel?: string }
  try {
    const gmail = await getGmailClient(uid)

    // Ensure the label exists (create if not)
    let labelId = deferLabel
    try {
      const labels = await gmail.users.labels.list({ userId: 'me' })
      const existing = labels.data.labels?.find((l: any) => l.name === deferLabel)
      if (existing) {
        labelId = existing.id!
      } else {
        const created = await gmail.users.labels.create({ userId: 'me', requestBody: { name: deferLabel, labelListVisibility: 'labelShow', messageListVisibility: 'show' } })
        labelId = created.data.id!
      }
    } catch {
      // If label creation fails, proceed with archive only
    }

    // Remove from inbox, add defer label
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { removeLabelIds: ['INBOX'], addLabelIds: [labelId] },
    })

    // H-4: Track for undo in Firestore (survives deploys)
    await db.collection(`users/${uid}/triage_undo`).doc(messageId).set({
      action: 'defer', originalLabels: ['INBOX'], deferLabel: labelId, at: Date.now(),
      expiresAt: new Date(Date.now() + UNDO_TTL_MS),
    })
    writeAuditLog(uid, 'triage_defer', req.ip || '', req.headers['user-agent'] || '', { messageId, deferLabel }).catch(() => {})

    res.json({ data: { deferred: true, label: deferLabel } })
  } catch (err) {
    if (respondIfReauthRequired(res, err)) return
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Defer failed', retryable: true } })
  }
})

gmailRouter.post('/triage/undo', csrfCheck, gmailLimit, async (req, res) => {
  const uid = req.session.uid!
  const { messageId } = req.body as { messageId: string }

  // H-4: Read undo entry from Firestore
  const undoRef = db.collection(`users/${uid}/triage_undo`).doc(messageId)
  const undoDoc = await undoRef.get()

  if (!undoDoc.exists) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No triage action to undo', retryable: false } })
  }

  const entry = undoDoc.data()!

  // Expire after 10 minutes
  if (Date.now() - entry.at > UNDO_TTL_MS) {
    await undoRef.delete()
    return res.status(410).json({ error: { code: 'EXPIRED', message: 'Undo window expired (10 min)', retryable: false } })
  }

  try {
    const gmail = await getGmailClient(uid)
    const addBack = entry.originalLabels as string[]
    const removeLabels = entry.deferLabel ? [entry.deferLabel] : []

    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds: addBack, removeLabelIds: removeLabels },
    })

    await undoRef.delete()
    writeAuditLog(uid, 'triage_undo', req.ip || '', req.headers['user-agent'] || '', { messageId, undoneAction: entry.action }).catch(() => {})

    res.json({ data: { undone: true, restoredLabels: addBack } })
  } catch (err) {
    if (respondIfReauthRequired(res, err)) return
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Undo failed', retryable: true } })
  }
})
