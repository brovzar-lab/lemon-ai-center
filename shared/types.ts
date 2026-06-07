export type Bucket = 'now' | 'next' | 'orbit'

export type TaskSource = 'manual' | 'morning-brief' | 'ai-suggested' | 'email' | 'meeting'

export interface Task {
  id: string
  title: string
  bucket: Bucket
  done: boolean
  doneAt?: string
  createdAt: string
  updatedAt: string
  source: TaskSource
  notes?: string
  linkedSkill?: string
  linkedEmailId?: string
  linkedMeetingId?: string
  dueDate?: string
}

export interface Decision {
  id: string
  text: string
  ts: string
  updatedAt: string
  tags?: string[]
  outcome?: 'made' | 'deferred' | 'reversed'
  linkedTaskId?: string
  context?: string
}

export interface Brief {
  jarvis: string
  billy: string
  generatedAt?: string
  isStale?: boolean
  isDemo?: boolean
  briefId?: string
  model?: string
  promptVersion?: string
}

export type ThreadTag = 'DEAL' | 'INT' | 'INFO' | 'INDUSTRY' | 'NONE'
export type ThreadPriority = 'HOT' | 'MED' | 'LOW'

export interface InboxThread {
  id: string
  subject: string
  from: string
  fromDomain: string
  snippet: string
  unread: boolean
  receivedAt: string
  tag: ThreadTag
  priority: ThreadPriority
  labels?: string[]
}

export interface MeetingEvent {
  id: string
  title: string
  start: string
  end: string
  attendees: string[]
  isRequired: boolean
  location?: string
  description?: string
  meetLink?: string
  prepNotes?: string
}

export type NotionBlockType =
  | 'paragraph'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'bulleted_list_item'
  | 'numbered_list_item'
  | 'toggle'
  | 'divider'
  | 'image'
  | 'embed'

export type ToneDot = 'hot' | 'active' | 'cool'

export interface NotionBlock {
  id: string
  type: NotionBlockType
  text: string
  url?: string
  toneDot?: ToneDot
  children?: NotionBlock[]
}

export type SkillId =
  | 'lemon-coverage'
  | 'logline-extractor'
  | 'treatment-writer'
  | 'budget-sanity'
  | 'casting-brief'
  | 'deck-polish'
  | 'email-reply-draft'
  | 'meeting-prep'
  | 'contract-review'
  | 'press-kit'
  | 'festival-strategy'
  | 'pitch-coach'
  | 'distributor-tracker'
  | 'co-prod-finder'
  | 'brand-brief'
  | 'social-copy'
  | 'ai-billy-voice'
  | 'quick-tasks'
  | 'daily-priorities'
  | 'decision-coach'
  | 'mood-board-prompt'
  | 'location-scout'
  | 'talent-profile'
  | 'script-notes'
  | 'interview-questions'
  | 'brand-strategy'
  | 'film-bible'

export type SkillCategory = 'creative' | 'production' | 'business' | 'comms' | 'strategy'

export interface Skill {
  id: SkillId
  title: string
  description: string
  category: SkillCategory
  icon?: string
}

export interface SeedsData {
  isDemo: true
  tasks: Task[]
  decisions: Decision[]
  brief: Pick<Brief, 'jarvis' | 'billy'> & Partial<Pick<BriefDoc, 'overview' | 'oneThing' | 'longBrief'>>
  threads: InboxThread[]
  meetings: MeetingEvent[]
  notionBlocks: NotionBlock[]
  spark: string
  captures: Capture[]
}

export type ActiveContextKind = 'thread' | 'task' | 'decision' | 'spark' | 'claim' | null

export interface ActiveContext {
  kind: ActiveContextKind
  id: string | null
}

export interface TagPatterns {
  DEAL: { domains: string[]; senders: string[] }
  INT: { domains: string[] }
  INFO: { domains: string[]; subjectIncludes: string[] }
  INDUSTRY: { domains: string[]; senders: string[] }
}

// --- Editorial Redesign Types ---

export interface Citation {
  sourceType: 'gmail' | 'calendar' | 'notion' | 'inferred'
  sourceId: string
  snippet: string          // ≤120 chars
  confidence: 'high' | 'med' | 'low'
}

