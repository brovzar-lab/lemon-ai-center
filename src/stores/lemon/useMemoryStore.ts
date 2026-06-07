import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore'
import { lemonDb, isLemonWorkspaceConfigured, opsPath } from '@/lib/firestoreLemon'
import type { LemonMemoryEntry } from '@shared/types'

interface MemoryState {
  entries: LemonMemoryEntry[]
  loading: boolean
  configured: boolean
  subscribe: () => () => void
  add: (text: string, source?: 'manual' | 'auto') => Promise<void>
  setActive: (id: string, active: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useMemoryStore = create<MemoryState>()((set) => ({
  entries: [],
  loading: false,
  configured: isLemonWorkspaceConfigured(),

  subscribe: () => {
    const path = opsPath('memory_entries')
    if (!path) return () => {}
    set({ loading: true })
    const q = query(collection(lemonDb, path), orderBy('learned_at', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const entries: LemonMemoryEntry[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<LemonMemoryEntry, 'id'>),
        }))
        set({ entries, loading: false })
      },
      () => set({ loading: false }),
    )
    return unsub
  },

  add: async (text, source = 'manual') => {
    const path = opsPath('memory_entries')
    if (!path) return
    await addDoc(collection(lemonDb, path), {
      text,
      source,
      active: true,
      learned_at: serverTimestamp(),
    })
  },

  setActive: async (id, active) => {
    const path = opsPath('memory_entries')
    if (!path) return
    await updateDoc(doc(lemonDb, `${path}/${id}`), { active })
  },

  remove: async (id) => {
    const path = opsPath('memory_entries')
    if (!path) return
    await deleteDoc(doc(lemonDb, `${path}/${id}`))
  },
}))
