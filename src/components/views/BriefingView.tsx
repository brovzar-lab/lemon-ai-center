import { useInboxStore } from '@/stores/useInboxStore'
import type { InboxThread } from '@shared/types'
import { BriefPanel } from '../BriefPanel'
import { TasksPanel } from '../TasksPanel'
import { BrainPanel } from '../BrainPanel'
import { MorningOverview } from '../MorningOverview'
import { OneThingCard } from '../OneThingCard'
import { CalendarDayView } from '../CalendarDayView'
import { InboxSummary } from '../InboxSummary'
import { WrapupCard } from '../WrapupCard'
import { AudioPlayer } from '../AudioPlayer'
import { ExecutiveSummary } from '../ExecutiveSummary'
import { PriorityStack } from '../PriorityStack'
import { RelationshipPanel } from '../RelationshipPanel'
import { WaitingOnPanel } from '../WaitingOnPanel'
import { DelegationQueue } from '../DelegationQueue'
import { CollapsibleSection } from '../CollapsibleSection'
import { AdvisorCard } from '../spine/AdvisorCard'
import { FrontBands } from '../spine/FrontBands'
import { ApprovalsStrip } from '../spine/ApprovalsStrip'
import { EngineStatus } from '../spine/EngineStatus'
import { EveningWrapCard } from '../spine/EveningWrapCard'
import type { WaitingOnItem } from '../WaitingOnPanel'
import type { DelegationExtracted } from '../DelegationQueue'
import { TheOneMove } from '../editions/TheOneMove'
import { InboxDigest } from '../editions/InboxDigest'
import { UnansweredList } from '../editions/UnansweredList'

interface BriefingViewProps {
  eveningMode: boolean
  showWrapup: boolean
  waitingOnItems: WaitingOnItem[]
  delegationQueueItems: DelegationExtracted[]
  onReply: (thread: InboxThread) => void
  onCreateTask: (thread: InboxThread) => void
}

export function BriefingView({
  eveningMode,
  showWrapup,
  waitingOnItems,
  delegationQueueItems,
  onReply,
  onCreateTask,
}: BriefingViewProps) {
  return (
    /* ══ REBALANCED LAYOUT: Sidebar (1fr) + Wide Center (2fr) ══ */
    <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-6 lg:gap-8 mt-2">

      {/* ── LEFT SIDEBAR: Briefing ── */}
      <section aria-label="Intelligence briefing" className="flex flex-col gap-0 animate-in">
        <CollapsibleSection
          id="morning-overview"
          title="Today's Intelligence"
          autoCollapseOutside={{ start: 5, end: 12 }}
        >
          <MorningOverview />
        </CollapsibleSection>
        <AudioPlayer />
        <CollapsibleSection id="brain" title="Brain" defaultOpen={false}>
          <BrainPanel />
        </CollapsibleSection>
        <CollapsibleSection id="full-brief" title="Full Brief" defaultOpen={false}>
          <BriefPanel />
        </CollapsibleSection>
      </section>

      {/* ── CENTER (Wide): The Spine — Advisor first, fronts ranked, then today ── */}
      <section aria-label="Command center" className="flex flex-col gap-0 animate-in animate-in-delay-1">
        {/* Engine heartbeats + failure banners — never silent staleness */}
        <EngineStatus />

        {/* ▸ AI INTELLIGENCE: The One Move — what needs you RIGHT NOW */}
        <TheOneMove onReply={(threadId) => {
          const t = useInboxStore.getState().threads.find((t) => t.id === threadId)
          if (t) onReply(t)
        }} />

        {/* The Advisor speaks first */}
        <AdvisorCard />

        {/* Outward actions awaiting one-tap approval */}
        <ApprovalsStrip />

        {/* The five fronts, ranked by what needs Billy today */}
        <FrontBands />

        {/* Evening mode: the wrap surfaces after 18:00 */}
        {eveningMode && <EveningWrapCard />}

        {/* HERO: The One Thing — always visible */}
        <OneThingCard data-focus-keep="true" />

        {/* Priority + Calendar side by side on desktop, stacked on tablet */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          <div>
            <PriorityStack />
            <RelationshipPanel />
          </div>
          <div>
            <CalendarDayView />
          </div>
        </div>

        <hr className="ed-rule my-4" />

        {/* Executive Summary */}
        <CollapsibleSection id="exec-summary" title="Executive Summary">
          <ExecutiveSummary />
        </CollapsibleSection>

        <hr className="ed-rule my-2" />

        {/* ▸ AI INTELLIGENCE: Inbox Digest — peace of mind at a glance */}
        <InboxDigest />

        {/* ▸ AI INTELLIGENCE: Emails awaiting YOUR reply */}
        <UnansweredList max={7} onReply={(threadId) => {
          const t = useInboxStore.getState().threads.find((t) => t.id === threadId)
          if (t) onReply(t)
        }} />

        {/* Inbox — smart grouped */}
        <InboxSummary onReply={onReply} onCreateTask={onCreateTask} />

        {/* Tasks — collapsible buckets */}
        <CollapsibleSection id="tasks" title="Tasks">
          <TasksPanel />
        </CollapsibleSection>

        {/* Waiting On + Delegations — live from the delegation tracker */}
        <WaitingOnPanel items={waitingOnItems} />
        <DelegationQueue delegations={delegationQueueItems} />

        {/* Wrapup — only visible after 4pm */}
        {showWrapup && (
          <CollapsibleSection
            id="wrapup"
            title="End of Day"
            autoCollapseOutside={{ start: 16, end: 23 }}
          >
            <WrapupCard />
          </CollapsibleSection>
        )}
      </section>
    </div>
  )
}
