import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { lemonDb, opsPath } from '@/lib/firestoreLemon'
import type {
  Investor,
  Script,
  Deadline,
  AIVenture,
  WatchlistItem,
} from '@shared/types'

/**
 * Mission Control trackers — investors, scripts, deadlines, ventures,
 * watchlist. All under users/{uid}/... with real-time subscriptions,
 * same pattern as useDealsStore.
 */

interface TrackersState {
  investors: Investor[]
  scripts: Script[]
  deadlines: Deadline[]
  ventures: AIVenture[]
  watchlist: WatchlistItem[]
  loading: boolean
  subscribe: () => () => void

  createInvestor: (input: Omit<Investor, 'id'>) => Promise<void>
  updateInvestor: (id: string, patch: Partial<Investor>) => Promise<void>
  removeInvestor: (id: string) => Promise<void>

  createScript: (input: Omit<Script, 'id'>) => Promise<void>
  updateScript: (id: string, patch: Partial<Script>) => Promise<void>
  removeScript: (id: string) => Promise<void>
  touchScript: (id: string) => Promise<void>

  createDeadline: (input: Omit<Deadline, 'id'>) => Promise<void>
  removeDeadline: (id: string) => Promise<void>

  createVenture: (input: Omit<AIVenture, 'id'>) => Promise<void>
  updateVenture: (id: string, patch: Partial<AIVenture>) => Promise<void>
  removeVenture: (id: string) => Promise<void>

  addTicker: (ticker: string, extra?: Partial<WatchlistItem>) => Promise<void>
  removeTicker: (id: string) => Promise<void>
}

function toIso(v: unknown): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return v
  const ts = v as { toDate?: () => Date }
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString()
  return undefined
}

function mapDocs<T>(snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }): T[] {
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      ...data,
      id: d.id,
      created_at: toIso(data.created_at),
      updated_at: toIso(data.updated_at),
    } as T
  })
}

export const useTrackersStore = create<TrackersState>()((set) => ({
  investors: [],
  scripts: [],
  deadlines: [],
  ventures: [],
  watchlist: [],
  loading: false,

  subscribe: () => {
    const base = opsPath('')?.replace(/\/$/, '')
    if (!base) return () => {}
    set({ loading: true })

    const subs = [
      onSnapshot(collection(lemonDb, `${base}/investors`), (snap) => {
        const investors = mapDocs<Investor>(snap).sort(
          (a, b) => (b.amountMXN ?? 0) - (a.amountMXN ?? 0),
        )
        set({ investors, loading: false })
      }),
      onSnapshot(collection(lemonDb, `${base}/scripts`), (snap) => {
        const scripts = mapDocs<Script>(snap).sort(
          (a, b) => (a.slatePosition ?? 99) - (b.slatePosition ?? 99),
        )
        set({ scripts })
      }),
      onSnapshot(collection(lemonDb, `${base}/deadlines`), (snap) => {
        const deadlines = mapDocs<Deadline>(snap).sort((a, b) => a.date.localeCompare(b.date))
        set({ deadlines })
      }),
      onSnapshot(collection(lemonDb, `${base}/ventures`), (snap) => {
        set({ ventures: mapDocs<AIVenture>(snap) })
      }),
      onSnapshot(collection(lemonDb, `${base}/watchlist`), (snap) => {
        set({ watchlist: mapDocs<WatchlistItem>(snap) })
      }),
    ]
    return () => subs.forEach((unsub) => unsub())
  },

  createInvestor: async (input) => {
    const path = opsPath('investors')
    if (!path) return
    await addDoc(collection(lemonDb, path), {
      ...input,
      source: input.source ?? 'manual',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
  },
  updateInvestor: async (id, patch) => {
    const path = opsPath('investors')
    if (!path) return
    await updateDoc(doc(lemonDb, `${path}/${id}`), { ...patch, updated_at: serverTimestamp() })
  },
  removeInvestor: async (id) => {
    const path = opsPath('investors')
    if (!path) return
    await deleteDoc(doc(lemonDb, `${path}/${id}`))
  },

  createScript: async (input) => {
    const path = opsPath('scripts')
    if (!path) return
    await addDoc(collection(lemonDb, path), {
      ...input,
      source: input.source ?? 'manual',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
  },
  updateScript: async (id, patch) => {
    const path = opsPath('scripts')
    if (!path) return
    await updateDoc(doc(lemonDb, `${path}/${id}`), { ...patch, updated_at: serverTimestamp() })
  },
  removeScript: async (id) => {
    const path = opsPath('scripts')
    if (!path) return
    await deleteDoc(doc(lemonDb, `${path}/${id}`))
  },
  touchScript: async (id) => {
    const path = opsPath('scripts')
    if (!path) return
    await updateDoc(doc(lemonDb, `${path}/${id}`), {
      lastTouchedAt: new Date().toISOString(),
      updated_at: serverTimestamp(),
    })
  },

  createDeadline: async (input) => {
    const path = opsPath('deadlines')
    if (!path) return
    await addDoc(collection(lemonDb, path), { ...input, source: input.source ?? 'manual' })
  },
  removeDeadline: async (id) => {
    const path = opsPath('deadlines')
    if (!path) return
    await deleteDoc(doc(lemonDb, `${path}/${id}`))
  },

  createVenture: async (input) => {
    const path = opsPath('ventures')
    if (!path) return
    await addDoc(collection(lemonDb, path), {
      ...input,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
  },
  updateVenture: async (id, patch) => {
    const path = opsPath('ventures')
    if (!path) return
    await updateDoc(doc(lemonDb, `${path}/${id}`), { ...patch, updated_at: serverTimestamp() })
  },
  removeVenture: async (id) => {
    const path = opsPath('ventures')
    if (!path) return
    await deleteDoc(doc(lemonDb, `${path}/${id}`))
  },

  addTicker: async (ticker, extra) => {
    const path = opsPath('watchlist')
    if (!path) return
    const id = ticker.trim().toLowerCase()
    if (!id) return
    await setDoc(doc(lemonDb, `${path}/${id}`), {
      ticker: ticker.trim().toUpperCase(),
      ...extra,
    })
  },
  removeTicker: async (id) => {
    const path = opsPath('watchlist')
    if (!path) return
    await deleteDoc(doc(lemonDb, `${path}/${id}`))
  },
}))
