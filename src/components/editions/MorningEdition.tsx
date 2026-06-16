import { AdvisorCard } from '@/components/spine/AdvisorCard'
import { ApprovalsStrip } from '@/components/spine/ApprovalsStrip'
import { FrontBands } from '@/components/spine/FrontBands'
import { CalendarDayView } from '@/components/CalendarDayView'
import { AudioPlayer } from '@/components/AudioPlayer'
import { TheOneMove } from './TheOneMove'
import { InboxDigest } from './InboxDigest'
import { UnansweredList } from './UnansweredList'
import { WaitingOnList } from './WaitingOnList'
import type { InboxThread } from '@shared/types'

/**
 * Morning Edition (5 AM – 12 PM)
 *
 * Goal: In 90 seconds, know exactly what to do first.
 * Inbox-heavy — "peace in the morning if I know what my inbox is telling me."
 *
 * Layout:
 *   Advisor Note — what you're avoiding (headline)
 *   The One Move — AI-picked single action (full color)
 *   Inbox Digest — your inbox at a glance (peace of mind)
 *   Unanswered List — emails awaiting your reply
 *   Today's Calendar — compact
 *   Five Fronts — ranked priority domains
 *   Waiting On — overdue from others
 *   Approvals — pending AI-proposed actions
 *   Audio Briefing — listen while getting ready
 */
export function MorningEdition({
  onReply,
}: {
  onReply?: (thread: InboxThread) => void
}) {
  const handleReplyById = (threadId: string) => {
    if (onReply) {
      // Pass a minimal thread object — the ReplyModal just needs the ID
      onReply({ id: threadId, subject: '', from: '', fromDomain: '', snippet: '', unread: true, receivedAt: '', tag: 'NONE', priority: 'MED' })
    }
  }

  return (
    <div className="animate-in">
      {/* The Advisor speaks first */}
      <AdvisorCard />

      {/* The One Move — the only colored element */}
      <TheOneMove onReply={handleReplyById} />

      <hr className="ed-rule my-4" />

      {/* Inbox Digest — peace of mind */}
      <InboxDigest />

      {/* Unanswered emails */}
      <UnansweredList max={7} onReply={handleReplyById} />

      <hr className="ed-rule my-4" />

      {/* Today's calendar — compact */}
      <CalendarDayView />

      <hr className="ed-rule my-4" />

      {/* Five Fronts — priority domains ranked */}
      <FrontBands />

      {/* Waiting On — overdue from others */}
      <WaitingOnList max={5} />

      {/* Pending approvals (only renders if there are any) */}
      <ApprovalsStrip />

      {/* Audio briefing */}
      <div className="mt-4">
        <AudioPlayer />
      </div>
    </div>
  )
}
