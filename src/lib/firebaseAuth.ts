import { getAuth, signInWithCustomToken } from 'firebase/auth'
import '@/lib/firestore' // ensure the Firebase app is initialized first
import { apiFetch } from '@/lib/apiClient'

/**
 * Sign the Firestore client SDK in as the session user via a server-minted
 * custom token. Without this, every users/{uid}/** subscription is
 * permission-denied — the root cause of the "empty panels" era.
 */
export async function ensureFirebaseAuth(): Promise<void> {
  const auth = getAuth()
  if (auth.currentUser) return
  const { token } = await apiFetch<{ token: string }>('/api/firebase-token')
  await signInWithCustomToken(auth, token)
}
