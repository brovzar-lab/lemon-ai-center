import { db } from './firebase'
import { FieldValue } from 'firebase-admin/firestore'

export type AuditEvent = 'login' | 'logout' | 'token_refresh' | 'gmail_send' | 'scope_change' | 'triage_defer' | 'triage_undo'

export async function writeAuditLog(
  uid: string,
  event: AuditEvent,
  ip: string,
  userAgent: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  await db.collection(`users/${uid}/audit_log`).add({
    event,
    ts: FieldValue.serverTimestamp(),
    ip,
    userAgent,
    metadata: metadata ?? null,
    expiresAt,
  })
}
