import { useInboxStore } from '@/stores/useInboxStore'
import { useCalendarStore } from '@/stores/useCalendarStore'
import { useBrainStore } from '@/stores/useBrainStore'
import { useBriefStore } from '@/stores/useBriefStore'
import { useThemeStore } from '@/stores/useThemeStore'
import { SyncingPill } from './SyncingPill'

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
    <header className="sticky top-0 z-40 bg-bg-base/90 backdrop-blur-sm border-b border-border-soft px-6 py-2.5 flex items-center justify-between" role="banner">
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-body font-bold uppercase tracking-[0.2em] text-text-primary">
          Lemon Studios
        </span>
        <span className="text-[10px] font-body uppercase tracking-[0.2em] text-text-muted">
          Command
        </span>
      </div>
      <div className="flex items-center gap-2">
        <SyncingPill />
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="text-[11px] font-body text-text-muted hover:text-text-primary transition-colors px-2 py-1.5 rounded-md border border-border-soft hover:border-border-medium min-w-[36px] min-h-[36px] flex items-center justify-center"
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? '◐' : '☀'}
        </button>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-[11px] font-body text-text-muted hover:text-text-primary transition-colors px-2 py-1.5 rounded-md border border-border-soft hover:border-border-medium min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label="Open settings"
          >
            ⚙
          </button>
        )}
        <button
          type="button"
          onClick={syncAll}
          disabled={isStreaming}
          className="text-[11px] font-body font-semibold text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 rounded-md border border-border-soft hover:border-border-medium disabled:opacity-40 min-h-[36px]"
          aria-label="Refresh all data"
        >
          ↻ Sync
        </button>
        <a
          href="/auth/google/logout"
          className="text-[11px] font-body text-text-muted hover:text-text-tertiary transition-colors"
          aria-label="Sign out of your account"
        >
          Sign out
        </a>
      </div>
    </header>
  )
}
