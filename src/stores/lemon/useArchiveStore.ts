import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore'
import { lemonDb, isLemonWorkspaceConfigured, opsPath } from '@/lib/firestoreLemon'
import type { LemonArchiveItem } from '@shared/types'

interface ArchiveState {
  items: LemonArchiveItem[]
  loading: boolean
  configured: boolean
  subscribe: () => () => void
  restore: (id: string) => Promise<void>
}

export const useArchiveStore = create<ArchiveState>()((set) => ({
  items: [],
  loading: false,
  configured: isLemonWorkspaceConfigured(),

  subscribe: () => {
    const path = opsPath('ops_archive')
    if (!path) return () => {}
    set({ loading: true })
    // where + orderBy on different fields needs a composite index; filter and
    // sort client-side instead so a missing index can't blank the view.
    const unsub = onSnapshot(
      collection(lemonDb, path),
      (snap) => {
        const items: LemonArchiveItem[] = snap.docs
          .map((d): LemonArchiveItem => ({
            restored: false,
            ...(d.data() as Omit<LemonArchiveItem, 'id'>),
            id: d.id,
          }))
          .filter((it) => !it.restored)
          .sort((a, b) => String(b.archived_at ?? '').localeCompare(String(a.archived_at ?? '')))
          .slice(0, 100)
        set({ items, loading: false })
      },
      (err) => {
        console.error('[archive] subscription error:', err)
        set({ loading: false })
      },
    )
    return unsub
  },

  restore: async (id) => {
    const path = opsPath('ops_archive')
    if (!path) return
    await updateDoc(doc(lemonDb, `${path}/${id}`), {
      restored: true,
      restored_at: serverTimestamp(),
    })
  },
}))
