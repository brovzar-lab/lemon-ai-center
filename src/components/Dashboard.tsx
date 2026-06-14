import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/useAuthStore'
import { useInboxStore } from '@/stores/useInboxStore'
import { useCalendarStore } from '@/stores/useCalendarStore'
import { useBrainStore } from '@/stores/useBrainStore'
import { useSparkStore } from '@/stores/useSparkStore'
import { useBriefStore } from '@/stores/useBriefStore'
import { useTaskStore } from '@/stores/useTaskStore'
import { useDecisionStore } from '@/stores/useDecisionStore'
import { useFocusModeStore } from '@/stores/useFocusModeStore'
import { useCaptureStore } from '@/stores/useCaptureStore'
import { useActionLogStore } from '@/stores/useActionLogStore'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { usePollingEngine } from '@/hooks/usePollingEngine'
import { useViewStore } from '@/stores/useViewStore'
import { WorkspaceTabs } from './workspace/WorkspaceTabs'
import { DealsView } from './views/DealsView'
import { ProjectsView } from './views/ProjectsView'
import { MemoryView } from './views/MemoryView'
import { ArchiveView } from './views/ArchiveView'
import { InboxIntelView } from './views/InboxIntelView'
import type { Bucket } from '@shared/types'
import { loadVoiceProfile, DEFAULT_VOICE_PROFILE } from '@/lib/voiceProfile'
import type { VoiceProfile } from '@/lib/voiceProfile'
import type { InboxThread } from '@shared/types'
import { Header } from './Header'
import { DemoBanner } from './DemoBanner'
import { BriefPanel } from './BriefPanel'
import { NextUpBar } from './NextUpBar'
import { TasksPanel } from './TasksPanel'
import { InboxPanel } from './InboxPanel'
import { BrainPanel } from './BrainPanel'
import { SparkCard } from './SparkCard'
import { DecisionJournal } from './DecisionJournal'
import { SkillLauncher } from './SkillLauncher'
import { BillyDrawer } from './BillyDrawer'
import { MeetingPrepModal } from './MeetingPrepModal'
import { SkillModal } from './SkillModal'
import ReplyModal from './ReplyModal'
import SettingsModal from './SettingsModal'
// Editorial redesign components
import { FocusModeProvider } from './FocusModeProvider'
import { EditorialMasthead } from './EditorialMasthead'
import { MorningOverview } from './MorningOverview'
import { OneThingCard } from './OneThingCard'
import { CalendarDayView } from './CalendarDayView'
import { InboxSummary } from './InboxSummary'
import { WrapupCard } from './WrapupCard'
import { AudioPlayer } from './AudioPlayer'
import { GlobalCapture } from './GlobalCapture'
import { AILogDrawer } from './AILogDrawer'
import { RoughMorningPanel } from './RoughMorningPanel'
import { ExecutiveSummary } from './ExecutiveSummary'
import { CorrectionInput } from './CorrectionInput'
import { PriorityStack } from './PriorityStack'
import { RelationshipPanel } from './RelationshipPanel'
import { WaitingOnPanel } from './WaitingOnPanel'
import { DelegationQueue } from './DelegationQueue'
import { CollapsibleSection } from './CollapsibleSection'
import { useDealsStore } from '@/stores/lemon/useDealsStore'
import { useTodayStore } from '@/stores/useTodayStore'
import { useProjectsStore } from '@/stores/lemon/useProjectsStore'
import { useLemonDelegationsStore } from '@/stores/lemon/useLemonDelegationsStore'
// Mission Control (Spine + trackers)
import { useTrackersStore } from '@/stores/useTrackersStore'
import { useMissionStore } from '@/stores/useMissionStore'
import { AdvisorCard } from './spine/AdvisorCard'
import { FrontBands } from './spine/FrontBands'
import { ApprovalsStrip } from './spine/ApprovalsStrip'
import { EngineStatus } from './spine/EngineStatus'
import { EveningWrapCard } from './spine/EveningWrapCard'
import { FundView } from './views/FundView'
import { WritingView } from './views/WritingView'
import { YouView } from './views/YouView'
import type { WaitingOnItem } from './WaitingOnPanel'
import type { DelegationExtracted } from './DelegationQueue'
// AI Intelligence layer — new components that add power
import { TheOneMove } from './editions/TheOneMove'
import { InboxDigest } from './editions/InboxDigest'
import { UnansweredList } from './editions/UnansweredList'

