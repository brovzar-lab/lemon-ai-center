import { create } from 'zustand'

export interface PriorityItem {
  rank: number
  label: 'Deals' | 'Production' | 'Development'
  title: string
  rationale: string
  urgency: 'critical' | 'high' | 'medium'
  threadCount: number
  threadIds: string[]
}

export interface EnrichedFlag {
  personName: string
  personSlug: string
  daysSince: number
  lastContactLabel: string
  flagType: 'stale' | 'reappearing'
  rankScore: number
  contextLine: string
  reappearSubject?: string
}

export interface TodayProgress {
  done: number
  queued: number
  deferred: number
  archived: number
  logged: number
  decisions: number
}

interface TodayState {
  priorities: PriorityItem[]
  northStar: string
  precomputeAge: string | null
  precomputeToday: boolean
  enrichedFlags: EnrichedFlag[]
  progress: TodayProgress
  loading: boolean
  error: string | null

  fetchToday: () => Promise<void>
  fetchProgress: () => Promise<void>
  triggerPrecompute: () => Promise<void>
  logInteraction: (slug: string, note?: string) => Promise<void>
}

export const useTodayStore = create<TodayState>()((set, get) => ({
  priorities: [],
  northStar: '',
  precomputeAge: null,
  precomputeToday: false,
  enrichedFlags: [],
  progress: { done: 0, queued: 0, deferred: 0, archived: 0, logged: 0, decisions: 0 },
  loading: false,
  error: null,

  fetchToday: async () => {
    set({ loading: true, error: null })
    try {
      const res = await fetch('/api/today', { credentials: 'include' })
      const json = await res.json()
      if (json.data) {
        set({
          priorities: json.data.priorities ?? [],
          northStar: json.data.northStar ?? '',
          precomputeAge: json.data.precomputeAge ?? null,
          precomputeToday: json.data.precomputeToday ?? false,
          enrichedFlags: json.data.enrichedFlags ?? [],
          loading: false,
        })
      }
    } catch {
      set({ loading: false, error: 'Failed to load today data' })
    }
  },

  fetchProgress: async () => {
    try {
      const res = await fetch('/api/today-progress', { credentials: 'include' })
      const json = await res.json()
      if (json.data) {
        set({ progress: json.data })
      }
    } catch {
      // silent
    }
  },

  triggerPrecompute: async () => {
    try {
      // CSRF is enforced by the sameSite cookie + Origin allowlist; no token needed.
      await fetch('/api/precompute', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      // Refresh after precompute
      await get().fetchToday()
    } catch {
      // silent
    }
  },

  logInteraction: async (slug, note) => {
    try {
      await fetch('/api/relationship/log', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, note }),
      })
      // Remove from local state
      set((s) => ({ enrichedFlags: s.enrichedFlags.filter((f) => f.personSlug !== slug) }))
    } catch {
      // silent
    }
  },
}))
