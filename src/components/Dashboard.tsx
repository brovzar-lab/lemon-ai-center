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
  const fetchToday = useTodayStore((s) => s.fetchToday)
  const fetchProgress = useTodayStore((s) => s.fetchProgress)

  // Voice profile state
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>(DEFAULT_VOICE_PROFILE)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [replyEmail, setReplyEmail] = useState<{ threadId: string; from: string; fromEmail: string; subject: string; snippet: string } | null>(null)

  // Time-based visibility
  const hour = new Date().getHours()
  const showWrapup = hour >= 16 // Show wrapup after 4pm

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

    return () => {
      unsubTasks()
      unsubDecisions()
      unsubCaptures()
      unsubActions()
      stopBrief()
      unsubDeals()
      unsubProjects()
      unsubLemonDelegations()
    }
  }, [isAuthenticated, user?.uid, opsViews, subscribeDeals, subscribeProjects, subscribeLemonDelegations])

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
                <section aria-label="Morning briefing" className="flex flex-col gap-0 animate-in">
                  <CollapsibleSection
                    id="morning-overview"
                    title="Morning Overview"
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

                {/* ── CENTER (Wide): Hero + Priorities + Calendar + Inbox + Tasks ── */}
                <section aria-label="Command center" className="flex flex-col gap-0 animate-in animate-in-delay-1">
                  {/* HERO: The One Thing — always visible, always first */}
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

                  {/* Inbox — smart grouped */}
                  <InboxSummary onReply={handleReply} onCreateTask={handleCreateTask} />

                  {/* Tasks — collapsible buckets */}
                  <CollapsibleSection id="tasks" title="Tasks">
                    <TasksPanel />
                  </CollapsibleSection>

                  {/* Waiting On + Delegations — only if populated */}
                  <WaitingOnPanel items={[]} />
                  <DelegationQueue delegations={[]} />

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
