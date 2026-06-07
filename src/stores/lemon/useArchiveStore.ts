import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  where,
  limit,
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
    const q = query(
      collection(lemonDb, path),
      where('restored', '==', false),
      orderBy('archived_at', 'desc'),
      limit(100),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: LemonArchiveItem[] = snap.docs.map((d) => ({
          id: d.id,
          restored: false,
          ...(d.data() as Omit<LemonArchiveItem, 'id'>),
        }))
        set({ items, loading: false })
      },
      () => set({ loading: false }),
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
