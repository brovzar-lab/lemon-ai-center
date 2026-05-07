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
import { db } from '@/lib/firestore'
import { MutationQueue } from '@/lib/mutationQueue'
import type { Task, Bucket, TaskSource } from '@shared/types'

const queue = new MutationQueue()

interface TaskState {
  tasks: Task[]
  setTasks: (tasks: Task[]) => void
  subscribe: (uid: string) => () => void
  create: (uid: string, partial: { title: string; bucket: Bucket; source: TaskSource; notes?: string }) => void
  moveBucket: (uid: string, id: string, bucket: Bucket) => void
  toggleDone: (uid: string, id: string) => void
  remove: (uid: string, id: string) => void
}

export const useTaskStore = create<TaskState>()((set, get) => ({
  tasks: [],

  setTasks: (tasks) => set({ tasks }),

  subscribe: (uid) => {
    const unsub = onSnapshot(collection(db, `users/${uid}/tasks`), (snap) => {
      const tasks: Task[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<Task, 'id'>),
        id: d.id,
        createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
        updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      }))
      set({ tasks })
    })
    return unsub
  },

  create: (uid, partial) => {
    const tempId = `temp-${Date.now()}`
    const now = new Date().toISOString()
    const optimistic: Task = {
      id: tempId,
      title: partial.title,
      bucket: partial.bucket,
      source: partial.source,
      notes: partial.notes,
      done: false,
      createdAt: now,
      updatedAt: now,
    }
    set((s) => ({ tasks: [...s.tasks, optimistic] }))

    queue.enqueue(tempId, async () => {
      const ref = await addDoc(collection(db, `users/${uid}/tasks`), {
        title: partial.title,
        bucket: partial.bucket,
        source: partial.source,
        notes: partial.notes ?? null,
        done: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      // Replace temp id with real id
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === tempId ? { ...t, id: ref.id } : t)),
      }))
    }).catch(() => {
      // Revert optimistic update on failure
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== tempId) }))
    })
  },

  moveBucket: (uid, id, bucket) => {
    set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, bucket } : t) }))
    queue.enqueue(id, () =>
      updateDoc(doc(db, `users/${uid}/tasks/${id}`), { bucket, updatedAt: serverTimestamp() }),
    ).catch(() => {
      // On failure the onSnapshot will restore correct state
    })
  },

  toggleDone: (uid, id) => {
    const task = get().tasks.find((t) => t.id === id)
    if (!task) return
    const done = !task.done
    set((s) => ({
      tasks: s.tasks.map((t) => t.id === id ? { ...t, done, doneAt: done ? new Date().toISOString() : undefined } : t),
    }))
    queue.enqueue(id, () =>
      updateDoc(doc(db, `users/${uid}/tasks/${id}`), {
        done,
        doneAt: done ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      }),
    ).catch(() => {
      // On failure the onSnapshot will restore correct state
    })
  },

  remove: (uid, id) => {
    const prev = get().tasks
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
    queue.enqueue(id, () =>
      deleteDoc(doc(db, `users/${uid}/tasks/${id}`)),
    ).catch(() => {
      set({ tasks: prev })
    })
  },
}))
