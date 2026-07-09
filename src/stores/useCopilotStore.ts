import { create } from 'zustand'
import type { InboxThread } from '@shared/types'
import { generateDraftForThread } from '@/lib/copilot/draftClient'

export interface DraftState {
  text: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  edited: boolean
}

interface CopilotState {
  isOpen: boolean
  index: number
  drafts: Record<string, DraftState>
  open: () => void
  close: () => void
  next: (count: number) => void
  prev: () => void
  requestDraft: (thread: InboxThread) => Promise<void>
  setDraftText: (threadId: string, text: string) => void
}

export const useCopilotStore = create<CopilotState>()((set, get) => ({
  isOpen: false,
  index: 0,
  drafts: {},

  open: () => set({ isOpen: true, index: 0 }),
  close: () => set({ isOpen: false }),
  next: (count) => set((s) => ({ index: Math.min(s.index + 1, Math.max(0, count - 1)) })),
  prev: () => set((s) => ({ index: Math.max(s.index - 1, 0) })),

  requestDraft: async (thread) => {
    const existing = get().drafts[thread.id]
    if (existing && (existing.status === 'ready' || existing.status === 'loading')) return
    set((s) => ({ drafts: { ...s.drafts, [thread.id]: { text: '', status: 'loading', edited: false } } }))
    try {
      const text = await generateDraftForThread(thread, 'peer', (tok) =>
        set((s) => {
          const d = s.drafts[thread.id]
          if (!d || d.edited) return {}
          return { drafts: { ...s.drafts, [thread.id]: { ...d, text: d.text + tok } } }
        }),
      )
      set((s) => {
        const d = s.drafts[thread.id]
        if (d?.edited) return {}
        return { drafts: { ...s.drafts, [thread.id]: { text, status: 'ready', edited: false } } }
      })
    } catch {
      set((s) => {
        const d = s.drafts[thread.id]
        if (d?.edited) return {}
        return { drafts: { ...s.drafts, [thread.id]: { text: '', status: 'error', edited: false } } }
      })
    }
  },

  setDraftText: (threadId, text) =>
    set((s) => ({ drafts: { ...s.drafts, [threadId]: { text, status: 'ready', edited: true } } })),
}))
