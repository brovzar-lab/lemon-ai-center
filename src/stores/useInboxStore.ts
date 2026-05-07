import { create } from 'zustand'
import { apiFetch } from '@/lib/apiClient'
import type { InboxThread } from '@shared/types'

interface InboxState {
  threads: InboxThread[]
  triageMode: boolean
  activeThread: string | null
  loading: boolean
  fetch: () => Promise<void>
  enterTriage: () => void
  exitTriage: () => void
  nextThread: () => void
  prevThread: () => void
  setActiveThread: (id: string) => void
}

export const useInboxStore = create<InboxState>()((set, get) => ({
  // FIX 3: Start empty — no seed data
  threads: [],
  triageMode: false,
  activeThread: null,
  loading: false,

  fetch: async () => {
    set({ loading: true })
    try {
      const threads = await apiFetch<InboxThread[]>('/api/gmail/threads')
      set({ threads, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  enterTriage: () => {
    const { threads } = get()
    set({ triageMode: true, activeThread: threads[0]?.id ?? null })
  },

  exitTriage: () => set({ triageMode: false, activeThread: null }),

  nextThread: () => {
    const { threads, activeThread } = get()
    const idx = threads.findIndex((t) => t.id === activeThread)
    if (idx < threads.length - 1) set({ activeThread: threads[idx + 1].id })
  },

  prevThread: () => {
    const { threads, activeThread } = get()
    const idx = threads.findIndex((t) => t.id === activeThread)
    if (idx > 0) set({ activeThread: threads[idx - 1].id })
  },

  setActiveThread: (id) => set({ activeThread: id }),
}))
