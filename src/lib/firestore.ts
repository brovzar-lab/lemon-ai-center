import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

// projectId falls back to the authDomain's subdomain — the Railway build
// once shipped without VITE_FIREBASE_PROJECT_ID, which left the Firestore
// client pointed at projectId:undefined and every panel empty/"syncing".
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined
const projectId =
  (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ||
  authDomain?.split('.')[0]

if (!projectId) {
  console.error('[firestore] No VITE_FIREBASE_PROJECT_ID or VITE_FIREBASE_AUTH_DOMAIN — client data layer disabled')
}

if (!getApps().length) {
  initializeApp({
    projectId,
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain,
  })
}

export const db = getFirestore()
