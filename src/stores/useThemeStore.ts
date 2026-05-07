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

const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('lemon-theme')) as Theme | null

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: stored || 'light',
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
  applyTheme(stored || 'light')
}
