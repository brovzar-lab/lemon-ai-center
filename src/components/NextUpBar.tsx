import { useCalendarStore } from '@/stores/useCalendarStore'
import { useUIStore } from '@/stores/useUIStore'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function NextUpBar() {
  const events = useCalendarStore((s) => s.events)
  const openModal = useUIStore((s) => s.openModal)
  const { newDashboard } = useFeatureFlags()
  const required = events.filter((e) => e.isRequired)

  if (!required.length) return null

  const next = required[0]

  if (newDashboard) {
    // Enhanced layout matching Banani design: single prominent bar
    return (
      <div className="mt-4 rounded-xl border border-line bg-sunken/30 p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-ink-3">
            <span className="text-[11px] uppercase tracking-widest font-sans font-semibold">Next</span>
          </div>
          <span className="text-[15px] font-sans font-semibold tabular-nums text-ink">
            {formatTime(next.start)}
          </span>
          <div className="w-px h-5 bg-line" />
          <span className="text-[15px] font-sans font-medium text-ink/90">
            {next.title}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {/* Attendees chip */}
          {next.attendees && next.attendees.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-sans text-ink-3 bg-sunken border border-line rounded-md px-3 py-1.5 shadow-sm">
              <span>👤</span>
              <span>
                {next.attendees.slice(0, 3).join(', ')}
                {next.attendees.length > 3 && ` +${next.attendees.length - 3}`}
              </span>
            </div>
          )}
          {/* PREP action */}
          <button
            type="button"
            onClick={() => openModal('meeting-prep')}
            className="flex items-center gap-1 text-[11px] uppercase tracking-widest font-sans font-bold text-ink-3 hover:text-ink transition cursor-pointer px-2"
          >
            PREP
            <span className="text-xs">↗</span>
          </button>
        </div>
      </div>
    )
  }

  // Legacy layout
  return (
    <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
      <span className="text-xs text-ink-3 font-sans font-medium shrink-0">Next up:</span>
      {required.map((meeting) => (
        <button
          key={meeting.id}
          type="button"
          data-testid="meeting-pill"
          onClick={() => openModal('meeting-prep')}
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-sunken border border-line rounded-lg text-xs font-sans text-ink-2 hover:border-line hover:text-ink transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-data-coral shrink-0" />
          <span className="font-medium">{formatTime(meeting.start)}</span>
          <span className="text-ink-3 max-w-[160px] truncate">{meeting.title}</span>
        </button>
      ))}
    </div>
  )
}
