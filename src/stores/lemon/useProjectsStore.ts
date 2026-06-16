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
import { lemonDb, isLemonWorkspaceConfigured, opsPath } from '@/lib/firestoreLemon'
import { apiFetch } from '@/lib/apiClient'
import type { LemonProject, ProjectCategory } from '@shared/types'

const rerank = () => void apiFetch('/api/engine/run/slip_detect', { method: 'POST' }).catch(() => {})

interface ProjectsState {
  projects: LemonProject[]
  loading: boolean
  configured: boolean
  subscribe: () => () => void
  create: (input: Omit<LemonProject, 'id'>) => Promise<void>
  updateCategory: (id: string, category: ProjectCategory) => Promise<void>
  update: (id: string, patch: Partial<LemonProject>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useProjectsStore = create<ProjectsState>()((set) => ({
  projects: [],
  loading: false,
  configured: isLemonWorkspaceConfigured(),

  subscribe: () => {
    const path = opsPath('projects')
    if (!path) return () => {}
    set({ loading: true })
    // No server-side orderBy: a compound orderBy needs a composite Firestore
    // index, and without it the listener fails (silently) and the board shows
    // empty. Read unordered and sort client-side instead.
    const unsub = onSnapshot(
      collection(lemonDb, path),
      (snap) => {
        const projects: LemonProject[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<LemonProject, 'id'>) }))
          .sort(
            (a, b) =>
              (a.category ?? '').localeCompare(b.category ?? '') ||
              (a.sort_order ?? 0) - (b.sort_order ?? 0),
          )
        set({ projects, loading: false })
      },
      (err) => {
        console.error('[projects] subscription error:', err)
        set({ loading: false })
      },
    )
    return unsub
  },

  create: async (input) => {
    const path = opsPath('projects')
    if (!path) return
    await addDoc(collection(lemonDb, path), {
      ...input,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
    rerank()
  },

  updateCategory: async (id, category) => {
    const path = opsPath('projects')
    if (!path) return
    await updateDoc(doc(lemonDb, `${path}/${id}`), {
      category,
      updated_at: serverTimestamp(),
    })
    rerank()
  },

  update: async (id, patch) => {
    const path = opsPath('projects')
    if (!path) return
    await updateDoc(doc(lemonDb, `${path}/${id}`), {
      ...patch,
      updated_at: serverTimestamp(),
    })
    rerank()
  },

  remove: async (id) => {
    const path = opsPath('projects')
    if (!path) return
    await deleteDoc(doc(lemonDb, `${path}/${id}`))
  },
}))
