import { create } from 'zustand'
import type { InboxThread } from '@shared/types'
import { generateDraftForThread } from '@/lib/copilot/draftClient'
import { sendReply } from '@/lib/copilot/sendReply'

export const UNSEND_MS = 5000

export interface DraftState {
  text: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  edited: boolean
}

export interface PendingSend {
  id: string
  threadId: string
  to: string
  subject: string
  body: string
  status: 'counting' | 'sending' | 'error'
}

// Timer handles are non-serializable, so keep them out of the store state.
const timers = new Map<string, ReturnType<typeof setTimeout>>()
let seq = 0

interface CopilotState {
  isOpen: boolean
  index: number
  drafts: Record<string, DraftState>
  pending: PendingSend[]
  open: () => void
  close: () => void
  next: (count: number) => void
  prev: () => void
  requestDraft: (thread: InboxThread) => Promise<void>
  setDraftText: (threadId: string, text: string) => void
  queueSend: (args: { threadId: string; to: string; subject: string; body: string }) => string
  undoSend: (id: string) => void
  retrySend: (id: string) => void
}

export const useCopilotStore = create<CopilotState>()((set, get) => ({
  isOpen: false,
  index: 0,
  drafts: {},
  pending: [],

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

  queueSend: (args) => {
    const id = `snd_${Date.now()}_${seq++}`
    set((s) => ({ pending: [...s.pending, { id, ...args, status: 'counting' }] }))
    const fire = async () => {
      timers.delete(id)
      set((s) => ({ pending: s.pending.map((p) => (p.id === id ? { ...p, status: 'sending' } : p)) }))
      try {
        await sendReply(args)
        set((s) => ({ pending: s.pending.filter((p) => p.id !== id) }))
      } catch {
        set((s) => ({ pending: s.pending.map((p) => (p.id === id ? { ...p, status: 'error' } : p)) }))
      }
    }
    timers.set(id, setTimeout(fire, UNSEND_MS))
    return id
  },

  undoSend: (id) => {
    const t = timers.get(id)
    if (!t) return // no live timer => already sending/committed (or gone): cannot undo
    clearTimeout(t)
    timers.delete(id)
    set((s) => ({ pending: s.pending.filter((p) => p.id !== id) }))
  },

  retrySend: (id) => {
    const p = get().pending.find((x) => x.id === id)
    if (!p) return
    const t = timers.get(id)
    if (t) {
      clearTimeout(t)
      timers.delete(id)
    }
    set((s) => ({ pending: s.pending.filter((x) => x.id !== id) }))
    get().queueSend({ threadId: p.threadId, to: p.to, subject: p.subject, body: p.body })
  },
}))
