import { create } from 'zustand'
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  setDoc,
} from 'firebase/firestore'
import { lemonDb, opsPath } from '@/lib/firestoreLemon'
import { apiFetch } from '@/lib/apiClient'
import type {
  FrontsDoc,
  SlipsDoc,
  BurnoutDoc,
  QuotesDoc,
  EveningWrapDoc,
  FundStateDoc,
  AdvisorNote,
  AdvisorTone,
  WeeklyReview,
  EngineJobStatus,
  AIAction,
  EngineJobId,
} from '@shared/types'

/**
 * Mission Control computed state — everything the Engine writes:
 * fronts, slips, burnout, quotes, evening wrap, fund target, the
 * Advisor's notes, the job ledger, and pending approvals.
 */

interface MissionState {
  fronts: FrontsDoc | null
  slips: SlipsDoc | null
  burnout: BurnoutDoc | null
  quotes: QuotesDoc | null
  eveningWrap: EveningWrapDoc | null
  fund: FundStateDoc | null
  advisorNote: AdvisorNote | null
  weeklyReview: WeeklyReview | null
  engineJobs: EngineJobStatus[]
  pendingApprovals: AIAction[]
  advisorTone: AdvisorTone

  subscribe: () => () => void
  approveAction: (id: string) => Promise<void>
  dismissAction: (id: string) => Promise<void>
  runJob: (jobId: EngineJobId) => Promise<void>
  setAdvisorTone: (tone: AdvisorTone) => Promise<void>
}

export const useMissionStore = create<MissionState>()((set) => ({
  fronts: null,
  slips: null,
  burnout: null,
  quotes: null,
  eveningWrap: null,
  fund: null,
  advisorNote: null,
  weeklyReview: null,
  engineJobs: [],
  pendingApprovals: [],
  advisorTone: 'brutal',

  subscribe: () => {
    const base = opsPath('')?.replace(/\/$/, '')
    if (!base) return () => {}

    const stateDoc = <K extends keyof MissionState>(docId: string, key: K) =>
      onSnapshot(doc(lemonDb, `${base}/state/${docId}`), (snap) => {
        set({ [key]: snap.exists() ? snap.data() : null } as Pick<MissionState, K>)
      })

    const subs = [
      stateDoc('fronts', 'fronts'),
      stateDoc('slips', 'slips'),
      stateDoc('burnout', 'burnout'),
      stateDoc('quotes', 'quotes'),
      stateDoc('eveningWrap', 'eveningWrap'),
      stateDoc('fund', 'fund'),

      // Latest advisor note (today's, or last generated)
      onSnapshot(
        query(collection(lemonDb, `${base}/advisor`), orderBy('date', 'desc'), limit(1)),
        (snap) => {
          set({ advisorNote: snap.empty ? null : (snap.docs[0].data() as AdvisorNote) })
        },
      ),
      onSnapshot(
        query(collection(lemonDb, `${base}/advisor_weekly`), orderBy('weekOf', 'desc'), limit(1)),
        (snap) => {
          set({ weeklyReview: snap.empty ? null : (snap.docs[0].data() as WeeklyReview) })
        },
      ),
      onSnapshot(collection(lemonDb, `${base}/engine_jobs`), (snap) => {
        set({ engineJobs: snap.docs.map((d) => d.data() as EngineJobStatus) })
      }),
      onSnapshot(
        query(collection(lemonDb, `${base}/actions`), where('approvalStatus', '==', 'pending')),
        (snap) => {
          set({
            pendingApprovals: snap.docs.map(
              (d) => ({ ...(d.data() as Omit<AIAction, 'id'>), id: d.id }) as AIAction,
            ),
          })
        },
      ),
      onSnapshot(doc(lemonDb, `${base}/settings/advisor`), (snap) => {
        const tone = snap.exists() ? snap.data()?.tone : undefined
        set({ advisorTone: tone === 'consigliere' ? 'consigliere' : 'brutal' })
      }),
    ]
    return () => subs.forEach((unsub) => unsub())
  },

  approveAction: async (id) => {
    await apiFetch(`/api/engine/actions/${id}/approve`, { method: 'POST' })
  },
  dismissAction: async (id) => {
    await apiFetch(`/api/engine/actions/${id}/dismiss`, { method: 'POST' })
  },
  runJob: async (jobId) => {
    await apiFetch(`/api/engine/run/${jobId}`, { method: 'POST' })
  },
  setAdvisorTone: async (tone) => {
    const base = opsPath('')?.replace(/\/$/, '')
    if (!base) return
    await setDoc(doc(lemonDb, `${base}/settings/advisor`), { tone }, { merge: true })
  },
}))
