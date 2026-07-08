import { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/useAuthStore'
import { useInboxStore } from '@/stores/useInboxStore'
import { useCalendarStore } from '@/stores/useCalendarStore'
import { useBrainStore } from '@/stores/useBrainStore'
import { useBriefStore } from '@/stores/useBriefStore'
import { useTaskStore } from '@/stores/useTaskStore'
import { useDecisionStore } from '@/stores/useDecisionStore'
import { useFocusModeStore } from '@/stores/useFocusModeStore'
import { useCaptureStore } from '@/stores/useCaptureStore'
import { useActionLogStore } from '@/stores/useActionLogStore'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { usePollingEngine } from '@/hooks/usePollingEngine'
import { useCurrentHour } from '@/hooks/useTimeTick'
import { useViewStore } from '@/stores/useViewStore'
import { WorkspaceTabs } from './workspace/WorkspaceTabs'
import { DealsView } from './views/DealsView'
import { ProjectsView } from './views/ProjectsView'
import { DevHellView } from './views/DevHellView'
import { MemoryView } from './views/MemoryView'
import { ArchiveView } from './views/ArchiveView'
import { InboxIntelView } from './views/InboxIntelView'
import type { Bucket } from '@shared/types'
import { loadVoiceProfile, DEFAULT_VOICE_PROFILE } from '@/lib/voiceProfile'
import type { VoiceProfile } from '@/lib/voiceProfile'
import type { InboxThread } from '@shared/types'
import { Header } from './Header'
import { DemoBanner } from './DemoBanner'
import { SkillLauncher } from './SkillLauncher'
import { BillyDrawer } from './BillyDrawer'
import { MeetingPrepModal } from './MeetingPrepModal'
import { SkillModal } from './SkillModal'
import ReplyModal from './ReplyModal'
import SettingsModal from './SettingsModal'
// Editorial redesign components
import { FocusModeProvider } from './FocusModeProvider'
import { EditorialMasthead } from './EditorialMasthead'
import { GlobalCapture } from './GlobalCapture'
import { AILogDrawer } from './AILogDrawer'
import { RoughMorningPanel } from './RoughMorningPanel'
import { CorrectionInput } from './CorrectionInput'
import { useDealsStore } from '@/stores/lemon/useDealsStore'
import { useTodayStore } from '@/stores/useTodayStore'
import { useProjectsStore } from '@/stores/lemon/useProjectsStore'
import { useSlateStore } from '@/stores/useSlateStore'
import { useLemonDelegationsStore } from '@/stores/lemon/useLemonDelegationsStore'
// Mission Control (Spine + trackers)
import { useTrackersStore } from '@/stores/useTrackersStore'
import { useMissionStore } from '@/stores/useMissionStore'
import { FundView } from './views/FundView'
import { WritingView } from './views/WritingView'
import { YouView } from './views/YouView'
import { BriefingView } from './views/BriefingView'
import type { WaitingOnItem } from './WaitingOnPanel'
import type { DelegationExtracted } from './DelegationQueue'

export function Dashboard() {
  const { user, isAuthenticated } = useAuthStore()
  usePollingEngine()
  const { refresh: refreshBrief } = useBriefStore()
  const fetchInbox = useInboxStore((s) => s.fetch)
  const fetchCalendar = useCalendarStore((s) => s.fetch)
  const fetchBrainStatus = useBrainStore((s) => s.fetchStatus)
  const fetchBrainRecent = useBrainStore((s) => s.fetchRecent)
  const subscribeToTasks = useTaskStore((s) => s.subscribe)
  const subscribeToDecisions = useDecisionStore((s) => s.subscribe)
  const subscribeToCaptures = useCaptureStore((s) => s.subscribe)
  const subscribeToActions = useActionLogStore((s) => s.subscribe)
  const focusActive = useFocusModeStore((s) => s.active)
  const { opsViews } = useFeatureFlags()
  const view = useViewStore((s) => s.view)
  const subscribeDeals = useDealsStore((s) => s.subscribe)
  const subscribeProjects = useProjectsStore((s) => s.subscribe)
  const subscribeLemonDelegations = useLemonDelegationsStore((s) => s.subscribe)
  const subscribeTrackers = useTrackersStore((s) => s.subscribe)
  const subscribeMission = useMissionStore((s) => s.subscribe)
  const lemonDelegations = useLemonDelegationsStore((s) => s.delegations)
  const fetchToday = useTodayStore((s) => s.fetchToday)
  const fetchProgress = useTodayStore((s) => s.fetchProgress)
  const fetchSlate = useSlateStore((s) => s.refresh)

  // Voice profile state
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>(DEFAULT_VOICE_PROFILE)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [replyEmail, setReplyEmail] = useState<{ threadId: string; from: string; fromEmail: string; subject: string; snippet: string } | null>(null)

  // Time-based visibility — auto-updates every minute
  const hour = useCurrentHour()
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
    fetchToday()
    fetchProgress()
    fetchSlate()

    // Load voice profile
    loadVoiceProfile().then(setVoiceProfile)

    // Workspace-tab subscriptions (counts and intel), gated on the opsViews flag.
    // These now read the primary Firebase project under users/{uid}/... (see firestoreLemon.ts).
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
    // M-6: Extract actual email from the From header (e.g. "John Smith <john@example.com>")
    // instead of guessing by converting the display name to dots.
    const emailMatch = thread.from.match(/<([^>]+)>/)
    const fromEmail = emailMatch?.[1] ?? `${thread.from.toLowerCase().replace(/\s/g, '.')}@${thread.fromDomain}`
    setReplyEmail({
      threadId: thread.id,
      from: thread.from,
      fromEmail,
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
    <div className="min-h-screen bg-bg text-ink font-sans overflow-x-clip">
      <DemoBanner />
      <Header onOpenSettings={() => setSettingsOpen(true)} />

      <FocusModeProvider>
        <main
          id="main-content"
          className="max-w-[1400px] mx-auto px-4 sm:px-6 pb-16 overflow-x-clip"
          data-focus={focusActive ? 'on' : 'off'}
        >
          <EditorialMasthead />

          {opsViews && <WorkspaceTabs />}

          {!opsViews || view === 'briefing' ? (
            <BriefingView
              eveningMode={eveningMode}
              showWrapup={showWrapup}
              waitingOnItems={waitingOnItems}
              delegationQueueItems={delegationQueueItems}
              onReply={handleReply}
              onCreateTask={handleCreateTask}
            />
          ) : view === 'inbox' ? (
            <InboxIntelView onReply={handleReply} />
          ) : view === 'deals' ? (
            <DealsView />
          ) : view === 'projects' ? (
            <ProjectsView />
          ) : view === 'devhell' ? (
            <DevHellView />
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
