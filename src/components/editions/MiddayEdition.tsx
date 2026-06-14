import { useMemo } from 'react'
import { useInboxStore } from '@/stores/useInboxStore'
import { useDealsStore } from '@/stores/lemon/useDealsStore'
import { useCalendarStore } from '@/stores/useCalendarStore'
import { TheOneMove } from './TheOneMove'
import { CalendarDayView } from '@/components/CalendarDayView'
import { ApprovalsStrip } from '@/components/spine/ApprovalsStrip'
import { ArrowRight, TrendingUp, Inbox } from 'lucide-react'
import type { InboxThread } from '@shared/types'

/**
 * Midday Edition (12 PM – 5 PM)
 *
 * Goal: Triage what came in, check momentum.
 *
 * Layout:
 *   The One Move (refreshed)
 *   "Since This Morning" — new emails needing triage
 *   Coming Up — next 2-3 hours of calendar
 *   Deal Movement — brief status changes
 *   Approvals
 */
export function MiddayEdition({
  onReply,
}: {
  onReply?: (thread: InboxThread) => void
}) {
  const threads = useInboxStore((s) => s.threads)
  const deals = useDealsStore((s) => s.deals)
  const events = useCalendarStore((s) => s.events)

  const handleReplyById = (threadId: string) => {
    if (onReply) {
      onReply({ id: threadId, subject: '', from: '', fromDomain: '', snippet: '', unread: true, receivedAt: '', tag: 'NONE', priority: 'MED' })
    }
  }

  // Emails received in the last 6 hours (roughly "since morning")
  const recentEmails = useMemo(() => {
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000
    return threads
      .filter((t) => new Date(t.receivedAt).getTime() > sixHoursAgo)
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
      .slice(0, 8)
  }, [threads])

  // Upcoming events in next 3 hours
  const upcomingEvents = useMemo(() => {
    const now = Date.now()
    const threeHours = now + 3 * 60 * 60 * 1000
    return (events ?? []).filter((e) => {
      const start = new Date(e.start).getTime()
      return start > now && start < threeHours
    })
  }, [events])

  // Active deals for status check
  const activeDeals = useMemo(
    () => deals.filter((d) => d.status !== 'closed').slice(0, 5),
    [deals],
  )

  return (
    <div className="animate-in">
      {/* The One Move — refreshed for midday */}
      <TheOneMove onReply={handleReplyById} />

      <hr className="ed-rule my-4" />

      {/* Since This Morning */}
      {recentEmails.length > 0 && (
        <section aria-label="Recent emails" className="mb-5">
          <div className="ed-section-label mb-2 flex items-center gap-2">
            <Inbox size={12} className="text-text-muted" />
            <span>Since This Morning</span>
            <span className="ml-auto text-[10px] font-body text-text-muted normal-case tracking-normal">
              {recentEmails.length} new
            </span>
          </div>

          <ul className="space-y-0.5">
            {recentEmails.map((thread) => (
              <li
                key={thread.id}
                className="group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-bg-elevated/50 transition-colors"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    thread.priority === 'HOT'
                      ? 'bg-accent-coral'
                      : thread.priority === 'MED'
                        ? 'bg-accent-lemon'
                        : 'bg-text-muted/40'
                  }`}
                />
                <span className="font-body text-[12px] text-text-muted group-hover:text-text-primary transition-colors w-28 truncate flex-shrink-0">
                  {thread.from}
                </span>
                <span className="font-body text-[11px] text-text-muted group-hover:text-text-secondary transition-colors truncate flex-1 min-w-0">
                  {thread.subject}
                </span>
                <span className="text-[10px] font-body font-bold uppercase tracking-[0.1em] text-text-muted flex-shrink-0">
                  {thread.tag === 'DEAL' ? 'deal' : thread.tag === 'INT' ? 'internal' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Coming Up */}
      {upcomingEvents.length > 0 && (
        <>
          <hr className="ed-rule my-4" />
          <section aria-label="Coming up" className="mb-5">
            <p className="ed-section-label mb-2">Coming Up</p>
            <CalendarDayView />
          </section>
        </>
      )}

      <hr className="ed-rule my-4" />

      {/* Deal Movement */}
      {activeDeals.length > 0 && (
        <section aria-label="Deal status" className="mb-5">
          <div className="ed-section-label mb-2 flex items-center gap-2">
            <TrendingUp size={12} className="text-text-muted" />
            <span>Deal Pulse</span>
          </div>

          <ul className="space-y-0.5">
            {activeDeals.map((deal) => {
              const daysSinceUpdate = deal.updated_at
                ? Math.floor((Date.now() - new Date(deal.updated_at).getTime()) / 86_400_000)
                : null
              const isStale = daysSinceUpdate !== null && daysSinceUpdate > 7

              return (
                <li
                  key={deal.id}
                  className="group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-bg-elevated/50 transition-colors"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      isStale ? 'bg-accent-coral' : 'bg-text-muted/40'
                    }`}
                  />
                  <span className="font-body text-[12px] text-text-muted group-hover:text-text-primary transition-colors truncate flex-1">
                    {deal.name}
                    {deal.counterparty && (
                      <span className="text-text-muted"> · {deal.counterparty}</span>
                    )}
                  </span>
                  <span className="text-[10px] font-body font-bold uppercase tracking-[0.1em] text-text-muted flex-shrink-0">
                    {deal.status}
                  </span>
                  {daysSinceUpdate !== null && (
                    <span
                      className={`text-[10px] font-body flex-shrink-0 ${
                        isStale ? 'text-accent-coral font-bold' : 'text-text-muted'
                      }`}
                    >
                      {daysSinceUpdate}d
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Approvals */}
      <ApprovalsStrip />
    </div>
  )
}
