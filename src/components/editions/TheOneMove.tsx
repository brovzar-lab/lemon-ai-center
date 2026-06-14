import { useMemo } from 'react'
import { useInboxStore } from '@/stores/useInboxStore'
import { useDealsStore } from '@/stores/lemon/useDealsStore'
import { useProjectsStore } from '@/stores/lemon/useProjectsStore'
import { useLemonDelegationsStore } from '@/stores/lemon/useLemonDelegationsStore'
import { useCalendarStore } from '@/stores/useCalendarStore'
import {
  detectSlippingThreads,
  detectOverdueDelegations,
  detectStallingDeals,
} from '@/lib/inbox/slipDetection'
import { Zap } from 'lucide-react'

interface OneMoveAction {
  type: 'email' | 'meeting_prep' | 'deal' | 'delegation'
  headline: string
  detail: string
  urgency: string
  threadId?: string
  dealId?: string
  meetingId?: string
}

/**
 * The One Move — the single most important action right now.
 * Full color accent. Everything else on the page recedes.
 *
 * Priority ranking:
 * 1. HOT email unanswered > 48h
 * 2. Meeting starting within 60 min (prep needed)
 * 3. Stalling deal (no activity > 7 days)
 * 4. Overdue delegation
 * 5. Any unanswered email ranked by age
 */
export function TheOneMove({ onReply }: { onReply?: (threadId: string) => void }) {
  const threads = useInboxStore((s) => s.threads)
  const deals = useDealsStore((s) => s.deals)
  const projects = useProjectsStore((s) => s.projects)
  const delegations = useLemonDelegationsStore((s) => s.delegations)
  const calendar = useCalendarStore((s) => s.events)

  const action = useMemo<OneMoveAction | null>(() => {
    const now = new Date()

    // 1. HOT emails unanswered > 48h
    const slipping = detectSlippingThreads(threads, deals, projects, now)
    const hotSlip = slipping.find((s) => s.priority === 'HOT' && s.ageHours > 48)
    if (hotSlip) {
      const days = Math.floor(hotSlip.ageHours / 24)
      return {
        type: 'email',
        headline: `Reply to ${hotSlip.from}`,
        detail: hotSlip.subject,
        urgency: `waiting ${days} day${days !== 1 ? 's' : ''}`,
        threadId: hotSlip.threadId,
      }
    }

    // 2. Meeting starting within 60 min
    const upcoming = (calendar ?? []).find((event) => {
      const start = new Date(event.start)
      const minsUntil = (start.getTime() - now.getTime()) / 60_000
      return minsUntil > 0 && minsUntil <= 60
    })
    if (upcoming) {
      const minsUntil = Math.round(
        (new Date(upcoming.start).getTime() - now.getTime()) / 60_000,
      )
      return {
        type: 'meeting_prep',
        headline: `Prep for: ${upcoming.title}`,
        detail: `${upcoming.attendees?.length ?? 0} attendees`,
        urgency: `in ${minsUntil} min`,
        meetingId: upcoming.id,
      }
    }

    // 3. Stalling deals
    const stallingDeals = detectStallingDeals(deals, now)
    if (stallingDeals.length > 0) {
      const d = stallingDeals[0]
      const days = d.updated_at
        ? Math.floor((now.getTime() - new Date(d.updated_at).getTime()) / 86_400_000)
        : null
      return {
        type: 'deal',
        headline: `Push forward: ${d.name}`,
        detail: d.counterparty ? `with ${d.counterparty}` : d.next_action || 'needs attention',
        urgency: days ? `stalled ${days}d` : 'no next action',
        dealId: d.id,
      }
    }

    // 4. Overdue delegations
    const overdue = detectOverdueDelegations(delegations, now)
    if (overdue.length > 0) {
      const d = overdue[0]
      const days = d.expected_by
        ? Math.floor((now.getTime() - new Date(d.expected_by).getTime()) / 86_400_000)
        : 0
      return {
        type: 'delegation',
        headline: `Follow up with ${d.person}`,
        detail: d.task,
        urgency: `${days}d overdue`,
      }
    }

    // 5. Any unanswered email by age
    if (slipping.length > 0) {
      const s = slipping[0]
      const days = Math.floor(s.ageHours / 24)
      return {
        type: 'email',
        headline: `Reply to ${s.from}`,
        detail: s.subject,
        urgency: days > 0 ? `${days}d waiting` : `${Math.round(s.ageHours)}h waiting`,
        threadId: s.threadId,
      }
    }

    return null
  }, [threads, deals, projects, delegations, calendar])

  if (!action) {
    return (
      <section aria-label="The one move" className="mb-6">
        <div className="border-l-2 border-accent-sage bg-bg-surface rounded-r-lg px-5 py-4">
          <p className="font-display text-lg text-text-primary">
            You're clear.
          </p>
          <p className="font-body text-[12px] text-text-muted mt-1">
            Nothing urgent is waiting on you right now. Use this time for deep work.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section aria-label="The one move" className="mb-6">
      <div className="border-l-2 border-accent-lemon bg-bg-surface rounded-r-lg px-5 py-4">
        <div className="flex items-start gap-3">
          <Zap size={16} className="text-accent-lemon mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="ed-section-label mb-1">The One Move</p>
            <h2 className="font-display text-xl font-semibold text-text-primary leading-snug">
              {action.headline}
            </h2>
            <p className="font-body text-[13px] text-text-secondary mt-1 truncate">
              {action.detail}
            </p>
            <div className="flex items-center gap-3 mt-3">
              <span className="text-[10px] font-body font-bold uppercase tracking-[0.15em] text-accent-coral">
                {action.urgency}
              </span>
              {action.type === 'email' && action.threadId && onReply && (
                <button
                  type="button"
                  onClick={() => onReply(action.threadId!)}
                  className="text-[11px] font-body font-semibold uppercase tracking-[0.12em] text-accent-lemon hover:underline"
                >
                  Draft reply →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
