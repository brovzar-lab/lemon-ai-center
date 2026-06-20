import { useMemo } from 'react'
import { useInboxStore } from '@/stores/useInboxStore'
import { useDealsStore } from '@/stores/lemon/useDealsStore'
import { useProjectsStore } from '@/stores/lemon/useProjectsStore'
import { detectSlippingThreads } from '@/lib/inbox/slipDetection'
import { Clock } from 'lucide-react'

/**
 * UnansweredList — emails awaiting YOUR reply, ranked by wait time.
 *
 * Receded styling: text-ink-3 until hovered, then text-ink.
 * The "Editor's Page" principle: color is scarce. This list is slate
 * until you focus on it.
 */
export function UnansweredList({
  max = 5,
  onReply,
}: {
  max?: number
  onReply?: (threadId: string) => void
}) {
  const threads = useInboxStore((s) => s.threads)
  const deals = useDealsStore((s) => s.deals)
  const projects = useProjectsStore((s) => s.projects)

  const unanswered = useMemo(() => {
    return detectSlippingThreads(threads, deals, projects).slice(0, max)
  }, [threads, deals, projects, max])

  if (unanswered.length === 0) return null

  return (
    <section aria-label="Unanswered emails" className="mb-5">
      <div className="ed-section-label mb-2 flex items-center gap-2">
        <Clock size={12} className="text-ink-3" />
        <span>Awaiting Your Reply</span>
        <span className="ml-auto text-[10px] font-sans text-ink-3 normal-case tracking-normal">
          {unanswered.length} thread{unanswered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <ul className="space-y-0.5">
        {unanswered.map((slip) => {
          const days = Math.floor(slip.ageHours / 24)
          const urgencyLabel = days > 0 ? `${days}d` : `${Math.round(slip.ageHours)}h`
          const isHot = slip.priority === 'HOT' && days >= 2

          return (
            <li
              key={slip.threadId}
              className="group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-sunken/50 transition-colors"
            >
              {/* Urgency dot */}
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  isHot ? 'bg-data-coral' : 'bg-ink-3/40'
                }`}
              />

              {/* From */}
              <span className="font-sans text-[12px] text-ink-3 group-hover:text-ink transition-colors w-28 truncate flex-shrink-0">
                {slip.from}
              </span>

              {/* Subject */}
              <span className="font-sans text-[11px] text-ink-3 group-hover:text-ink-2 transition-colors truncate flex-1 min-w-0">
                {slip.subject}
              </span>

              {/* Wait time */}
              <span
                className={`text-[10px] font-sans font-bold uppercase tracking-[0.1em] flex-shrink-0 ${
                  isHot ? 'text-data-coral' : 'text-ink-3'
                }`}
              >
                {urgencyLabel}
              </span>

              {/* Draft reply button — appears on hover */}
              {onReply && (
                <button
                  type="button"
                  onClick={() => onReply(slip.threadId)}
                  className="opacity-0 group-hover:opacity-100 text-[10px] font-sans font-semibold uppercase tracking-[0.1em] text-accent hover:underline transition-opacity flex-shrink-0"
                >
                  Reply
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
