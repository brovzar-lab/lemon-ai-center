/**
 * One-shot cleanup: deletes AI-generated cache documents from Firestore so
 * Billy starts with a fresh slate after the anti-hallucination guardrails
 * land. Run once after deploying:
 *
 *   pnpm tsx scripts/wipe-ai-caches.ts
 *
 * Wipes (per-user, all users):
 *   - users/{uid}/briefs/*       (morning brief cache)
 *   - users/{uid}/spark_cache/*  (creative spark cache)
 *
 * Does NOT touch:
 *   - users/{uid}/tasks/*        (Billy's real tasks)
 *   - users/{uid}/decisions/*    (Decision history)
 *   - users/{uid}/captures/*     (Captures)
 *   - users/{uid}/action_log/*   (Action log)
 *   - users/{uid}/memory_entries / projects / deals (ops data)
 */

import 'dotenv/config'
import { db } from '../server/lib/firebase'

const SUBCOLLECTIONS_TO_WIPE = ['briefs', 'spark_cache']

async function wipeSubcollection(uid: string, name: string): Promise<number> {
  const ref = db.collection(`users/${uid}/${name}`)
  const snap = await ref.get()
  if (snap.empty) return 0

  // Batch deletes (max 500 per batch in Firestore admin SDK)
  let deleted = 0
  let batch = db.batch()
  let count = 0
  for (const doc of snap.docs) {
    batch.delete(doc.ref)
    count++
    deleted++
    if (count === 400) {
      await batch.commit()
      batch = db.batch()
      count = 0
    }
  }
  if (count > 0) await batch.commit()
  return deleted
}

async function main() {
  console.log('[wipe] enumerating users/...')
  const usersSnap = await db.collection('users').get()
  if (usersSnap.empty) {
    console.log('[wipe] no users found, nothing to do')
    return
  }

  let totalDeleted = 0
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id
    console.log(`[wipe] user ${uid}:`)
    for (const sub of SUBCOLLECTIONS_TO_WIPE) {
      const n = await wipeSubcollection(uid, sub)
      console.log(`  - ${sub}: deleted ${n}`)
      totalDeleted += n
    }
  }
  console.log(`[wipe] done. Total documents deleted: ${totalDeleted}`)
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[wipe] failed:', err)
    process.exit(1)
  },
)
