import { create } from 'zustand'
import { apiFetch } from '@/lib/apiClient'
import type { SlateSkill, SlateSkillRun } from '@shared/types'

/**
 * Skills dispatch state (spec §4). Fire is fire-and-forget on the server —
 * the store polls the run log while anything is running so status chips
 * move without the UI ever blocking on the brain.
 */
interface SlateSkillsState {
  skills: SlateSkill[]
  runs: SlateSkillRun[]
  loaded: boolean
  loading: boolean
  firing: boolean
  error: string | null
  refresh: () => Promise<void>
  fire: (skill: string, project: string) => Promise<boolean>
}

const POLL_MS = 5_000
let pollTimer: ReturnType<typeof setTimeout> | null = null

export const useSlateSkillsStore = create<SlateSkillsState>()((set, get) => {
  const schedulePoll = () => {
    if (pollTimer) return
    pollTimer = setTimeout(async () => {
      pollTimer = null
      await get().refresh()
    }, POLL_MS)
  }

  return {
    skills: [],
    runs: [],
    loaded: false,
    loading: false,
    firing: false,
    error: null,

    refresh: async () => {
      set({ loading: true })
      try {
        const [{ skills }, { runs }] = await Promise.all([
          apiFetch<{ skills: SlateSkill[] }>('/api/slate/skills'),
          apiFetch<{ runs: SlateSkillRun[] }>('/api/slate/runs'),
        ])
        set({ skills, runs, loaded: true, loading: false, error: null })
        if (runs.some((r) => r.status === 'running')) schedulePoll()
      } catch (err) {
        set({ loading: false, loaded: true, error: (err as Error).message })
      }
    },

    fire: async (skill: string, project: string) => {
      set({ firing: true, error: null })
      try {
        await apiFetch<{ runId: string }>('/api/slate/skills/run', {
          method: 'POST',
          body: JSON.stringify({ skill, project }),
        })
        set({ firing: false })
        await get().refresh()
        return true
      } catch (err) {
        set({ firing: false, error: (err as Error).message })
        return false
      }
    },
  }
})
