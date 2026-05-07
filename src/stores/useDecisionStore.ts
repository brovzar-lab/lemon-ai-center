import { create } from 'zustand'
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firestore'
import { MutationQueue } from '@/lib/mutationQueue'
import type { Decision } from '@shared/types'

const queue = new MutationQueue()

function filterDecisions(decisions: Decision[], query: string): Decision[] {
  if (!query.trim()) return decisions
  const q = query.toLowerCase()
  return decisions.filter(
    (d) => d.text.toLowerCase().includes(q) || (d.tags ?? []).some((t) => t.includes(q)),
  )
}

interface DecisionState {
  decisions: Decision[]
  searchQuery: string
  filteredDecisions: Decision[]
  subscribe: (uid: string) => () => void
  add: (uid: string, text: string) => void
  setSearch: (query: string) => void
  exportMd: () => string
}

export const useDecisionStore = create<DecisionState>()((set, get) => ({
  decisions: [],
  searchQuery: '',
  filteredDecisions: [],

  subscribe: (uid) => {
    return onSnapshot(collection(db, `users/${uid}/decisions`), (snap) => {
      const decisions: Decision[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<Decision, 'id'>),
        id: d.id,
        ts: d.data().ts?.toDate?.()?.toISOString() ?? new Date().toISOString(),
        updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      }))
      decisions.sort((a, b) => b.ts.localeCompare(a.ts))
      set((s) => ({ decisions, filteredDecisions: filterDecisions(decisions, s.searchQuery) }))
    })
  },

  add: (uid, text) => {
    const tempId = `temp-${Date.now()}`
    const now = new Date().toISOString()
    const optimistic: Decision = { id: tempId, text, ts: now, updatedAt: now }
    set((s) => {
      const decisions = [optimistic, ...s.decisions]
      return { decisions, filteredDecisions: filterDecisions(decisions, s.searchQuery) }
    })

    queue.enqueue(tempId, async () => {
      const ref = await addDoc(collection(db, `users/${uid}/decisions`), {
        text,
        ts: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      set((s) => {
        const decisions = s.decisions.map((d) => (d.id === tempId ? { ...d, id: ref.id } : d))
        return { decisions, filteredDecisions: filterDecisions(decisions, s.searchQuery) }
      })
    }).catch(() => {
      set((s) => {
        const decisions = s.decisions.filter((d) => d.id !== tempId)
        return { decisions, filteredDecisions: filterDecisions(decisions, s.searchQuery) }
      })
    })
  },

  setSearch: (query) => {
    const { decisions } = get()
    set({ searchQuery: query, filteredDecisions: filterDecisions(decisions, query) })
  },

  exportMd: () => {
    const { decisions } = get()
    const lines = ['# Decision Journal', '']
    for (const d of decisions) {
      const date = d.ts.slice(0, 10)
      const outcome = d.outcome ? ` _(${d.outcome})_` : ''
      lines.push(`## ${date}${outcome}`, '', d.text, '')
      if (d.context) lines.push(`> ${d.context}`, '')
      if (d.tags?.length) lines.push(`Tags: ${d.tags.join(', ')}`, '')
    }
    return lines.join('\n')
  },
}))
