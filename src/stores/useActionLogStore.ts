import { create } from 'zustand'
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firestore'
import { MutationQueue } from '@/lib/mutationQueue'
import type { AIAction, AIActionType, Citation } from '@shared/types'

const queue = new MutationQueue()

interface ActionLogState {
  actions: AIAction[]
  subscribe: (uid: string) => () => void
  addAction: (uid: string, action: Omit<AIAction, 'id' | 'createdAt' | 'expiresAt'>) => void
  undo: (uid: string, id: string) => void
  /** Count of non-undone actions in the last 24h */
  activeCount: () => number
}

export const useActionLogStore = create<ActionLogState>()((set, get) => ({
  actions: [],

  subscribe: (uid) => {
    return onSnapshot(collection(db, `users/${uid}/actions`), (snap) => {
      const actions: AIAction[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<AIAction, 'id'>),
        id: d.id,
        createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
        expiresAt: d.data().expiresAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      }))
      // Sort newest first
      actions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      set({ actions })
    })
  },

  addAction: (uid, action) => {
    const tempId = `temp-${Date.now()}`
    const now = new Date()
    const optimistic: AIAction = {
      ...action,
      id: tempId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    }
    set((s) => ({ actions: [optimistic, ...s.actions] }))

    queue.enqueue(tempId, async () => {
      const ref = await addDoc(collection(db, `users/${uid}/actions`), {
        type: action.type,
        target: action.target,
        sourceRef: action.sourceRef ?? null,
        confidence: action.confidence,
        initiator: action.initiator,
        reversible: action.reversible,
        undone: false,
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      set((s) => ({
        actions: s.actions.map((a) => (a.id === tempId ? { ...a, id: ref.id } : a)),
      }))
    }).catch(() => {
      set((s) => ({ actions: s.actions.filter((a) => a.id !== tempId) }))
    })
  },

  undo: (uid, id) => {
    // Optimistic: mark as undone
    set((s) => ({
      actions: s.actions.map((a) => (a.id === id ? { ...a, undone: true } : a)),
    }))

    queue.enqueue(id, () =>
      updateDoc(doc(db, `users/${uid}/actions/${id}`), { undone: true }),
    ).catch(() => {
      // onSnapshot will restore correct state
    })
  },

  activeCount: () => {
    const now = Date.now()
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000
    return get().actions.filter(
      (a) => !a.undone && new Date(a.createdAt).getTime() > twentyFourHoursAgo,
    ).length
  },
}))
