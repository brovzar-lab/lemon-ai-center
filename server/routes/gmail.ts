import { Router } from 'express'
import { getGmailClient } from '../lib/googleAuth'
import { tagThread, prioritizeThread, DEFAULT_TAG_PATTERNS } from '../lib/threadTags'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { gmailLimit, gmailSendLimit } from '../middleware/rateLimit'
import { writeAuditLog } from '../lib/auditLog'
import type { InboxThread, ThreadTag, ThreadPriority } from '@shared/types'

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
  } catch {
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Failed to fetch thread', retryable: true } })
  }
})

gmailRouter.post('/send', csrfCheck, gmailSendLimit, async (req, res) => {
  const uid = req.session.uid!
  const { threadId, to, subject, body } = req.body as { threadId: string; to: string; subject: string; body: string }
  try {
    const gmail = await getGmailClient(uid)
    const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain\r\n\r\n${body}`).toString('base64url')
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId } })
    writeAuditLog(uid, 'gmail_send', req.ip || '', req.headers['user-agent'] || '', { threadId }).catch(() => {})
    res.json({ data: { sent: true } })
  } catch {
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
  } catch {
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Label failed', retryable: true } })
  }
})

gmailRouter.post('/archive', csrfCheck, gmailLimit, async (req, res) => {
  const uid = req.session.uid!
  const { messageId } = req.body
  try {
    const gmail = await getGmailClient(uid)
    await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: { removeLabelIds: ['INBOX'] } })
    // Track for undo
    triageUndoStack.set(`${uid}:${messageId}`, { action: 'archive', originalLabels: ['INBOX'], at: Date.now() })
    res.json({ data: { archived: true } })
  } catch {
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Archive failed', retryable: true } })
  }
})

// --- Consolidation: Email Triage Enhancements (from DASH-2) ---

// Undo stack — ephemeral, per-server instance. Entries expire after 10 minutes.
const triageUndoStack = new Map<string, { action: string; originalLabels: string[]; deferLabel?: string; at: number }>()

// A-8: Periodic cleanup sweep to prevent memory leak from abandoned undo entries
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of triageUndoStack) {
    if (now - entry.at > 10 * 60 * 1000) triageUndoStack.delete(key)
  }
}, 60_000)

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

    // Track for undo
    triageUndoStack.set(`${uid}:${messageId}`, { action: 'defer', originalLabels: ['INBOX'], deferLabel: labelId, at: Date.now() })
    writeAuditLog(uid, 'triage_defer', req.ip || '', req.headers['user-agent'] || '', { messageId, deferLabel }).catch(() => {})

    res.json({ data: { deferred: true, label: deferLabel } })
  } catch {
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Defer failed', retryable: true } })
  }
})

gmailRouter.post('/triage/undo', csrfCheck, gmailLimit, async (req, res) => {
  const uid = req.session.uid!
  const { messageId } = req.body as { messageId: string }
  const key = `${uid}:${messageId}`
  const entry = triageUndoStack.get(key)

  if (!entry) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No triage action to undo', retryable: false } })
  }

  // Expire after 10 minutes
  if (Date.now() - entry.at > 10 * 60 * 1000) {
    triageUndoStack.delete(key)
    return res.status(410).json({ error: { code: 'EXPIRED', message: 'Undo window expired (10 min)', retryable: false } })
  }

  try {
    const gmail = await getGmailClient(uid)
    const addBack = entry.originalLabels
    const removeLabels = entry.deferLabel ? [entry.deferLabel] : []

    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds: addBack, removeLabelIds: removeLabels },
    })

    triageUndoStack.delete(key)
    writeAuditLog(uid, 'triage_undo', req.ip || '', req.headers['user-agent'] || '', { messageId, undoneAction: entry.action }).catch(() => {})

    res.json({ data: { undone: true, restoredLabels: addBack } })
  } catch {
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Undo failed', retryable: true } })
  }
})
