import { useThemeStore } from '@/stores/useThemeStore'
import { Moon, Sun, Settings } from 'lucide-react'

interface HeaderProps {
  onOpenSettings?: () => void
}

export function Header({ onOpenSettings }: HeaderProps) {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)

  return (
    <header className="sticky top-0 z-40 bg-bg/90 backdrop-blur-sm border-b border-line px-6 py-2.5 flex items-center justify-between" role="banner">
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-sans font-bold uppercase tracking-[0.2em] text-ink">
          Lemon Studios
        </span>
        <span className="text-[11px] font-sans uppercase tracking-[0.2em] text-ink-3">
          Command
        </span>
      </div>
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="text-[11px] font-sans text-ink-3 hover:text-ink transition-colors px-2 py-1.5 rounded-md border border-line hover:border-line min-w-[36px] min-h-[36px] flex items-center justify-center"
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-[11px] font-sans text-ink-3 hover:text-ink transition-colors px-2 py-1.5 rounded-md border border-line hover:border-line min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label="Open settings"
          >
            <Settings size={16} />
          </button>
        )}
        <a
          href="/auth/google/logout"
          className="text-[11px] font-sans text-ink-3 hover:text-ink-3 transition-colors"
          aria-label="Sign out of your account"
        >
          Sign out
        </a>
      </div>
    </header>
  )
}
