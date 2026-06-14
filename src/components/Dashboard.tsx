import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/useAuthStore'
import { useInboxStore } from '@/stores/useInboxStore'
import { useCalendarStore } from '@/stores/useCalendarStore'
import { useBrainStore } from '@/stores/useBrainStore'
import { useBriefStore } from '@/stores/useBriefStore'
import { useTaskStore } from '@/stores/useTaskStore'
import { useDecisionStore } from '@/stores/useDecisionStore'
import { useCaptureStore } from '@/stores/useCaptureStore'
import { useActionLogStore } from '@/stores/useActionLogStore'
import { usePollingEngine } from '@/hooks/usePollingEngine'
import { useViewStore } from '@/stores/useViewStore'
import { useTimeMode } from '@/hooks/useTimeMode'
import { loadVoiceProfile, DEFAULT_VOICE_PROFILE } from '@/lib/voiceProfile'
import type { VoiceProfile } from '@/lib/voiceProfile'
import type { InboxThread, Bucket } from '@shared/types'

// Structural components
import { Header } from './Header'
import { EditorialMasthead } from './EditorialMasthead'
import { WorkspaceTabs } from './workspace/WorkspaceTabs'
import { GlobalCapture } from './GlobalCapture'
import { AILogDrawer } from './AILogDrawer'

// The three editions
import { MorningEdition } from './editions/MorningEdition'
import { MiddayEdition } from './editions/MiddayEdition'
import { EveningEdition } from './editions/EveningEdition'

// Tab views (kept — not deleted)
import { DealsView } from './views/DealsView'
import { ProjectsView } from './views/ProjectsView'
import { WritingView } from './views/WritingView'

// These views are still accessible but not in the primary tabs:
// Import them conditionally so the code isn't lost
import { FundView } from './views/FundView'
import { YouView } from './views/YouView'
import { InboxIntelView } from './views/InboxIntelView'
import { MemoryView } from './views/MemoryView'
import { ArchiveView } from './views/ArchiveView'

// Modals & overlays (all kept)
import { SkillLauncher } from './SkillLauncher'
import { BillyDrawer } from './BillyDrawer'
import { MeetingPrepModal } from './MeetingPrepModal'
import { SkillModal } from './SkillModal'
import ReplyModal from './ReplyModal'
import SettingsModal from './SettingsModal'
import { CorrectionInput } from './CorrectionInput'

// Stores
import { useDealsStore } from '@/stores/lemon/useDealsStore'
import { useProjectsStore } from '@/stores/lemon/useProjectsStore'
import { useLemonDelegationsStore } from '@/stores/lemon/useLemonDelegationsStore'
import { useTrackersStore } from '@/stores/useTrackersStore'
import { useMissionStore } from '@/stores/useMissionStore'
import { useTodayStore } from '@/stores/useTodayStore'

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
  const view = useViewStore((s) => s.view)
  const subscribeDeals = useDealsStore((s) => s.subscribe)
  const subscribeProjects = useProjectsStore((s) => s.subscribe)
  const subscribeLemonDelegations = useLemonDelegationsStore((s) => s.subscribe)
  const subscribeTrackers = useTrackersStore((s) => s.subscribe)
  const subscribeMission = useMissionStore((s) => s.subscribe)
  const fetchToday = useTodayStore((s) => s.fetchToday)
  const fetchProgress = useTodayStore((s) => s.fetchProgress)

  // Voice profile state (kept — voice is a core feature)
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>(DEFAULT_VOICE_PROFILE)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [replyEmail, setReplyEmail] = useState<{
    threadId: string; from: string; fromEmail: string; subject: string; snippet: string
  } | null>(null)

  // The edition system — drives the entire Command Center layout
  const { edition } = useTimeMode()

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

    // Load voice profile (kept — audio briefing is a core feature)
    loadVoiceProfile().then(setVoiceProfile)

    // Workspace subscriptions
    const unsubDeals = subscribeDeals()
    const unsubProjects = subscribeProjects()
    const unsubLemonDelegations = subscribeLemonDelegations()
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
  }, [isAuthenticated, user?.uid, subscribeDeals, subscribeProjects, subscribeLemonDelegations, subscribeTrackers, subscribeMission])

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
      <Header onOpenSettings={() => setSettingsOpen(true)} />

      <main
        id="main-content"
        className="max-w-[880px] mx-auto px-4 sm:px-6 pb-16"
      >
        <EditorialMasthead />
        <WorkspaceTabs />

        {/* ═══ COMMAND CENTER ═══ */}
        {view === 'briefing' ? (
          edition === 'morning' ? (
            <MorningEdition onReply={handleReply} />
          ) : edition === 'midday' ? (
            <MiddayEdition onReply={handleReply} />
          ) : (
            <EveningEdition />
          )

        /* ═══ PRIMARY TABS ═══ */
        ) : view === 'deals' ? (
          <DealsView />
        ) : view === 'projects' ? (
          <ProjectsView />
        ) : view === 'writing' ? (
          <WritingView />

        /* ═══ SECONDARY VIEWS (accessible but not in primary tabs) ═══ */
        ) : view === 'inbox' ? (
          <InboxIntelView onReply={handleReply} />
        ) : view === 'fund' ? (
          <FundView />
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

      {/* Modals & overlays — all kept */}
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
