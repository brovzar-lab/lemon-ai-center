import { useUIStore } from '@/stores/useUIStore'
import { useCalendarStore } from '@/stores/useCalendarStore'
import { X, ArrowRight } from 'lucide-react'

export function MeetingPrepModal() {
  const { activeModal, closeModal } = useUIStore()
  const events = useCalendarStore((s) => s.events)

  if (activeModal !== 'meeting-prep') return null

  const required = events.filter((e) => e.isRequired)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close meeting prep modal"
        className="absolute inset-0 bg-black/60 cursor-default"
        onClick={closeModal}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-prep-title"
        className="relative w-full max-w-lg bg-sunken border border-line rounded-2xl p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="meeting-prep-title" className="font-display text-lg text-ink">
            Today's Required Meetings
          </h2>
          <button
            type="button"
            aria-label="Close"
            autoFocus
            onClick={closeModal}
            className="text-ink-3 hover:text-ink-2 transition-colors text-xl leading-none"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          {required.map((meeting) => (
            <div key={meeting.id} className="p-4 bg-surface rounded-lg border border-line">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-sans font-medium text-ink">{meeting.title}</p>
                  <p className="text-xs text-ink-3 mt-1 font-sans">
                    {new Date(meeting.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} –{' '}
                    {new Date(meeting.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                  {meeting.attendees.length > 0 && (
                    <p className="text-xs text-ink-3 mt-1 font-sans">{meeting.attendees.join(', ')}</p>
                  )}
                </div>
                {meeting.meetLink && (
                  <a
                    href={meeting.meetLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-sans text-data-blue hover:opacity-80 transition-opacity ml-4 shrink-0 inline-flex items-center gap-1"
                  >
                    Join <ArrowRight size={12} />
                  </a>
                )}
              </div>
              {meeting.description && (
                <p className="text-xs text-ink-3 mt-2 font-sans leading-relaxed">{meeting.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
