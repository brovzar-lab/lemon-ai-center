import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore'
import { lemonDb, isLemonWorkspaceConfigured, opsPath } from '@/lib/firestoreLemon'
import { apiFetch } from '@/lib/apiClient'
import type { LemonDeal, DealStatus } from '@shared/types'

/**
 * Fire-and-forget re-rank so the Five Fronts update after deal mutations.
 * Debounced: a burst of edits (notes, next-action, several status drags)
 * collapses into a single engine call ~4s after the last change instead of
 * hammering the server on every keystroke-save.
 */
let rerankTimer: ReturnType<typeof setTimeout> | undefined
const rerank = () => {
  if (rerankTimer) clearTimeout(rerankTimer)
  rerankTimer = setTimeout(() => {
    void apiFetch('/api/engine/run/slip_detect', { method: 'POST' }).catch(() => {})
  }, 4000)
}

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
    // No server-side orderBy: a compound orderBy needs a composite Firestore
    // index, and without it the listener fails (silently) and the board shows
    // empty. Read unordered and sort client-side instead.
    const statusRank: Record<string, number> = {
      active: 0,
      pending_signature: 1,
      in_review: 2,
      closed: 3,
    }
    const unsub = onSnapshot(
      collection(lemonDb, path),
      (snap) => {
        const deals: LemonDeal[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<LemonDeal, 'id'>) }))
          .sort(
            (a, b) =>
              (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) ||
              String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')),
          )
        set({ deals, loading: false })
      },
      (err) => {
        console.error('[deals] subscription error:', err)
        set({ loading: false })
      },
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
