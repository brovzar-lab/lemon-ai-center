import { useCalendarStore } from '@/stores/useCalendarStore'
import { useUIStore } from '@/stores/useUIStore'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function CalendarDayView() {
  const events = useCalendarStore((s) => s.events)
  const loading = useCalendarStore((s) => s.loading)
  const openModal = useUIStore((s) => s.openModal)

  const required = events.filter((e) => e.isRequired)

  return (
    <section className="mt-6" aria-label="Today's calendar">
      {/* Section label */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-body font-bold uppercase tracking-[0.2em] text-text-muted">
          Today's Calendar
        </p>
        {required.length > 0 && (
          <span className="text-[10px] font-body font-bold uppercase tracking-[0.2em] text-accent-coral flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-coral inline-block" aria-hidden="true" />
            Required
          </span>
        )}
      </div>

      <p className="text-[10px] font-body font-bold uppercase tracking-[0.2em] text-text-muted mb-4">
        The Day Ahead · Chronological
      </p>

      {/* M6: Loading skeleton */}
      {loading && events.length === 0 ? (
        <div className="grid grid-cols-2 gap-3" aria-busy="true" aria-label="Loading calendar events">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-3 border border-border-soft">
              <div className="skeleton skeleton-line w-20" />
              <div className="skeleton skeleton-line w-full" />
              <div className="skeleton skeleton-line skeleton-line-short" />
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-[11px] font-body text-text-muted italic">No meetings scheduled today.</p>
      ) : (
        <>
          <p className="text-[11px] font-body text-text-tertiary mb-4">
            {events.length} meetings · pick one to prep for
          </p>

          {/* 2-column meeting grid */}
          <div className="grid grid-cols-2 gap-3" role="list" aria-label="Today's meetings">
            {events.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => openModal('meeting-prep')}
                className="text-left p-3 border border-border-soft hover:border-border-medium transition-colors group"
                role="listitem"
                aria-label={`${formatTime(event.start)} — ${event.title}${event.isRequired ? ' (required)' : ''}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[13px] font-body font-semibold tabular-nums text-text-primary">
                    {formatTime(event.start)}
                  </span>
                  {event.isRequired && (
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-coral flex-shrink-0" aria-hidden="true" />
                  )}
                </div>
                <p className="text-[13px] font-body font-medium text-text-primary leading-snug mb-1">
                  {event.title}
                  <span className="text-text-muted ml-1 group-hover:text-accent-coral transition-colors" aria-hidden="true">→</span>
                </p>
                <p className="text-[10px] font-body text-text-muted">
                  {event.isRequired ? 'Required' : 'Optional'} · {event.attendees?.slice(0, 2).join(', ')}
                  {event.attendees && event.attendees.length > 2 && ` +${event.attendees.length - 2}`}
                </p>
                <p className="text-[10px] font-body text-text-tertiary mt-0.5">
                  Prep: {event.prepNotes || 'none'}
                </p>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
