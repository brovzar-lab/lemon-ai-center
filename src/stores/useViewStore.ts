import { create } from 'zustand'

export type ViewId =
  | 'briefing'
  | 'inbox'
  | 'deals'
  | 'projects'
  | 'fund'
  | 'writing'
  | 'you'
  | 'memory'
  | 'archive'

const VALID_VIEWS: ViewId[] = [
  'briefing',
  'inbox',
  'deals',
  'projects',
  'fund',
  'writing',
  'you',
  'memory',
  'archive',
]

const STORAGE_KEY = 'lemon-ai-center.view'

function readPersisted(): ViewId {
  if (typeof window === 'undefined') return 'briefing'
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v && (VALID_VIEWS as string[]).includes(v)) return v as ViewId
  } catch {
    /* ignore */
  }
  return 'briefing'
}

function writePersisted(view: ViewId) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, view)
  } catch {
    /* ignore */
  }
}

interface ViewState {
  view: ViewId
  setView: (view: ViewId) => void
}

export const useViewStore = create<ViewState>()((set) => ({
  view: readPersisted(),
  setView: (view) => {
    writePersisted(view)
    set({ view })
  },
}))
