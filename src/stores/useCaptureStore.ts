import { create } from 'zustand'
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firestore'
import { MutationQueue } from '@/lib/mutationQueue'
import type { Capture } from '@shared/types'

const queue = new MutationQueue()

interface CaptureState {
  captures: Capture[]
  subscribe: (uid: string) => () => void
  create: (uid: string, payload: { text: string; kind: Capture['kind'] }) => void
  markReviewed: (uid: string, id: string) => void
}

export const useCaptureStore = create<CaptureState>()((set, get) => ({
  captures: [],

  subscribe: (uid) => {
    return onSnapshot(collection(db, `users/${uid}/captures`), (snap) => {
      const captures: Capture[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<Capture, 'id'>),
        id: d.id,
        createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      }))
      // Sort newest first
      captures.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      set({ captures })
    })
  },

  create: (uid, payload) => {
    const tempId = `temp-${Date.now()}`
    const now = new Date().toISOString()
    const optimistic: Capture = {
      id: tempId,
      text: payload.text,
      kind: payload.kind,
      createdAt: now,
    }
    set((s) => ({ captures: [optimistic, ...s.captures] }))

    queue.enqueue(tempId, async () => {
      const ref = await addDoc(collection(db, `users/${uid}/captures`), {
        text: payload.text,
        kind: payload.kind,
        reviewed: false,
        createdAt: serverTimestamp(),
      })
      set((s) => ({
        captures: s.captures.map((c) => (c.id === tempId ? { ...c, id: ref.id } : c)),
      }))
    }).catch(() => {
      // Revert optimistic update on failure
      set((s) => ({ captures: s.captures.filter((c) => c.id !== tempId) }))
    })
  },

  markReviewed: (uid, id) => {
    // Optimistic: remove from unreviewed list
    set((s) => ({
      captures: s.captures.map((c) => (c.id === id ? { ...c, reviewed: true } : c)),
    }))

    queue.enqueue(id, () =>
      updateDoc(doc(db, `users/${uid}/captures/${id}`), {
        reviewed: true,
      }),
    ).catch(() => {
      // onSnapshot will restore correct state
    })
  },
}))