export function Dashboard() {
  const { user, isAuthenticated } = useAuthStore()
  usePollingEngine()
  const { refresh: refreshBrief } = useBriefStore()
  const fetchInbox = useInboxStore((s) => s.fetch)
  const fetchCalendar = useCalendarStore((s) => s.fetch)
  const fetchBrainStatus = useBrainStore((s) => s.fetchStatus)
  const fetchBrainRecent = useBrainStore((s) => s.fetchRecent)
  const fetchSpark = useSparkStore((s) => s.fetch)
  const subscribeToTasks = useTaskStore((s) => s.subscribe)
  const subscribeToDecisions = useDecisionStore((s) => s.subscribe)
  const subscribeToCaptures = useCaptureStore((s) => s.subscribe)
  const subscribeToActions = useActionLogStore((s) => s.subscribe)
  const focusActive = useFocusModeStore((s) => s.active)
  const { newDashboard, opsViews } = useFeatureFlags()
  const view = useViewStore((s) => s.view)
  const subscribeDeals = useDealsStore((s) => s.subscribe)
  const subscribeProjects = useProjectsStore((s) => s.subscribe)
  const subscribeLemonDelegations = useLemonDelegationsStore((s) => s.subscribe)
  const subscribeTrackers = useTrackersStore((s) => s.subscribe)
  const subscribeMission = useMissionStore((s) => s.subscribe)
  const lemonDelegations = useLemonDelegationsStore((s) => s.delegations)
  const fetchToday = useTodayStore((s) => s.fetchToday)
  const fetchProgress = useTodayStore((s) => s.fetchProgress)

  // Voice profile state
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>(DEFAULT_VOICE_PROFILE)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [replyEmail, setReplyEmail] = useState<{ threadId: string; from: string; fromEmail: string; subject: string; snippet: string } | null>(null)

  // Time-based visibility
  const hour = new Date().getHours()
  const showWrapup = hour >= 16 // Show wrapup after 4pm
  const eveningMode = hour >= 18

  // Wire the once-dead panels with real delegation data:
  // Waiting On = pending without a due date (aging since created)
  // To Delegate queue = pending with a due date (urgency by proximity)
  const pendingDelegations = lemonDelegations.filter((d) => d.status === 'pending')
  const waitingOnItems: WaitingOnItem[] = pendingDelegations
    .filter((d) => !d.expected_by)
    .map((d) => ({
      person: d.person,
      subject: d.task,
      daysWaiting: d.created_at
        ? Math.max(0, Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86_400_000))
        : 0,
      threadId: d.email_ref ?? d.id,
    }))
  const delegationQueueItems: DelegationExtracted[] = pendingDelegations
    .filter((d) => d.expected_by)
    .map((d) => {
      const daysOut = Math.floor(
        (new Date(d.expected_by!).getTime() - Date.now()) / 86_400_000,
      )
      return {
        person: d.person,
        role: '',
        task: d.task,
        source: d.source === 'auto' ? 'inbox scan' : 'manual',
        emailRef: d.email_ref ?? '',
        expectedBy: d.expected_by ?? null,
        urgency: daysOut < 0 ? 'high' : daysOut <= 3 ? 'medium' : 'low',
      }
    })

  useEffect(() => {
    if (!isAuthenticated || !user) return

    const unsubTasks = subscribeToTasks(user.uid)
    const unsubDecisions = subscribeToDecisions(user.uid)
    const unsubCaptures = subscribeToCaptures(user.uid)
    const unsubActions = subscribeToActions(user.uid)
    const stopBrief = refreshBrief()

    fetchInbox()
    fetchCalendar()
    fetchBrainStatus()
    fetchBrainRecent()
    fetchSpark()
    fetchToday()
    fetchProgress()

    // Load voice profile
    loadVoiceProfile().then(setVoiceProfile)

    // LEMON workspace subscriptions for the workspace tabs (counts and intel).
    // Each subscription is a no-op if VITE_LEMON_FIREBASE_* vars are missing.
    const unsubDeals = opsViews ? subscribeDeals() : () => {}
    const unsubProjects = opsViews ? subscribeProjects() : () => {}
    const unsubLemonDelegations = opsViews ? subscribeLemonDelegations() : () => {}
    // Mission Control: trackers + engine-computed state (always on)
    const unsubTrackers = subscribeTrackers()
    const unsubMission = subscribeMission()

    return () => {
      unsubTasks()
      unsubDecisions()
      unsubCaptures()
      unsubActions()
      stopBrief()
      unsubDeals()
      unsubProjects()
      unsubLemonDelegations()
      unsubTrackers()
      unsubMission()
    }
  }, [isAuthenticated, user?.uid, opsViews, subscribeDeals, subscribeProjects, subscribeLemonDelegations, subscribeTrackers, subscribeMission])

  const handleReply = (thread: InboxThread) => {
    setReplyEmail({
      threadId: thread.id,
      from: thread.from,
      fromEmail: `${thread.from.toLowerCase().replace(/\s/g, '.')}@${thread.fromDomain}`,
      subject: thread.subject,
      snippet: thread.snippet,
    })
  }

  const createTask = useTaskStore((s) => s.create)
  const handleCreateTask = (thread: InboxThread) => {
    if (!user) return
    const bucketMap: Record<string, Bucket> = { HOT: 'now', MED: 'next', LOW: 'orbit' }
    createTask(user.uid, {
      title: thread.subject,
      bucket: bucketMap[thread.priority] || 'orbit',
      source: 'email',
      notes: `From: ${thread.from}\nThread: ${thread.id}`,
    })
  }

  return (
    <div className="min-h-screen bg-bg-base text-text-primary font-body">
      <DemoBanner />
      <Header onOpenSettings={() => setSettingsOpen(true)} />

      {newDashboard ? (
        <FocusModeProvider>
          <main
            id="main-content"
            className="max-w-[1400px] mx-auto px-4 sm:px-6 pb-16"
            data-focus={focusActive ? 'on' : 'off'}
          >
            <EditorialMasthead />

            {opsViews && <WorkspaceTabs />}

            {!opsViews || view === 'briefing' ? (
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
                    if (t) handleReply(t)
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
                    if (t) handleReply(t)
                  }} />

                  {/* Inbox — smart grouped */}
                  <InboxSummary onReply={handleReply} onCreateTask={handleCreateTask} />

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
            ) : view === 'inbox' ? (
              <InboxIntelView onReply={handleReply} />
            ) : view === 'deals' ? (
              <DealsView />
            ) : view === 'projects' ? (
              <ProjectsView />
            ) : view === 'fund' ? (
              <FundView />
            ) : view === 'writing' ? (
              <WritingView />
            ) : view === 'you' ? (
              <YouView />
            ) : view === 'memory' ? (
              <MemoryView />
            ) : view === 'archive' ? (
              <ArchiveView />
            ) : null}
          </main>
          <GlobalCapture />
          <AILogDrawer />
          <RoughMorningPanel />
        </FocusModeProvider>
      ) : (
        /* Legacy layout — preserved exactly as-is */
        <main className="max-w-[1440px] mx-auto px-4 pb-16">
          <BriefPanel />
          <NextUpBar />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            <TasksPanel />
            <InboxPanel onReply={handleReply} onCreateTask={handleCreateTask} />
            <BrainPanel />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <SparkCard />
            <DecisionJournal />
          </div>
        </main>
      )}

      {/* These stay exactly as-is regardless of layout flag */}
      <SkillLauncher />
      <BillyDrawer />
      <MeetingPrepModal />
      <SkillModal />
      <ReplyModal email={replyEmail} onClose={() => setReplyEmail(null)} />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        voiceProfile={voiceProfile}
        onProfileUpdate={setVoiceProfile}
      />
      <CorrectionInput />
    </div>
  )
}
