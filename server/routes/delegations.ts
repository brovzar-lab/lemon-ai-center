import { Router } from 'express'
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/firebase'
import { getGmailClient } from '../lib/googleAuth'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { gmailSendLimit } from '../middleware/rateLimit'

export const delegationsRouter = Router()
delegationsRouter.use(requireAuth)

// H-1: strip CR/LF from any value that lands in a MIME header, so a crafted
// toName/taskTitle can't inject extra headers (e.g. a blind Bcc). Mirrors the
// hardening already applied to POST /api/gmail/send.
function sanitizeHeader(val: string): string {
  return val.replace(/[\r\n]/g, '')
}

// M-1: validate shape + email format; cap lengths to keep headers/body sane.
const DelegationSchema = z.object({
  to: z.string().email('Invalid recipient email address'),
  toName: z.string().max(200).default(''),
  taskTitle: z.string().min(1, 'taskTitle required').max(300),
  context: z.string().max(10_000).default(''),
  deadline: z.string().max(100).optional(),
})

/** POST /api/delegations — send a delegation email and log it */
// A-13: Rate limit — each call sends a real email via Gmail
delegationsRouter.post('/', csrfCheck, gmailSendLimit, async (req, res) => {
  const uid = req.session.uid!

  const parsed = DelegationSchema.safeParse(req.body)
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message, retryable: false } })
  }
  const { to, toName, taskTitle, context, deadline } = parsed.data

  try {
    const gmail = await getGmailClient(uid)

    // Build email — sanitize every value used in a header line.
    const deadlineLine = deadline ? `\nDeadline: ${deadline}` : ''
    const body = `Hi ${toName},\n\n${context}\n${deadlineLine}\n\nThanks,\nBilly`
    const subject = `Action needed: ${sanitizeHeader(taskTitle)}`
    const toHeader = toName ? `${sanitizeHeader(toName)} <${to}>` : to

    const raw = Buffer.from(
      `To: ${toHeader}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`,
    ).toString('base64url')

    const sendResult = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    })

    const gmailMessageId = sendResult.data.id ?? ''

    // Save delegation record
    const delegationId = db.collection(`users/${uid}/delegations`).doc().id
    await db.collection(`users/${uid}/delegations`).doc(delegationId).set({
      to,
      toName,
      taskTitle,
      context,
      deadline: deadline ?? null,
      gmailMessageId,
      createdAt: FieldValue.serverTimestamp(),
    })

    res.json({ data: { id: delegationId, gmailMessageId } })
  } catch (err) {
    console.error('[delegations] Failed to send delegation email:', (err as Error).message)
    res.status(500).json({ error: { code: 'SEND_FAILED', message: 'Failed to send delegation email', retryable: true } })
  }
})
