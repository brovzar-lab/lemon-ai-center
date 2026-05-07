import { create } from 'zustand'

interface BrainSearchResult {
  path: string
  title: string
  folder: string
  snippet: string
  score: number
  modifiedAt: string
  frontmatter: Record<string, unknown>
}

interface BrainNote {
  path: string
  title: string
  folder: string
  content: string
  frontmatter: Record<string, unknown>
  modifiedAt: string
  links: string[]
  sizeBytes: number
}

interface BrainStats {
  ready: boolean
  docCount: number
  chunkCount: number
  totalBytes: number
}

interface BrainState {
  // Status
  stats: BrainStats
  loading: boolean
  searchLoading: boolean
  error: string | null

  // Search
  query: string
  results: BrainSearchResult[]
  recent: BrainSearchResult[]

  // Active note
  activeNote: BrainNote | null
  activeNoteLoading: boolean

  // Actions
  setQuery: (q: string) => void
  fetchStatus: () => Promise<void>
  search: (query: string) => Promise<void>
  fetchRecent: () => Promise<void>
  openNote: (path: string) => Promise<void>
  closeNote: () => void
}

export const useBrainStore = create<BrainState>((set) => ({
  stats: { ready: false, docCount: 0, chunkCount: 0, totalBytes: 0 },
  loading: false,
  searchLoading: false,
  error: null,
  query: '',
  results: [],
  recent: [],
  activeNote: null,
  activeNoteLoading: false,

  setQuery: (q) => set({ query: q }),

  fetchStatus: async () => {
    try {
      const res = await fetch('/api/brain/status')
      if (!res.ok) return
      const { data } = await res.json()
      set({ stats: data })
    } catch {
      // Brain may not be available yet
    }
  },

  search: async (query) => {
    if (!query.trim()) {
      set({ results: [], searchLoading: false })
      return
    }
    set({ searchLoading: true, query })
    try {
      const res = await fetch(`/api/brain/search?q=${encodeURIComponent(query)}&limit=15`)
      if (!res.ok) throw new Error('Search failed')
      const { data } = await res.json()
      set({ results: data.results, searchLoading: false })
    } catch (err) {
      set({ error: (err as Error).message, searchLoading: false })
    }
  },

  fetchRecent: async () => {
    set({ loading: true })
    try {
      const res = await fetch('/api/brain/recent?limit=8')
      if (!res.ok) throw new Error('Failed to fetch recent')
      const { data } = await res.json()
      set({ recent: data.results, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  openNote: async (path) => {
    set({ activeNoteLoading: true })
    try {
      const res = await fetch(`/api/brain/note/${encodeURIComponent(path)}`)
      if (!res.ok) throw new Error('Note not found')
      const { data } = await res.json()
      set({ activeNote: data, activeNoteLoading: false })
    } catch (err) {
      set({ error: (err as Error).message, activeNoteLoading: false })
    }
  },

  closeNote: () => set({ activeNote: null }),
}))
