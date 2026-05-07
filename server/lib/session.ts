import expressSession = require('express-session')
import { db } from './firebase'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

export class FirestoreSessionStore extends expressSession.Store {
  private readonly col = 'sessions'

  get(
    sid: string,
    callback: (err: any, session?: expressSession.SessionData | null) => void,
  ): void {
    db.collection(this.col)
      .doc(sid)
      .get()
      .then((doc) => {
        if (!doc.exists) return callback(null, null)
        const raw = doc.data()!

        const now = Date.now()
        const absoluteExpiry: number = raw.absoluteExpiry?.toMillis?.() ?? 0
        const lastSeenAt: number = raw.lastSeenAt?.toMillis?.() ?? 0
        if (absoluteExpiry < now || lastSeenAt < now - THIRTY_DAYS_MS) {
          this.destroy(sid, () => {})
          return callback(null, null)
        }

        // Restore full session data (all fields, not just uid/email)
        const sessionData: expressSession.SessionData = {
          cookie: {} as any,
          ...(raw.data ?? {}),
          // top-level fields for backwards compat
          uid: raw.uid ?? raw.data?.uid,
          email: raw.email ?? raw.data?.email,
        }
        callback(null, sessionData)
      })
      .catch((err) => callback(err))
  }

  set(
    sid: string,
    session: expressSession.SessionData,
    callback?: (err?: any) => void,
  ): void {
    const now = new Date()
    const { cookie, ...sessionData } = session as any

    // Firestore rejects `undefined` values — replace with null recursively
    const clean = (obj: any): any => {
      if (obj === undefined) return null
      if (obj === null || typeof obj !== 'object') return obj
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, clean(v)])
      )
    }

    const cleanData = clean(sessionData)

    db.collection(this.col)
      .doc(sid)
      .set(
        {
          uid: cleanData.uid ?? null,
          email: cleanData.email ?? null,
          lastSeenAt: now,
          absoluteExpiry: new Date(now.getTime() + NINETY_DAYS_MS),
          data: cleanData,
        },
        { merge: true },
      )
      .then(() => callback?.())
      .catch((err) => callback?.(err))
  }

  destroy(sid: string, callback?: (err?: any) => void): void {
    db.collection(this.col).doc(sid).delete()
      .then(() => callback?.())
      .catch((err) => callback?.(err))
  }

  touch(sid: string, _session: expressSession.SessionData, callback?: () => void): void {
    db.collection(this.col).doc(sid).update({ lastSeenAt: new Date() })
      .then(() => callback?.())
      .catch(() => callback?.())
  }
}
