import { create } from 'zustand'
import { apiFetch } from '@/lib/apiClient'
import type { InboxThread } from '@shared/types'

interface InboxState {
  threads: InboxThread[]
  triageMode: boolean
  activeThread: string | null
  loading: boolean
  error: string | null
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
  error: null,

  fetch: async () => {
    set({ loading: true, error: null })
    try {
      const threads = await apiFetch<InboxThread[]>('/api/gmail/threads')
      set({ threads, loading: false, error: null })
    } catch (err) {
      // Do NOT leave threads silently empty — that renders as "all clear" and
      // hides a real Gmail failure. Record the error so the view can say so.
      set({ loading: false, error: (err as Error).message || 'Failed to load inbox' })
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
