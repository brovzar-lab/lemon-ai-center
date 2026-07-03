import { create } from 'zustand'
import { apiFetch } from '@/lib/apiClient'
import type { SlateBriefing, SlateBriefingStatus } from '@shared/types'

/**
 * Morning briefing state (spec §5). Generation is background on the server;
 * the store polls while it's generating so the five sections fill in
 * without ever blocking module open. Cached for the day server-side, so a
 * ready briefing returns immediately on subsequent opens.
 */
interface SlateBriefingState {
  briefing: SlateBriefing | null
  status: SlateBriefingStatus | 'idle'
  loaded: boolean
  refreshing: boolean
  error: string | null
  load: () => Promise<void>
  refresh: () => Promise<void>
}

const POLL_MS = 4_000
const POLL_LIMIT = 45 // ~3 min ceiling before we stop polling a stuck run
let pollTimer: ReturnType<typeof setTimeout> | null = null
let polls = 0

export const useSlateBriefingStore = create<SlateBriefingState>()((set, get) => {
  const stopPoll = () => {
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
    polls = 0
  }

  const apply = (result: { status: SlateBriefingStatus; briefing?: SlateBriefing }) => {
    if (result.status === 'ready' && result.briefing) {
      set({ briefing: result.briefing, status: 'ready', loaded: true, refreshing: false, error: null })
      stopPoll()
      return
    }
    if (result.status === 'failed') {
      set({ status: 'failed', loaded: true, refreshing: false, error: 'Briefing generation failed' })
      stopPoll()
      return
    }
    // generating — keep any prior briefing visible, poll for the fresh one
    set({ status: 'generating', loaded: true })
    if (!pollTimer && polls < POLL_LIMIT) {
      pollTimer = setTimeout(() => {
        pollTimer = null
        polls += 1
        void get().load()
      }, POLL_MS)
    } else if (polls >= POLL_LIMIT) {
      stopPoll()
      set({ refreshing: false })
    }
  }

  return {
    briefing: null,
    status: 'idle',
    loaded: false,
    refreshing: false,
    error: null,

    load: async () => {
      try {
        const result = await apiFetch<{ status: SlateBriefingStatus; briefing?: SlateBriefing }>(
          '/api/slate/briefing',
        )
        apply(result)
      } catch (err) {
        set({ loaded: true, refreshing: false, error: (err as Error).message })
        stopPoll()
      }
    },

    refresh: async () => {
      set({ refreshing: true, error: null })
      polls = 0
      try {
        const result = await apiFetch<{ status: SlateBriefingStatus; briefing?: SlateBriefing }>(
          '/api/slate/briefing/refresh',
          { method: 'POST', body: JSON.stringify({}) },
        )
        apply(result)
      } catch (err) {
        set({ refreshing: false, error: (err as Error).message })
      }
    },
  }
})
