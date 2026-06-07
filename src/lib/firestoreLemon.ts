import { db } from '@/lib/firestore'
import { useAuthStore } from '@/stores/useAuthStore'

/**
 * Workspace ops Firestore facade.
 *
 * History: this used to point at a *secondary* Firebase app for the
 * legacy `lemon-es-tu-dios` workspace, exposed as `lemonDb`. That coupled
 * Lemon AI Center to stale data Billy didn't recognize ("hallucinated"
 * deals/projects). It now points at CEO's *primary* Firebase project and
 * scopes everything under `users/{uid}/...` — the same security pattern
 * as `useTaskStore`, `useDecisionStore`, etc.
 *
 * The exports are kept under their old names so the existing store call
 * sites compile unchanged. Treat `lemonDb` as a re-export of the primary
 * `db` and `requireLemonDb()` as a thin assertion helper.
 */

export const lemonDb = db

/** Always true now — kept for back-compat with code that gates on it. */
export function isLemonWorkspaceConfigured(): boolean {
  return true
}

export function requireLemonDb() {
  return db
}

/**
 * Returns the current authenticated UID, or null if no one is signed in.
 * Stores call this lazily so they can no-op cleanly before auth resolves.
 */
export function getOpsUid(): string | null {
  return useAuthStore.getState().user?.uid ?? null
}

/**
 * Build a `users/{uid}/{collection}` path. Returns null when the user
 * isn't authenticated yet.
 */
export function opsPath(collectionName: string): string | null {
  const uid = getOpsUid()
  return uid ? `users/${uid}/${collectionName}` : null
}
