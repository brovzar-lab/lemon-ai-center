import { useBriefStore } from '@/stores/useBriefStore'
import { useInboxStore } from '@/stores/useInboxStore'
import { useCalendarStore } from '@/stores/useCalendarStore'
import { useTaskStore } from '@/stores/useTaskStore'

export function ExecutiveSummary() {
  const longBrief = useBriefStore((s) => s.longBrief)
  const billy = useBriefStore((s) => s.billy)
  const isStreaming = useBriefStore((s) => s.isStreaming)
  const threads = useInboxStore((s) => s.threads)
  const events = useCalendarStore((s) => s.events)
  const tasks = useTaskStore((s) => s.tasks)

  const hotCount = threads.filter((t) => t.priority === 'HOT').length
  const requiredMeetings = events.filter((e) => e.isRequired).length
  const openTasks = tasks.filter((t) => !t.done).length

  // Use the AI-generated long brief as the executive summary,
  // or fall back to the billy text
  const summary = longBrief || billy

  return (
    <section className="mb-6" aria-label="Executive summary">
      {/* Section label */}
      <div className="ed-section-label mb-3">State of Affairs</div>

      {/* Quick pulse badges */}
      <div className="flex items-center gap-3 mb-4">
        {hotCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-sans font-bold uppercase tracking-[0.15em] text-data-coral">
            <span className="w-1.5 h-1.5 rounded-full bg-data-coral" aria-hidden="true" />
            {hotCount} urgent
          </span>
        )}
        <span className="text-[10px] font-sans font-bold uppercase tracking-[0.15em] text-ink-3">
          {threads.length} emails
        </span>
        <span className="text-[10px] font-sans font-bold uppercase tracking-[0.15em] text-ink-3">
          {events.length} meetings{requiredMeetings > 0 && ` (${requiredMeetings} required)`}
        </span>
        {openTasks > 0 && (
          <span className="text-[10px] font-sans font-bold uppercase tracking-[0.15em] text-ink-3">
            {openTasks} open tasks
          </span>
        )}
      </div>

      {/* Executive summary paragraph */}
      {summary ? (
        <div
          className="font-display text-[16px] sm:text-[17px] leading-[1.75] text-ink whitespace-pre-line"
          style={{ opacity: isStreaming ? 0.7 : 1, transition: 'opacity 200ms' }}
        >
          {summary}
        </div>
      ) : isStreaming ? (
        <div className="space-y-2.5">
          <div className="skeleton skeleton-line w-full" />
          <div className="skeleton skeleton-line w-[90%]" />
          <div className="skeleton skeleton-line w-[95%]" />
          <div className="skeleton skeleton-line w-[80%]" />
          <div className="skeleton skeleton-line w-[85%]" />
        </div>
      ) : (
        <p className="font-display text-[15px] text-ink-3 italic">
          Your executive briefing is being prepared…
        </p>
      )}

      <hr className="ed-rule mt-5" />
    </section>
  )
}
