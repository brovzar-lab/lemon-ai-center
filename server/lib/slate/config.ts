import { db } from '../firebase'
import type { SlateConfig } from '@shared/types'

/**
 * Slate module configuration — the Firestore half of the "KNOWN_FACTS"
 * replacement (D2). One doc: where the DEVELOPMENT/ folder lives and when
 * it was last scanned. The vault half is per-project notes (vaultNote.ts).
 */
const CONFIG_DOC = () => db.collection('slate_config').doc('settings')

export async function getSlateConfig(): Promise<SlateConfig | null> {
  const snap = await CONFIG_DOC().get()
  if (!snap.exists) return null
  return snap.data() as SlateConfig
}

export async function saveSlateConfig(config: SlateConfig): Promise<void> {
  await CONFIG_DOC().set(config)
}

export async function touchLastScan(scannedAt: string): Promise<void> {
  await CONFIG_DOC().set({ lastScanAt: scannedAt }, { merge: true })
}
