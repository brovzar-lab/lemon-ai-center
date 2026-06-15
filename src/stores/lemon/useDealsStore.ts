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
import { apiFetch } from '@/lib/apiClient'
import type { LemonDeal, DealStatus } from '@shared/types'

/** Fire-and-forget re-rank so the Five Fronts update immediately after deal mutations */
const rerank = () => void apiFetch('/api/engine/run/slip_detect', { method: 'POST' }).catch(() => {})

interface DealsState {
  deals: LemonDeal[]
  loading: boolean
  configured: boolean
  subscribe: () => () => void
  create: (input: Omit<LemonDeal, 'id'>) => Promise<void>
  updateStatus: (id: string, status: DealStatus) => Promise<void>
  update: (id: string, patch: Partial<LemonDeal>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useDealsStore = create<DealsState>()((set) => ({
  deals: [],
  loading: false,
  configured: isLemonWorkspaceConfigured(),

  subscribe: () => {
    const path = opsPath('deals')
    if (!path) return () => {}
    set({ loading: true })
    const q = query(
      collection(lemonDb, path),
      orderBy('status'),
      orderBy('updated_at', 'desc'),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const deals: LemonDeal[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<LemonDeal, 'id'>),
        }))
        set({ deals, loading: false })
      },
      () => set({ loading: false }),
    )
    return unsub
  },

  create: async (input) => {
    const path = opsPath('deals')
    if (!path) return
    await addDoc(collection(lemonDb, path), {
      ...input,
      status: input.status ?? 'active',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
    rerank()
  },

  updateStatus: async (id, status) => {
    const path = opsPath('deals')
    if (!path) return
    await updateDoc(doc(lemonDb, `${path}/${id}`), {
      status,
      updated_at: serverTimestamp(),
    })
    rerank()
  },

  update: async (id, patch) => {
    const path = opsPath('deals')
    if (!path) return
    await updateDoc(doc(lemonDb, `${path}/${id}`), {
      ...patch,
      updated_at: serverTimestamp(),
    })
    rerank()
  },

  remove: async (id) => {
    const path = opsPath('deals')
    if (!path) return
    await deleteDoc(doc(lemonDb, `${path}/${id}`))
  },
}))
