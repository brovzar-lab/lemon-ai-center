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
      // POST — the server route is POST-only (a GET here 404'd silently for months)
      const data = await apiFetch<{ text: string; cached: boolean }>('/api/claude/spark', { method: 'POST' })
      set({ text: data.text, isStale: data.cached, loading: false })
    } catch {
      set({ loading: false })
    }
  },
}))
