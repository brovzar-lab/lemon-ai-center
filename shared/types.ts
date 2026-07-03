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

export type ActiveContextKind = 'thread' | 'task' | 'decision' | 'spark' | 'claim' | 'meeting' | null

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

export type AIActionType =
  | 'archive'
  | 'label'
  | 'draft'
  | 'delegate'
  | 'delegate_recalled'
  | 'snooze'
  | 'priority_change'
  | 'calendar_block'

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
  // Outward-facing actions queue for one-tap approval (autonomy boundary).
  // 'pending' renders in the Spine's approvals strip.
  approvalStatus?: 'pending' | 'approved' | 'dismissed'
  // Action-specific data, e.g. calendar_block: { date, startHour, endHour, title }
  payload?: Record<string, unknown>
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

// ─────────────────────────────────────────────────────────────
// Mission Control types (2026-06 overhaul)
// All collections live under users/{uid}/... in primary Firestore.
// Singleton computed docs live in the `state` collection:
//   state/fronts, state/slips, state/burnout, state/quotes,
//   state/eveningWrap, state/fund
// ─────────────────────────────────────────────────────────────

export type FrontKey = 'fund' | 'writing' | 'shows' | 'deals' | 'you'
export type FrontStatus = 'quiet' | 'attention' | 'critical'

export interface FrontItem {
  text: string
  detail?: string
  refKind?: 'investor' | 'script' | 'deadline' | 'deal' | 'project' | 'delegation' | 'venture' | 'burnout'
  refId?: string
  severity?: 'info' | 'warn' | 'critical'
}

export interface Front {
  key: FrontKey
  rank: number             // 1 = needs you most today
  headline: string         // one-line state of this front
  status: FrontStatus      // quiet fronts collapse in the Spine
  items: FrontItem[]
}

export interface FrontsDoc {
  fronts: Front[]
  computedAt: string
}

export type InvestorStage = 'contacted' | 'interested' | 'docs' | 'committed' | 'passed'

export interface Investor {
  id: string
  name: string
  org?: string
  stage: InvestorStage
  amountMXN?: number       // committed or discussed amount
  lastTouch?: string       // ISO date of last interaction
  nextAction?: string
  notes?: string
  source?: 'manual' | 'auto'
  created_at?: string
  updated_at?: string
}

export interface FundStateDoc {
  targetMXN: number        // e.g. 300_000_000
  notes?: string
  updated_at?: string
}

export type ScriptStage = 'idea' | 'outline' | 'draft' | 'polish' | 'delivered'

export interface Script {
  id: string
  title: string
  slatePosition?: number
  stage: ScriptStage
  draftNumber?: number
  lastTouchedAt?: string   // from vault file activity or manual
  targetDate?: string
  vaultPath?: string       // wiki note path inside the Obsidian vault
  notes?: string
  source?: 'manual' | 'auto'
  created_at?: string
  updated_at?: string
}

export interface Deadline {
  id: string
  title: string
  date: string             // ISO date
  severity: 'hard' | 'soft'
  linkedEntity?: string
  notes?: string
  source?: 'manual' | 'auto'
}

export type EngineSlipKind = 'delegation' | 'deal' | 'script' | 'deadline'

export interface EngineSlip {
  id: string
  kind: EngineSlipKind
  refId?: string
  summary: string
  detail?: string
  severity: 'warn' | 'critical'
  detectedAt: string
}

export interface SlipsDoc {
  slips: EngineSlip[]
  computedAt: string
}

export type AdvisorTone = 'brutal' | 'consigliere'

export interface AdvisorCallout {
  text: string
  refKind?: string
  refId?: string
}

export interface AdvisorNote {
  date: string             // YYYY-MM-DD, also the doc id in advisor/
  headline: string
  body: string
  callouts: AdvisorCallout[]
  tone: AdvisorTone
  generatedAt: string
  degraded?: boolean
}

