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

    for (const t of threads) {
      try {
        const full = await gmail.users.threads.get({ userId: 'me', id: t.id!, format: 'METADATA' })
        const msgs = full.data.messages ?? []
        if (!msgs.length) continue
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
        results.push({ id: t.id!, subject, from, fromDomain, snippet: t.snippet ?? '', unread, receivedAt, tag, priority, labels })
      } catch (threadErr) {
        console.warn('[gmail] Skipping thread', t.id, (threadErr as Error)?.message)
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
    res.json({ data: { archived: true } })
  } catch {
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Archive failed', retryable: true } })
  }
})
