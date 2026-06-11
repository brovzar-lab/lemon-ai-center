import { create } from 'zustand'

type Theme = 'light' | 'dark'

interface ThemeStore {
  theme: Theme
  toggle: () => void
  set: (t: Theme) => void
}

function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
  localStorage.setItem('lemon-theme', t)
}

function getInitialTheme(): Theme {
  // Respect persisted preference first
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('lemon-theme') as Theme | null
    if (stored === 'light' || stored === 'dark') return stored
  }
  // Fall back to OS-level dark mode preference
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

const initial = getInitialTheme()

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: initial,
  toggle: () =>
    set((s) => {
      const next = s.theme === 'light' ? 'dark' : 'light'
      applyTheme(next)
      return { theme: next }
    }),
  set: (t: Theme) => {
    applyTheme(t)
    set({ theme: t })
  },
}))

// Apply initial theme on load
if (typeof document !== 'undefined') {
  applyTheme(initial)
}
