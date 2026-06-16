import { useMemo } from 'react'
import { useInboxStore } from '@/stores/useInboxStore'
import { useDealsStore } from '@/stores/lemon/useDealsStore'
import { useProjectsStore } from '@/stores/lemon/useProjectsStore'
import { detectSlippingThreads } from '@/lib/inbox/slipDetection'
import { Clock } from 'lucide-react'

/**
 * UnansweredList — emails awaiting YOUR reply, ranked by wait time.
 *
 * Receded styling: text-text-muted until hovered, then text-text-primary.
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
        <Clock size={12} className="text-text-muted" />
        <span>Awaiting Your Reply</span>
        <span className="ml-auto text-[10px] font-body text-text-muted normal-case tracking-normal">
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
              className="group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-bg-elevated/50 transition-colors"
            >
              {/* Urgency dot */}
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  isHot ? 'bg-accent-coral' : 'bg-text-muted/40'
                }`}
              />

              {/* From */}
              <span className="font-body text-[12px] text-text-muted group-hover:text-text-primary transition-colors w-28 truncate flex-shrink-0">
                {slip.from}
              </span>

              {/* Subject */}
              <span className="font-body text-[11px] text-text-muted group-hover:text-text-secondary transition-colors truncate flex-1 min-w-0">
                {slip.subject}
              </span>

              {/* Wait time */}
              <span
                className={`text-[10px] font-body font-bold uppercase tracking-[0.1em] flex-shrink-0 ${
                  isHot ? 'text-accent-coral' : 'text-text-muted'
                }`}
              >
                {urgencyLabel}
              </span>

              {/* Draft reply button — appears on hover */}
              {onReply && (
                <button
                  type="button"
                  onClick={() => onReply(slip.threadId)}
                  className="opacity-0 group-hover:opacity-100 text-[10px] font-body font-semibold uppercase tracking-[0.1em] text-accent-lemon hover:underline transition-opacity flex-shrink-0"
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
