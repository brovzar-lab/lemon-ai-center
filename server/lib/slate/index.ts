import { db } from '../firebase'
import type { SlateProject } from '@shared/types'

/**
 * Firestore access for the DEVELOPMENT-HELL slate (D2: `slate/*` is one of
 * the module's two sources of truth, alongside per-project status notes in
 * the Obsidian vault). Doc id == project slug == DEVELOPMENT/ folder name.
 * All access goes through the admin SDK server-side — the client never
 * reads these collections directly.
 */
const SLATE_COLLECTION = 'slate'

export async function listSlateProjects(): Promise<SlateProject[]> {
  const snap = await db.collection(SLATE_COLLECTION).get()
  return snap.docs
    .map((d) => ({ slug: d.id, ...(d.data() as Omit<SlateProject, 'slug'>) }))
    .sort((a, b) => a.slug.localeCompare(b.slug))
}
