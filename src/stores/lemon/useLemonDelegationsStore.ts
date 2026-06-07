import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore'
import { lemonDb, isLemonWorkspaceConfigured, opsPath } from '@/lib/firestoreLemon'
import type { LemonDelegation, LemonDelegationStatus } from '@shared/types'

interface LemonDelegationsState {
  delegations: LemonDelegation[]
  loading: boolean
  configured: boolean
  subscribe: () => () => void
  create: (input: Omit<LemonDelegation, 'id'>) => Promise<void>
  setStatus: (id: string, status: LemonDelegationStatus) => Promise<void>
  update: (id: string, patch: Partial<LemonDelegation>) => Promise<void>
}

export const useLemonDelegationsStore = create<LemonDelegationsState>()((set) => ({
  delegations: [],
  loading: false,
  configured: isLemonWorkspaceConfigured(),

  subscribe: () => {
    const path = opsPath('lemon_delegations')
    if (!path) return () => {}
    set({ loading: true })
    const q = query(collection(lemonDb, path), orderBy('created_at', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const delegations: LemonDelegation[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<LemonDelegation, 'id'>),
        }))
        set({ delegations, loading: false })
      },
      () => set({ loading: false }),
    )
    return unsub
  },

  create: async (input) => {
    const path = opsPath('lemon_delegations')
    if (!path) return
    await addDoc(collection(lemonDb, path), {
      ...input,
      source: input.source ?? 'manual',
      status: input.status ?? 'pending',
      completed_date: null,
      created_at: serverTimestamp(),
    })
  },

  setStatus: async (id, status) => {
    const path = opsPath('lemon_delegations')
    if (!path) return
    const completed = status === 'completed'
    await updateDoc(doc(lemonDb, `${path}/${id}`), {
      status,
      completed_date: completed ? serverTimestamp() : null,
    })
  },

  update: async (id, patch) => {
    const path = opsPath('lemon_delegations')
    if (!path) return
    await updateDoc(doc(lemonDb, `${path}/${id}`), patch)
  },
}))
