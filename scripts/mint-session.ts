import 'dotenv/config'
import crypto from 'crypto'
import { db } from '../server/lib/firebase'

// Dev-only: mint a session for local verification screenshots.
async function main() {
  const uid = process.env.CEO_UID!
  const email = 'billy@lemonfilms.com'
  const sid = crypto.randomBytes(24).toString('hex')
  const now = new Date()
  await db.collection('sessions').doc(sid).set({
    uid,
    email,
    lastSeenAt: now,
    absoluteExpiry: new Date(now.getTime() + 90 * 24 * 3600_000),
    data: { uid, email },
  })
  const secret = process.env.SESSION_SECRET || 'dev-secret-change-me-local-only'
  const sig = crypto.createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '')
  console.log(`sid=s%3A${sid}.${encodeURIComponent(sig)}`)
  process.exit(0)
}
main()
