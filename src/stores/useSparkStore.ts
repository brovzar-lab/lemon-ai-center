import { create } from 'zustand'
import { apiFetch } from '@/lib/apiClient'

interface SparkState {
  text: string
  isStale: boolean
  loading: boolean
  fetch: () => Promise<void>
}

export const useSparkStore = create<SparkState>()((set) => ({
  text: '',
  isStale: true,
  loading: false,

  fetch: async () => {
    set({ loading: true })
    try {
      const data = await apiFetch<{ text: string; cached: boolean }>('/api/claude/spark')
      set({ text: data.text, isStale: data.cached, loading: false })
    } catch {
      set({ loading: false })
    }
  },
}))
