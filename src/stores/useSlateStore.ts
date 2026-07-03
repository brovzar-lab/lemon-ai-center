import { create } from 'zustand'
import { apiFetch, ApiError } from '@/lib/apiClient'
import type {
  SlateConfirmItem,
  SlateProject,
  SlateScanSummary,
  SlateStatusPayload,
} from '@shared/types'

/**
 * DEVELOPMENT-HELL slate store. Reads go through /api/slate (server-side
 * Firestore admin) rather than a client Firestore subscription — the slate
 * collections are server-owned (D2). Deliberately no seeds: the module's
 * empty state is a designed onboarding, never mock data.
 */
interface SlateState {
  status: SlateStatusPayload | null
  projects: SlateProject[]
  confirm: SlateConfirmItem[]
  loading: boolean
  loaded: boolean
  busy: boolean // onboard / rescan in flight
  error: string | null
  lastScan: SlateScanSummary | null
  refresh: () => Promise<void>
  onboard: (path: string) => Promise<boolean>
  rescan: () => Promise<boolean>
}

const SIGNED_OUT_STATUS: SlateStatusPayload = {
  onboarded: false,
  watcherActive: false,
  projectCount: 0,
  confirmCount: 0,
}

export const useSlateStore = create<SlateState>()((set, get) => ({
  status: null,
  projects: [],
  confirm: [],
  loading: false,
  loaded: false,
  busy: false,
  error: null,
  lastScan: null,

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const status = await apiFetch<SlateStatusPayload>('/api/slate/status')
      if (!status.onboarded) {
        set({ status, projects: [], confirm: [], loading: false, loaded: true })
        return
      }
      const [{ projects }, { items }] = await Promise.all([
        apiFetch<{ projects: SlateProject[] }>('/api/slate/projects'),
        apiFetch<{ items: SlateConfirmItem[] }>('/api/slate/confirm'),
      ])
      set({ status, projects, confirm: items, loading: false, loaded: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') {
        // Demo / signed-out: the wizard renders, actions require sign-in
        set({ status: SIGNED_OUT_STATUS, projects: [], confirm: [], loading: false, loaded: true })
        return
      }
      set({ loading: false, error: (err as Error).message })
    }
  },

  onboard: async (path: string) => {
    set({ busy: true, error: null })
    try {
      const { scan } = await apiFetch<{ status: SlateStatusPayload; scan: SlateScanSummary }>(
        '/api/slate/onboard',
        { method: 'POST', body: JSON.stringify({ path }) },
      )
      set({ lastScan: scan, busy: false })
      await get().refresh()
      return true
    } catch (err) {
      set({ busy: false, error: (err as Error).message })
      return false
    }
  },

  rescan: async () => {
    set({ busy: true, error: null })
    try {
      const { scan } = await apiFetch<{ status: SlateStatusPayload; scan: SlateScanSummary }>(
        '/api/slate/rescan',
        { method: 'POST', body: JSON.stringify({}) },
      )
      set({ lastScan: scan, busy: false })
      await get().refresh()
      return true
    } catch (err) {
      set({ busy: false, error: (err as Error).message })
      return false
    }
  },
}))
