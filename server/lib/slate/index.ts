import { db } from '../firebase'
import type { SlateConfirmItem, SlateProject } from '@shared/types'

/**
 * Firestore access for the DEVELOPMENT-HELL slate (D2: `slate/*` is one of
 * the module's two sources of truth, alongside per-project status notes in
 * the Obsidian vault). Doc id == project slug == DEVELOPMENT/ folder name.
 * All access goes through the admin SDK server-side — the client never
 * reads these collections directly.
 */
const SLATE_COLLECTION = 'slate'
const CONFIRM_COLLECTION = 'slate_confirm'

export async function listSlateProjects(): Promise<SlateProject[]> {
  const snap = await db.collection(SLATE_COLLECTION).get()
  return snap.docs
    .map((d) => ({ slug: d.id, ...(d.data() as Omit<SlateProject, 'slug'>) }))
    .sort((a, b) => a.slug.localeCompare(b.slug))
}

export async function listSlateConfirmItems(): Promise<SlateConfirmItem[]> {
  const snap = await db.collection(CONFIRM_COLLECTION).get()
  return snap.docs
    .map((d) => d.data() as SlateConfirmItem)
    .sort((a, b) => a.path.localeCompare(b.path))
}

export async function getSlateCounts(): Promise<{ projects: number; confirm: number }> {
  const [projects, confirm] = await Promise.all([
    db.collection(SLATE_COLLECTION).count().get(),
    db.collection(CONFIRM_COLLECTION).count().get(),
  ])
  return { projects: projects.data().count, confirm: confirm.data().count }
}
