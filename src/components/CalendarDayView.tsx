import { useCalendarStore } from '@/stores/useCalendarStore'
import { useUIStore } from '@/stores/useUIStore'
import { ArrowRight } from 'lucide-react'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function isPast(iso: string): boolean {
  return new Date(iso) < new Date()
}

function isNext(events: { start: string; end: string }[], idx: number): boolean {
  // The first event whose end time is in the future
  return !isPast(events[idx].end) && (idx === 0 || isPast(events[idx - 1].end))
}

function getDuration(start: string, end: string): string {
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function CalendarDayView() {
  const events = useCalendarStore((s) => s.events)
  const loading = useCalendarStore((s) => s.loading)
  const openModal = useUIStore((s) => s.openModal)
  const setActiveContext = useUIStore((s) => s.setActiveContext)

  const required = events.filter((e) => e.isRequired)

  return (
    <section className="mt-6" aria-label="Today's calendar">
      {/* Section label */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-sans font-bold uppercase tracking-[0.2em] text-ink-3">
          Today's Calendar
        </p>
        {required.length > 0 && (
          <span className="text-[11px] font-sans font-bold uppercase tracking-[0.2em] text-data-coral flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-data-coral inline-block" aria-hidden="true" />
            {required.length} required
          </span>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && events.length === 0 ? (
        <div className="space-y-3 mt-4" aria-busy="true" aria-label="Loading calendar events">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="skeleton w-14 h-4 flex-shrink-0" />
              <div className="flex-1">
                <div className="skeleton skeleton-line w-3/4" />
                <div className="skeleton skeleton-line skeleton-line-short" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-[12px] font-sans text-ink-3 italic mt-3">No meetings scheduled today.</p>
      ) : (
        <div className="mt-4" role="list" aria-label="Today's meetings">
          {events.map((event, idx) => {
            const past = isPast(event.end)
            const next = isNext(events, idx)

            return (
              <button
                key={event.id}
                type="button"
                onClick={() => {
                  setActiveContext({ kind: 'meeting', id: event.id })
                  openModal('meeting-prep')
                }}
                className={`w-full text-left flex gap-3 py-3 group transition-colors relative ${
                  past ? 'opacity-40' : ''
                } ${next ? 'bg-sunken/50 -mx-3 px-3 rounded-lg border border-accent/20' : ''}`}
                role="listitem"
                aria-label={`${formatTime(event.start)} — ${event.title}${event.isRequired ? ' (required)' : ''}${next ? ' (next)' : ''}`}
              >
                {/* Timeline spine */}
                <div className="flex flex-col items-center flex-shrink-0 w-14">
                  <span className={`text-[13px] font-sans font-semibold tabular-nums ${
                    next ? 'text-accent' : 'text-ink'
                  }`}>
                    {formatTime(event.start)}
                  </span>
                  <span className="text-[11px] font-sans text-ink-3">
                    {getDuration(event.start, event.end)}
                  </span>
                </div>

                {/* Dot + line */}
                <div className="flex flex-col items-center flex-shrink-0 pt-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    next ? 'bg-accent ring-2 ring-accent/20' :
                    event.isRequired ? 'bg-data-coral' :
                    past ? 'bg-ink-3/30' : 'bg-ink-3/60'
                  }`} aria-hidden="true" />
                  {idx < events.length - 1 && (
                    <div className="w-px flex-1 min-h-[16px] bg-line mt-1" aria-hidden="true" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pb-1">
                  <p className={`text-[14px] font-sans font-medium leading-snug ${
                    next ? 'text-ink' : 'text-ink'
                  }`}>
                    {event.title}
                    {next && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-accent">
                        Next
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] font-sans text-ink-3 mt-0.5">
                    {event.isRequired ? 'Required' : 'Optional'}
                    {event.meetLink && ' · Video'}
                    {event.attendees && event.attendees.length > 0 && (
                      <> · {event.attendees.slice(0, 3).join(', ')}
                        {event.attendees.length > 3 && ` +${event.attendees.length - 3}`}
                      </>
                    )}
                  </p>
                  {event.prepNotes && (
                    <p className="text-[11px] font-sans text-ink-3 mt-0.5 italic">
                      {event.prepNotes}
                    </p>
                  )}
                </div>

                {/* Hover arrow */}
                <span className="text-ink-3 ml-1 group-hover:text-data-coral transition-colors inline-flex items-center" aria-hidden="true"><ArrowRight size={12} /></span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
