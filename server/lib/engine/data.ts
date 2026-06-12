import { db } from '../firebase'
import type {
  Investor,
  FundStateDoc,
  Script,
  Deadline,
  AIVenture,
  WatchlistItem,
  LemonDeal,
  LemonProject,
  LemonDelegation,
  LemonMemoryEntry,
  BurnoutDay,
  AdvisorTone,
  EngineSlip,
} from '@shared/types'

/**
 * Shared Firestore reads/writes for engine jobs. All tracker data lives
 * under users/{uid}/...; computed singletons live in users/{uid}/state/{docId}.
 */

function toIso(v: unknown): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return v
  const ts = v as { toDate?: () => Date }
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString()
  return undefined
}

async function readCollection<T>(uid: string, name: string): Promise<T[]> {
  const snap = await db.collection(`users/${uid}/${name}`).get()
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      ...data,
      // Normalize Firestore Timestamps the UI/engine compare as strings
      created_at: toIso(data.created_at),
      updated_at: toIso(data.updated_at),
    } as T
  })
}

export interface TrackerData {
  investors: Investor[]
  fundState: FundStateDoc | null
  scripts: Script[]
  deadlines: Deadline[]
  ventures: AIVenture[]
  watchlist: WatchlistItem[]
  deals: LemonDeal[]
  projects: LemonProject[]
  delegations: LemonDelegation[]
  memories: LemonMemoryEntry[]
  burnout: BurnoutDay | null
}

export async function readTrackers(uid: string): Promise<TrackerData> {
  const [
    investors,
    scripts,
    deadlines,
    ventures,
    watchlist,
    deals,
    projects,
    delegations,
    memories,
    fundSnap,
    burnoutSnap,
  ] = await Promise.all([
    readCollection<Investor>(uid, 'investors'),
    readCollection<Script>(uid, 'scripts'),
    readCollection<Deadline>(uid, 'deadlines'),
    readCollection<AIVenture>(uid, 'ventures'),
    readCollection<WatchlistItem>(uid, 'watchlist'),
    readCollection<LemonDeal>(uid, 'deals'),
    readCollection<LemonProject>(uid, 'projects'),
    readCollection<LemonDelegation>(uid, 'delegations'),
    readCollection<LemonMemoryEntry>(uid, 'memories'),
    db.doc(`users/${uid}/state/fund`).get(),
    db.doc(`users/${uid}/state/burnout`).get(),
  ])

  return {
    investors,
    scripts,
    deadlines,
    ventures,
    watchlist,
    deals,
    projects,
    delegations,
    memories,
    fundState: fundSnap.exists ? (fundSnap.data() as FundStateDoc) : null,
    burnout: burnoutSnap.exists ? (burnoutSnap.data() as BurnoutDay) : null,
  }
}

export async function writeState(
  uid: string,
  docId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await db.doc(`users/${uid}/state/${docId}`).set(data)
}

export async function readSlips(uid: string): Promise<EngineSlip[]> {
  const snap = await db.doc(`users/${uid}/state/slips`).get()
  if (!snap.exists) return []
  return (snap.data()?.slips ?? []) as EngineSlip[]
}

export async function readAdvisorTone(uid: string): Promise<AdvisorTone> {
  const snap = await db.doc(`users/${uid}/settings/advisor`).get()
  const tone = snap.exists ? snap.data()?.tone : undefined
  return tone === 'consigliere' ? 'consigliere' : 'brutal'
}
