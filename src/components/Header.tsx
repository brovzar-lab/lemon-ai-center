import { useInboxStore } from '@/stores/useInboxStore'
import { useCalendarStore } from '@/stores/useCalendarStore'
import { useBrainStore } from '@/stores/useBrainStore'
import { useBriefStore } from '@/stores/useBriefStore'
import { useThemeStore } from '@/stores/useThemeStore'
import { SyncingPill } from './SyncingPill'
import { ScanInboxButton } from './ScanInboxButton'
import { Moon, Sun, Settings, RefreshCw } from 'lucide-react'

interface HeaderProps {
  onOpenSettings?: () => void
}

export function Header({ onOpenSettings }: HeaderProps) {
  const fetchInbox = useInboxStore((s) => s.fetch)
  const fetchCalendar = useCalendarStore((s) => s.fetch)
  const fetchBrain = useBrainStore((s) => s.fetchStatus)
  const refreshBrief = useBriefStore((s) => s.refresh)
  const isStreaming = useBriefStore((s) => s.isStreaming)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)

  const syncAll = () => {
    fetchInbox()
    fetchCalendar()
    fetchBrain()
    refreshBrief(true)
  }

  return (
    <header className="sticky top-0 z-40 bg-bg/90 backdrop-blur-sm border-b border-line px-4 sm:px-6 py-2.5 flex items-center justify-between gap-2 overflow-x-clip" role="banner">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[11px] font-sans font-bold uppercase tracking-[0.2em] text-ink whitespace-nowrap">
          Lemon Studios
        </span>
        <span className="hidden sm:inline text-[11px] font-sans uppercase tracking-[0.2em] text-ink-3">
          Command
        </span>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <SyncingPill />
        <ScanInboxButton compact />
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
        <button
          type="button"
          onClick={syncAll}
          disabled={isStreaming}
          className="text-[11px] font-sans font-semibold text-ink-2 hover:text-ink transition-colors px-2.5 sm:px-3 py-1.5 rounded-md border border-line hover:border-line disabled:opacity-40 min-w-[36px] min-h-[36px] flex items-center justify-center gap-1.5"
          aria-label="Refresh all data"
        >
          <RefreshCw size={14} /> <span className="hidden sm:inline">Sync</span>
        </button>
        <a
          href="/auth/google/logout"
          className="text-[11px] font-sans text-ink-3 hover:text-ink-3 transition-colors whitespace-nowrap flex-shrink-0"
          aria-label="Sign out of your account"
        >
          Sign out
        </a>
      </div>
    </header>
  )
}
