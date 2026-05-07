import { Router } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../lib/firebase'
import { getGmailClient } from '../lib/googleAuth'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'

export const delegationsRouter = Router()
delegationsRouter.use(requireAuth)

/** POST /api/delegations — send a delegation email and log it */
delegationsRouter.post('/', csrfCheck, async (req, res) => {
  const uid = req.session.uid!
  const { to, toName, taskTitle, context, deadline } = req.body as {
    to: string
    toName: string
    taskTitle: string
    context: string
    deadline?: string
  }

  if (!to || !taskTitle) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'to and taskTitle required', retryable: false } })
  }

  try {
    const gmail = await getGmailClient(uid)

    // Build email
    const deadlineLine = deadline ? `\nDeadline: ${deadline}` : ''
    const body = `Hi ${toName},\n\n${context}\n${deadlineLine}\n\nThanks,\nBilly`
    const subject = `Action needed: ${taskTitle}`

    const raw = Buffer.from(
      `To: ${toName} <${to}>\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`,
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
  } catch {
    res.status(500).json({ error: { code: 'SEND_FAILED', message: 'Failed to send delegation email', retryable: true } })
  }
})