export interface WeeklyReview {
  weekOf: string           // Monday YYYY-MM-DD, doc id in advisor_weekly/
  attentionByFront: Partial<Record<FrontKey, number>>  // hours
  summary: string
  stalls: string[]
  risks: string[]
  recommendation: string   // exactly one strategic recommendation
  generatedAt: string
}

export interface BurnoutDay {
  date: string             // YYYY-MM-DD
  meetingHours: number
  lateNightEmails: number  // sent 22:00–06:00
  weekendActive: boolean
  writingMinutes?: number
  daysSinceBreak: number
  score: number            // 0–100
}

export interface BurnoutDoc extends BurnoutDay {
  trend: number[]          // last 7 scores, oldest first
}

export interface AIVenture {
  id: string
  name: string
  stage?: string
  nextAction?: string
  lastTouch?: string
  notes?: string
  created_at?: string
  updated_at?: string
}

export interface WatchlistItem {
  id: string               // doc id = lowercase ticker
  ticker: string
  shares?: number
  costBasisUSD?: number
  notes?: string
}

export interface QuoteSnapshot {
  ticker: string
  price: number
  change: number
  changePct: number
  asOf: string
}

export interface QuotesDoc {
  quotes: QuoteSnapshot[]
  computedAt: string
}

export interface EveningWrapDoc {
  date: string
  summary: string
  tomorrow: string[]
  generatedAt: string
}

export type EngineJobId =
  | 'inbox_scan'
  | 'morning_assembly'
  | 'slip_detect'
  | 'nightly'
  | 'evening_wrap'
  | 'weekly_review'
  | 'watchlist'
  | 'seed_from_vault'

export interface EngineJobStatus {
  jobId: EngineJobId
  lastRun?: string
  lastSuccess?: string
  status: 'idle' | 'running' | 'ok' | 'error'
  error?: string
  durationMs?: number
}

export interface AdvisorSettingsDoc {
  tone: AdvisorTone
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

// ── DEVELOPMENT-HELL: the development slate ─────────────────────────────
// Source of truth is the DEVELOPMENT/ folder on disk (one folder per
// project, project.yaml for metadata); Firestore `slate/*` mirrors it so
// cloud and local sessions see the same slate. Doc id == slug == folder name.

export type SlateFormat = 'film' | 'series'

export const SLATE_FILM_STAGES = [
  'idea', 'concept', 'treatment', 'outline', 'draft1', 'rewrites', 'polish', 'market-ready',
] as const
export const SLATE_SERIES_STAGES = [
  'idea', 'concept', 'bible', 'pilot-outline', 'pilot-draft', 'rewrites', 'season-arc', 'market-ready',
] as const

export type SlateFilmStage = (typeof SLATE_FILM_STAGES)[number]
export type SlateSeriesStage = (typeof SLATE_SERIES_STAGES)[number]
export type SlateStage = SlateFilmStage | SlateSeriesStage

export type SlateOrigin = 'internal' | 'external' // external material is firewalled
export type SlateStatus = 'active' | 'paused' | 'dead'
export type SlatePriority = 'A' | 'B' | 'C'
export type SlateLanguage = 'es' | 'en' | 'both'

export interface SlateWriter {
  name: string
  contact?: string // email enables Gmail-draft nudges
  language?: SlateLanguage // nudges drafted in this language
}

export interface SlateWaitingOn {
  who: string
  what: string
  since: string // ISO date
}

export interface SlateDeadline {
  date: string // ISO date
  what: string
}

export interface SlateProject {
  slug: string // == DEVELOPMENT/ folder name, immutable
  title: string
  format: SlateFormat
  stage: SlateStage
  origin: SlateOrigin
  status: SlateStatus
  priority?: SlatePriority
  language?: SlateLanguage
  logline?: string
  writers?: SlateWriter[]
  waiting_on?: SlateWaitingOn | null
  targets?: string[]
  deadlines?: SlateDeadline[]
  staleness_days?: number // per-project override of the stage default
  notes?: string
  last_touched?: string // ISO — every file event updates this; drives staleness
  created_at?: string
  updated_at?: string
}
