import { useInboxStore } from '@/stores/useInboxStore'
import { EveningWrapCard } from '@/components/spine/EveningWrapCard'
import { useMissionStore } from '@/stores/useMissionStore'
import { Moon, ArrowRight } from 'lucide-react'

/**
 * Evening Edition (5 PM – 5 AM)
 *
 * Goal: AI tells you what changed today. You know tomorrow's top move.
 *
 * Layout:
 *   AI Summary — "Here's what changed today" (from evening_wrap engine job)
 *   Tomorrow's One Move
 *   Unanswered count (just the number, not details)
 */
export function EveningEdition() {
  const threads = useInboxStore((s) => s.threads)
  const advisorNote = useMissionStore((s) => s.advisorNote)

  const unreadCount = threads.filter((t) => t.unread).length
  const hotCount = threads.filter((t) => t.priority === 'HOT').length

  return (
    <div className="animate-in">
      {/* Evening Wrap — the AI's day summary */}
      <EveningWrapCard />

      <hr className="ed-rule my-5" />

      {/* Tomorrow's Focus — from the Advisor */}
      {advisorNote && (
        <section aria-label="Tomorrow's focus" className="mb-5">
          <div className="ed-section-label mb-2 flex items-center gap-2">
            <ArrowRight size={12} className="text-text-muted" />
            <span>Tomorrow's Focus</span>
          </div>
          <div className="px-4 py-3 rounded-lg bg-bg-surface border border-border-soft">
            <p className="font-display text-[14px] text-text-primary font-semibold leading-snug mb-1">
              {advisorNote.headline}
            </p>
            <p className="font-body text-[13px] text-text-secondary leading-relaxed italic">
              "{advisorNote.body}"
            </p>
            <p className="font-body text-[10px] text-text-muted mt-2 uppercase tracking-[0.12em]">
              Your advisor's note will refresh at 5:30 AM
            </p>
          </div>
        </section>
      )}

      <hr className="ed-rule my-5" />

      {/* Inbox status — just the numbers, no details */}
      <section aria-label="Inbox status" className="mb-5">
        <div className="ed-section-label mb-2 flex items-center gap-2">
          <Moon size={12} className="text-text-muted" />
          <span>Inbox Status</span>
        </div>
        <div className="flex items-center gap-6 px-4 py-3 rounded-lg bg-bg-surface border border-border-soft">
          <div>
            <span className="font-display text-2xl font-semibold text-text-primary leading-none">
              {unreadCount}
            </span>
            <p className="text-[10px] font-body font-bold uppercase tracking-[0.15em] text-text-muted mt-1">
              Unread
            </p>
          </div>
          {hotCount > 0 && (
            <div>
              <span className="font-display text-2xl font-semibold text-accent-coral leading-none">
                {hotCount}
              </span>
              <p className="text-[10px] font-body font-bold uppercase tracking-[0.15em] text-text-muted mt-1">
                Hot
              </p>
            </div>
          )}
          <p className="font-body text-[11px] text-text-muted ml-auto">
            {unreadCount === 0
              ? 'Clear — rest well.'
              : hotCount > 0
                ? 'These can wait until morning.'
                : 'Nothing urgent — morning will handle it.'}
          </p>
        </div>
      </section>
    </div>
  )
}
