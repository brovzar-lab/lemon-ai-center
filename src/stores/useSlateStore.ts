import { create } from 'zustand'
import { apiFetch, ApiError } from '@/lib/apiClient'
import type { SlateProject } from '@shared/types'

/**
 * DEVELOPMENT-HELL slate store. Reads go through /api/slate (server-side
 * Firestore admin) rather than a client Firestore subscription — the slate
 * collections are server-owned (D2). Deliberately no seeds: the module's
 * empty state is a designed onboarding, never mock data.
 */
interface SlateState {
  projects: SlateProject[]
  loading: boolean
  loaded: boolean
  error: string | null
  fetch: () => Promise<void>
}

export const useSlateStore = create<SlateState>()((set) => ({
  projects: [],
  loading: false,
  loaded: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null })
    try {
      const { projects } = await apiFetch<{ projects: SlateProject[] }>('/api/slate/projects')
      set({ projects, loading: false, loaded: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') {
        // Demo / signed-out: an empty slate, not an error banner
        set({ projects: [], loading: false, loaded: true })
        return
      }
      set({ loading: false, error: (err as Error).message })
    }
  },
}))
