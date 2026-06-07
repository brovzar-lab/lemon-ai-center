// Consolidation types — ported from DASH-2 + lemon-morning-brief

export type PriorityUrgency = 'critical' | 'high' | 'medium'
export type PriorityLabel = 'Deals' | 'Production' | 'Development'

export interface PriorityItem {
  rank: number
  label: PriorityLabel
  title: string
  rationale: string
  urgency: PriorityUrgency
  dealFile?: string
  projectFile?: string
  threadCount: number
  threadIds: string[]
}

export interface EnrichedRelationshipFlag {
  personName: string
  personSlug: string
  daysSince: number
  lastContactLabel: string
  flagType: 'stale' | 'reappearing'
  linkedDeal?: string
  linkedProject?: string
  rankScore: number
  contextLine: string
  reappearSubject?: string
}

export interface TodayProgress {
  done: number
  queued: number
  deferred: number
  archived: number
  logged: number
  decisions: number
}

export interface PrecomputePayload {
  todayIso: string
  computedAt: string
  priorities: PriorityItem[]
  enrichedFlags: EnrichedRelationshipFlag[]
  northStar: string
  threadCount: number
  eventCount: number
}

export interface TodayPanelData {
  priorities: PriorityItem[]
  northStar: string
  precomputeAge: string | null
  precomputeToday: boolean
}

// Enhanced briefing types from lemon-morning-brief
export type EisenhowerQuadrant = 'urgent_important' | 'important_not_urgent' | 'urgent_not_important' | 'neither'
export type BriefCategory = 'DEAL' | 'LEGAL' | 'CREATIVE' | 'OPS' | 'FUND'

export interface EisenhowerItem {
  title: string
  description: string
  from: string
  emailRef: string
  category: BriefCategory
}

export interface EisenhowerMatrixData {
  urgent_important: EisenhowerItem[]
  important_not_urgent: EisenhowerItem[]
  urgent_not_important: EisenhowerItem[]
  neither: EisenhowerItem[]
}

export interface DelegationExtracted {
  person: string
  role: string
  task: string
  source: string
  emailRef: string
  expectedBy: string | null
  urgency: 'high' | 'medium' | 'low'
}

export interface WaitingOnItem {
  person: string
  subject: string
  daysWaiting: number
  threadId: string
}

export interface ProjectUpdate {
  projectSlug: string
  updateSummary: string
  newStatusDetail: string | null
  nextAction: string
  nextActionOwner: string
}
