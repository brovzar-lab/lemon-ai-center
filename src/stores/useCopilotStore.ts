import { create } from 'zustand'
import type { InboxThread } from '@shared/types'
import { fetchCachedDrafts, generateDraftForThread } from '@/lib/copilot/draftClient'
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
  hydrated: boolean
  drafts: Record<string, DraftState>
  pending: PendingSend[]
  open: () => void
  close: () => void
  next: (count: number) => void
  prev: () => void
  requestDraft: (thread: InboxThread) => Promise<void>
  hydrateFromCache: (threads: InboxThread[]) => Promise<void>
  setDraftText: (threadId: string, text: string) => void
  queueSend: (args: { threadId: string; to: string; subject: string; body: string }) => string
  undoSend: (id: string) => void
  retrySend: (id: string) => void
}

export const useCopilotStore = create<CopilotState>()((set, get) => ({
  isOpen: false,
  index: 0,
  hydrated: false,
  drafts: {},
  pending: [],

  open: () => set({ isOpen: true, index: 0, hydrated: false }),
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

  // Seeds `drafts` from the server cache (Task 13's pre-generated drafts) so
  // the deck can show a reply instantly instead of always drafting on open.
  // Only fills threads with no existing draft entry — requestDraft already
  // no-ops once a draft is 'ready' (or 'loading'), so a hydrated card won't
  // re-draft. Staleness isn't checked here: the client can't see a thread's
  // latest message id, so any cache hit is treated as ready and left to the
  // next inbox scan to refresh (documented limitation, Task 14 brief).
  // A failed cache probe (network error, bad JSON, etc.) degrades to a no-op
  // rather than throwing — the on-demand path in requestDraft still covers
  // every thread regardless.
  hydrateFromCache: async (threads) => {
    try {
      const cached = await fetchCachedDrafts()
      set((s) => {
        const drafts = { ...s.drafts }
        for (const t of threads) {
          const hit = cached[t.id]
          if (hit && !drafts[t.id]) drafts[t.id] = { text: hit.draft, status: 'ready', edited: false }
        }
        return { drafts }
      })
    } catch {
      // no-op: leave drafts as-is, on-demand generation still covers every thread
    }
    // Gate for requestDraft (CopilotTriage): flips true whether the cache probe
    // succeeded or failed, so a network/cache hiccup falls through to on-demand
    // drafting instead of permanently blocking it. Set unconditionally, after
    // the seed attempt above, so requestDraft never races hydration's read of
    // `drafts` for the very first card (Task 14 fix).
    set({ hydrated: true })
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