export interface Claim {
  text: string             // markdown for **bold** and *italic*
  citations: Citation[]    // ≥1 required
}

export interface DecisionOption {
  label: string              // 'A', 'B', 'C'
  text: string               // action description
  detail: string             // tradeoff/context
}

export interface BriefDoc {
  overview: Claim[]        // exactly 5 entries
  oneThing: Claim & { why: string }
  longBrief: string        // 80-150 word prose, dual-voice
  decisionOptions?: DecisionOption[]  // A/B/C options for the top decision
  generatedAt: string
  inboxSnapshot: string[]
  model: string
  promptVersion: string
  degraded?: boolean       // true if pass-1 JSON failed validation twice
}

export interface Capture {
  id: string
  text: string
  kind: 'todo' | 'idea' | 'delegate'
  createdAt: string
  reviewed?: boolean
}

export type AIActionType = 'archive' | 'label' | 'draft' | 'delegate' | 'delegate_recalled' | 'snooze' | 'priority_change'

export interface AIAction {
  id: string
  type: AIActionType
  target: { kind: 'thread' | 'task' | 'event'; id: string; label: string }
  sourceRef?: Citation
  confidence: 'high' | 'med' | 'low'
  initiator: 'user' | 'ai'
  reversible: boolean
  undone: boolean
  createdAt: string
  expiresAt: string        // createdAt + 24h
}

export interface Delegation {
  id: string
  to: string
  taskTitle: string
  context: string
  attachedRefs: Citation[]
  deadline?: string
  gmailMessageId?: string
  createdAt: string
}

// --- LEMON workspace types (read from secondary Firebase app) ---

export type DealStatus = 'active' | 'pending_signature' | 'in_review' | 'closed'

export interface LemonDeal {
  id: string
  name: string
  status: DealStatus
  counterparty?: string
  owner?: string
  value?: string           // human-formatted, e.g. "$7.5M"
  next_action?: string
  project?: string         // slug linking to a LemonProject
  notes?: string
  key_dates?: Array<{ label: string; date: string }>
  created_at?: string
  updated_at?: string
}

export type ProjectCategory =
  | 'development'
  | 'pre_production'
  | 'production'
  | 'post_production'
  | 'deals_business'

export type ProjectFormat = 'film' | 'series' | 'deal'

export interface LemonProject {
  id: string
  title: string
  category: ProjectCategory
  format?: ProjectFormat
  platform?: string
  status_detail?: string
  next_action?: string
  sort_order?: number
  status?: string
  created_at?: string
  updated_at?: string
}

export type LemonDelegationStatus = 'pending' | 'completed' | 'cancelled'

export interface LemonDelegation {
  id: string
  person: string
  task: string
  context?: string
  expected_by?: string
  status: LemonDelegationStatus
  email_ref?: string       // gmail message id when extracted from email
  created_at?: string
  completed_date?: string | null
  source?: 'manual' | 'auto'
}

export interface LemonMemoryEntry {
  id: string
  text: string
  source: 'manual' | 'auto'
  active: boolean
  learned_at?: string
}

export interface LemonArchiveItem {
  id: string
  archived_at?: string
  briefing_date?: string
  restored: boolean
  // The archive doc stores a snapshot of the original briefing item, so
  // the rest of the shape is intentionally loose.
  title?: string
  description?: string
  email_ref?: string
  tag?: string
  from?: string
  [extra: string]: unknown
}

// "Slip detection" surface data — derived in the client from the
// existing Gmail and LEMON streams. Intentionally separate from
// `InboxThread` so we can attach AI-driven reasons later.
export type SlipReason =
  | 'awaiting_reply'   // Billy hasn't replied
  | 'overdue_delegation'
  | 'no_next_action'
  | 'tied_to_active_deal'
  | 'tied_to_active_project'

export interface InboxSlip {
  threadId: string
  subject: string
  from: string
  ageHours: number
  priority: ThreadPriority
  reason: SlipReason
  linkedDealId?: string
  linkedProjectId?: string
  linkedDelegationId?: string
}
