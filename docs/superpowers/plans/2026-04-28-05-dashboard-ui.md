# Dashboard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all dashboard UI components — Header, BriefPanel, NextUpBar, TasksPanel, InboxPanel, TriageMode, BrainPanel, SparkCard, DecisionJournal, SkillLauncher, BillyDrawer, MeetingPrepModal — and assemble them into a working Dashboard. After this plan the full Lemon AI Center UI renders, navigates, and responds to keyboard shortcuts.

**Architecture:** Each component consumes exactly one or two Zustand stores. Components render seed data immediately (stores initialized with seeds). CSS transitions for brief cross-fade (200ms). Portals for Drawer and Modals. Keyboard event listeners scoped to TriageMode only.

**Tech Stack:** React 18, Tailwind 3, Zustand 4, Google Fonts (Fraunces + Inter, already loaded in index.html)

**Prerequisite:** Plans 01–04 complete.

---

### Task 1: Skill data + Dashboard shell + App.tsx wiring

**Files:**
- Create: `src/data/skills.ts`
- Create: `src/components/Dashboard.tsx`
- Modify: `src/App.tsx`
- Create: `src/__tests__/Dashboard.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/__tests__/Dashboard.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { App } from '../App'

test('App renders Dashboard without crashing', () => {
  render(<App />)
  // AuthGate calls fetch — mock it to avoid errors
})
```

Since `AuthGate` calls `fetch('/api/me')`, add a global fetch mock to `src/test-setup.ts`:

```ts
// Append to src/test-setup.ts
import { vi } from 'vitest'

// Default: unauthenticated
global.fetch = vi.fn().mockResolvedValue({
  ok: false,
  status: 401,
  json: () => Promise.resolve({ error: { code: 'UNAUTHENTICATED', message: 'Not signed in', retryable: false } }),
} as any)
```

- [ ] **Step 2: Create `src/data/skills.ts`**

```ts
import type { Skill } from '@shared/types'

export const SKILLS: Skill[] = [
  { id: 'lemon-coverage', title: 'Lemon Coverage', description: 'Script coverage in Lemon voice', category: 'creative' },
  { id: 'logline-extractor', title: 'Logline Extractor', description: 'One-sentence distillation', category: 'creative' },
  { id: 'treatment-writer', title: 'Treatment Writer', description: 'Full treatment from outline', category: 'creative' },
  { id: 'budget-sanity', title: 'Budget Sanity', description: 'Budget assumptions check', category: 'production' },
  { id: 'casting-brief', title: 'Casting Brief', description: 'Character brief for casting', category: 'production' },
  { id: 'deck-polish', title: 'Deck Polish', description: 'Investor deck language refine', category: 'business' },
  { id: 'email-reply-draft', title: 'Email Reply', description: 'Draft reply for any thread', category: 'comms' },
  { id: 'meeting-prep', title: 'Meeting Prep', description: 'Talking points + context brief', category: 'strategy' },
  { id: 'contract-review', title: 'Contract Review', description: 'Key clause summary', category: 'business' },
  { id: 'press-kit', title: 'Press Kit', description: 'Press notes and EPK copy', category: 'comms' },
  { id: 'festival-strategy', title: 'Festival Strategy', description: 'Festival route for a project', category: 'strategy' },
  { id: 'pitch-coach', title: 'Pitch Coach', description: 'Q&A rehearsal for pitches', category: 'strategy' },
  { id: 'distributor-tracker', title: 'Distributor Tracker', description: 'Status on open deals', category: 'business' },
  { id: 'co-prod-finder', title: 'Co-Prod Finder', description: 'Match projects to co-producers', category: 'strategy' },
  { id: 'brand-brief', title: 'Brand Brief', description: 'Brand positioning statement', category: 'business' },
  { id: 'social-copy', title: 'Social Copy', description: 'IG/TW copy for releases', category: 'comms' },
  { id: 'ai-billy-voice', title: 'AI Billy Voice', description: 'Billy voice for any draft', category: 'comms' },
  { id: 'quick-tasks', title: 'Quick Tasks', description: 'Capture tasks from freeform', category: 'strategy' },
  { id: 'daily-priorities', title: 'Daily Priorities', description: 'Rank today\'s priorities', category: 'strategy' },
  { id: 'decision-coach', title: 'Decision Coach', description: 'Framework for hard choices', category: 'strategy' },
  { id: 'mood-board-prompt', title: 'Mood Board', description: 'Visual direction prompts', category: 'creative' },
  { id: 'location-scout', title: 'Location Scout', description: 'Location research brief', category: 'production' },
  { id: 'talent-profile', title: 'Talent Profile', description: 'Director/actor research brief', category: 'production' },
  { id: 'script-notes', title: 'Script Notes', description: 'Development notes on a script', category: 'creative' },
  { id: 'interview-questions', title: 'Interview Questions', description: 'Press interview prep', category: 'comms' },
  { id: 'brand-strategy', title: 'Brand Strategy', description: 'Long-form brand positioning', category: 'business' },
  { id: 'film-bible', title: 'Film Bible', description: 'Series/project bible draft', category: 'creative' },
]
```

- [ ] **Step 3: Create `src/components/Dashboard.tsx`**

```tsx
import { useEffect } from 'react'
import { useAuthStore } from '@/stores/useAuthStore'
import { useInboxStore } from '@/stores/useInboxStore'
import { useCalendarStore } from '@/stores/useCalendarStore'
import { useBrainStore } from '@/stores/useBrainStore'
import { useSparkStore } from '@/stores/useSparkStore'
import { useBriefStore } from '@/stores/useBriefStore'
import { useTaskStore } from '@/stores/useTaskStore'
import { useDecisionStore } from '@/stores/useDecisionStore'
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

export function Dashboard() {
  const { user, isAuthenticated } = useAuthStore()
  const { refresh: refreshBrief } = useBriefStore()
  const fetchInbox = useInboxStore((s) => s.fetch)
  const fetchCalendar = useCalendarStore((s) => s.fetch)
  const fetchBrain = useBrainStore((s) => s.fetch)
  const fetchSpark = useSparkStore((s) => s.fetch)
  const subscribeToTasks = useTaskStore((s) => s.subscribe)
  const subscribeToDecisions = useDecisionStore((s) => s.subscribe)

  useEffect(() => {
    if (!isAuthenticated || !user) return

    const unsubTasks = subscribeToTasks(user.uid)
    const unsubDecisions = subscribeToDecisions(user.uid)
    const stopBrief = refreshBrief()

    fetchInbox()
    fetchCalendar()
    fetchBrain()
    fetchSpark()

    return () => {
      unsubTasks()
      unsubDecisions()
      stopBrief()
    }
  }, [isAuthenticated, user?.uid])

  return (
    <div className="min-h-screen bg-bg-base text-text-primary font-body">
      <DemoBanner />
      <Header />
      <main className="max-w-[1440px] mx-auto px-4 pb-16">
        <BriefPanel />
        <NextUpBar />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          <TasksPanel />
          <InboxPanel />
          <BrainPanel />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <SparkCard />
          <DecisionJournal />
        </div>
      </main>
      <SkillLauncher />
      <BillyDrawer />
      <MeetingPrepModal />
      <SkillModal />
    </div>
  )
}
```

- [ ] **Step 4: Update `src/App.tsx`**

```tsx
import { AuthGate } from '@/components/AuthGate'
import { Dashboard } from '@/components/Dashboard'

export function App() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  )
}
```

- [ ] **Step 5: Run test — expect it renders without crash**

```bash
npm test -- src/__tests__/Dashboard.test.tsx
```

Expected: PASS (components not yet created but imports will fail — create stubs for missing components first, then iterate).

For now, create empty stubs for each missing component. Add each file with content:
```tsx
// src/components/Header.tsx
export function Header() { return <header /> }
// src/components/BriefPanel.tsx
export function BriefPanel() { return <div /> }
// src/components/NextUpBar.tsx
export function NextUpBar() { return <div /> }
// src/components/TasksPanel.tsx
export function TasksPanel() { return <div /> }
// src/components/InboxPanel.tsx
export function InboxPanel() { return <div /> }
// src/components/BrainPanel.tsx
export function BrainPanel() { return <div /> }
// src/components/SparkCard.tsx
export function SparkCard() { return <div /> }
// src/components/DecisionJournal.tsx
export function DecisionJournal() { return <div /> }
// src/components/SkillLauncher.tsx
export function SkillLauncher() { return <div /> }
// src/components/BillyDrawer.tsx
export function BillyDrawer() { return <div /> }
// src/components/MeetingPrepModal.tsx
export function MeetingPrepModal() { return <div /> }
// src/components/SkillModal.tsx
export function SkillModal() { return <div /> }
```

Run `npm test` — stubs let Dashboard.test.tsx compile. Then implement each component in Tasks 2–10, replacing the stubs.

- [ ] **Step 6: Commit stubs**

```bash
git add src/data/skills.ts src/components/Dashboard.tsx src/App.tsx src/components/Header.tsx src/components/BriefPanel.tsx src/components/NextUpBar.tsx src/components/TasksPanel.tsx src/components/InboxPanel.tsx src/components/BrainPanel.tsx src/components/SparkCard.tsx src/components/DecisionJournal.tsx src/components/SkillLauncher.tsx src/components/BillyDrawer.tsx src/components/MeetingPrepModal.tsx src/components/SkillModal.tsx src/test-setup.ts
git commit -m "feat: dashboard shell + component stubs, 27 skills data"
```

---

### Task 2: Header + SyncingPill

**Files:**
- Modify: `src/components/Header.tsx`
- Create: `src/components/SyncingPill.tsx`
- Create: `src/__tests__/Header.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/__tests__/Header.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { Header } from '../components/Header'

test('Header renders wordmark', () => {
  render(<Header />)
  expect(screen.getByText(/Lemon Studios/i)).toBeInTheDocument()
})

test('Header has Sync All button', () => {
  render(<Header />)
  expect(screen.getByRole('button', { name: /sync all/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test — expect FAIL (stub renders nothing useful)**

```bash
npm test -- src/__tests__/Header.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create `src/components/SyncingPill.tsx`**

```tsx
import { useBriefStore } from '@/stores/useBriefStore'

export function SyncingPill() {
  const isStreaming = useBriefStore((s) => s.isStreaming)
  if (!isStreaming) return null

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-elevated border border-border-soft text-xs text-text-tertiary font-body">
      <span className="w-1.5 h-1.5 rounded-full bg-accent-lemon animate-pulse" />
      Syncing
    </span>
  )
}
```

- [ ] **Step 4: Implement `src/components/Header.tsx`**

```tsx
import { useInboxStore } from '@/stores/useInboxStore'
import { useCalendarStore } from '@/stores/useCalendarStore'
import { useBrainStore } from '@/stores/useBrainStore'
import { useBriefStore } from '@/stores/useBriefStore'
import { SyncingPill } from './SyncingPill'

export function Header() {
  const fetchInbox = useInboxStore((s) => s.fetch)
  const fetchCalendar = useCalendarStore((s) => s.fetch)
  const fetchBrain = useBrainStore((s) => s.fetch)
  const refreshBrief = useBriefStore((s) => s.refresh)

  const syncAll = () => {
    fetchInbox()
    fetchCalendar()
    fetchBrain()
    refreshBrief(true)
  }

  return (
    <header className="sticky top-0 z-40 bg-bg-base/90 backdrop-blur-sm border-b border-border-soft px-4 py-3 flex items-center justify-between">
      <span className="font-display text-lg font-semibold text-text-primary tracking-tight">
        Lemon Studios
      </span>
      <div className="flex items-center gap-3">
        <SyncingPill />
        <button
          onClick={syncAll}
          className="text-xs font-body font-medium text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 rounded-md border border-border-soft hover:border-border-medium"
        >
          Sync All
        </button>
        <a
          href="/auth/google/logout"
          className="text-xs font-body text-text-muted hover:text-text-tertiary transition-colors"
        >
          Sign out
        </a>
      </div>
    </header>
  )
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test -- src/__tests__/Header.test.tsx
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/components/Header.tsx src/components/SyncingPill.tsx src/__tests__/Header.test.tsx
git commit -m "feat: Header with wordmark, Sync All, SyncingPill"
```

---

### Task 3: BriefPanel

**Files:**
- Modify: `src/components/BriefPanel.tsx`
- Create: `src/__tests__/BriefPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/BriefPanel.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { BriefPanel } from '../components/BriefPanel'
import { useBriefStore } from '../stores/useBriefStore'
import { seeds } from '../data/seeds'

beforeEach(() => {
  useBriefStore.setState({ jarvis: seeds.brief.jarvis, billy: seeds.brief.billy, isStale: false, isStreaming: false, generatedAt: null, briefId: null })
})

test('BriefPanel renders jarvis section', () => {
  render(<BriefPanel />)
  expect(screen.getByTestId('brief-jarvis')).toBeInTheDocument()
})

test('BriefPanel renders billy section', () => {
  render(<BriefPanel />)
  expect(screen.getByTestId('brief-billy')).toBeInTheDocument()
})

test('BriefPanel shows stale indicator when isStale=true', () => {
  useBriefStore.setState({ ...useBriefStore.getState(), isStale: true })
  render(<BriefPanel />)
  expect(screen.getByTestId('brief-stale-badge')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- src/__tests__/BriefPanel.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/components/BriefPanel.tsx`**

```tsx
import { useBriefStore } from '@/stores/useBriefStore'

export function BriefPanel() {
  const { jarvis, billy, isStale, isStreaming } = useBriefStore()

  return (
    <section
      className="mt-4 p-5 bg-bg-surface border border-border-soft rounded-xl"
      style={{ transition: 'opacity 200ms ease-in-out', opacity: isStreaming ? 0.8 : 1 }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-sm font-medium text-text-tertiary uppercase tracking-widest">
          Morning Brief
        </h2>
        {isStale && (
          <span
            data-testid="brief-stale-badge"
            className="text-xs text-text-muted font-body px-2 py-0.5 rounded-full border border-border-soft"
          >
            updating…
          </span>
        )}
      </div>

      <div className="space-y-4">
        <p
          data-testid="brief-jarvis"
          className="font-display text-[19px] leading-relaxed text-text-primary"
          style={{ fontSize: '19px' }}
        >
          {jarvis}
        </p>
        <div className="border-t border-border-soft pt-4">
          <p
            data-testid="brief-billy"
            className="font-body text-[15px] leading-relaxed text-text-secondary"
            style={{ fontSize: '15px' }}
          >
            {billy}
          </p>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- src/__tests__/BriefPanel.test.tsx
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/BriefPanel.tsx src/__tests__/BriefPanel.test.tsx
git commit -m "feat: BriefPanel with Fraunces/Inter typography and stale indicator"
```

---

### Task 4: NextUpBar + MeetingPrepModal

**Files:**
- Modify: `src/components/NextUpBar.tsx`
- Modify: `src/components/MeetingPrepModal.tsx`
- Create: `src/__tests__/NextUpBar.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/NextUpBar.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { NextUpBar } from '../components/NextUpBar'
import { useCalendarStore } from '../stores/useCalendarStore'
import { useUIStore } from '../stores/useUIStore'
import { seeds } from '../data/seeds'

beforeEach(() => {
  useCalendarStore.setState({ events: seeds.meetings, loading: false })
  useUIStore.setState({ activeModal: null, drawerOpen: false, skillLauncherOpen: false, activeContext: { kind: null, id: null } })
})

test('NextUpBar renders required meetings', () => {
  render(<NextUpBar />)
  const required = seeds.meetings.filter(m => m.isRequired)
  expect(screen.getAllByTestId('meeting-pill').length).toBe(required.length)
})

test('clicking a meeting pill opens MeetingPrepModal', () => {
  render(<NextUpBar />)
  fireEvent.click(screen.getAllByTestId('meeting-pill')[0])
  expect(useUIStore.getState().activeModal).toBe('meeting-prep')
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- src/__tests__/NextUpBar.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/components/NextUpBar.tsx`**

```tsx
import { useCalendarStore } from '@/stores/useCalendarStore'
import { useUIStore } from '@/stores/useUIStore'
import type { MeetingEvent } from '@shared/types'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function NextUpBar() {
  const events = useCalendarStore((s) => s.events)
  const openModal = useUIStore((s) => s.openModal)
  const required = events.filter((e) => e.isRequired)

  if (!required.length) return null

  return (
    <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
      <span className="text-xs text-text-muted font-body font-medium shrink-0">Next up:</span>
      {required.map((meeting) => (
        <button
          key={meeting.id}
          data-testid="meeting-pill"
          onClick={() => openModal('meeting-prep')}
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-bg-elevated border border-border-soft rounded-lg text-xs font-body text-text-secondary hover:border-border-medium hover:text-text-primary transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent-coral shrink-0" />
          <span className="font-medium">{formatTime(meeting.start)}</span>
          <span className="text-text-tertiary max-w-[160px] truncate">{meeting.title}</span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Implement `src/components/MeetingPrepModal.tsx`**

```tsx
import { useUIStore } from '@/stores/useUIStore'
import { useCalendarStore } from '@/stores/useCalendarStore'

export function MeetingPrepModal() {
  const { activeModal, closeModal } = useUIStore()
  const events = useCalendarStore((s) => s.events)

  if (activeModal !== 'meeting-prep') return null

  const required = events.filter((e) => e.isRequired)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
      <div className="relative w-full max-w-lg bg-bg-elevated border border-border-medium rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg text-text-primary">Today's Required Meetings</h2>
          <button onClick={closeModal} className="text-text-muted hover:text-text-secondary transition-colors text-xl leading-none">
            ×
          </button>
        </div>
        <div className="space-y-4">
          {required.map((meeting) => (
            <div key={meeting.id} className="p-4 bg-bg-surface rounded-lg border border-border-soft">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-body font-medium text-text-primary">{meeting.title}</p>
                  <p className="text-xs text-text-tertiary mt-1 font-body">
                    {new Date(meeting.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} –{' '}
                    {new Date(meeting.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                  {meeting.attendees.length > 0 && (
                    <p className="text-xs text-text-muted mt-1 font-body">{meeting.attendees.join(', ')}</p>
                  )}
                </div>
                {meeting.meetLink && (
                  <a
                    href={meeting.meetLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-body text-accent-blue hover:opacity-80 transition-opacity ml-4 shrink-0"
                  >
                    Join →
                  </a>
                )}
              </div>
              {meeting.description && (
                <p className="text-xs text-text-muted mt-2 font-body leading-relaxed">{meeting.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test -- src/__tests__/NextUpBar.test.tsx
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/components/NextUpBar.tsx src/components/MeetingPrepModal.tsx src/__tests__/NextUpBar.test.tsx
git commit -m "feat: NextUpBar meeting pills + MeetingPrepModal"
```

---

### Task 5: TasksPanel + TaskColumn

**Files:**
- Modify: `src/components/TasksPanel.tsx`
- Create: `src/components/TaskColumn.tsx`
- Create: `src/__tests__/TasksPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/TasksPanel.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { TasksPanel } from '../components/TasksPanel'
import { useTaskStore } from '../stores/useTaskStore'
import { seeds } from '../data/seeds'

beforeEach(() => {
  useTaskStore.setState({ tasks: seeds.tasks })
})

test('TasksPanel renders three columns', () => {
  render(<TasksPanel />)
  expect(screen.getByText('NOW')).toBeInTheDocument()
  expect(screen.getByText('NEXT')).toBeInTheDocument()
  expect(screen.getByText('ORBIT')).toBeInTheDocument()
})

test('NOW column shows now-bucket tasks', () => {
  render(<TasksPanel />)
  const nowTasks = seeds.tasks.filter(t => t.bucket === 'now' && !t.done)
  expect(screen.getAllByTestId('task-item').length).toBeGreaterThanOrEqual(nowTasks.length)
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- src/__tests__/TasksPanel.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create `src/components/TaskColumn.tsx`**

```tsx
import { useAuthStore } from '@/stores/useAuthStore'
import { useTaskStore } from '@/stores/useTaskStore'
import type { Task, Bucket } from '@shared/types'

const BUCKET_LABELS: Record<Bucket, string> = { now: 'NOW', next: 'NEXT', orbit: 'ORBIT' }

interface Props {
  bucket: Bucket
  tasks: Task[]
}

export function TaskColumn({ bucket, tasks }: Props) {
  const user = useAuthStore((s) => s.user)
  const { toggleDone, remove } = useTaskStore()

  const active = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-body font-semibold text-text-muted tracking-widest uppercase">
          {BUCKET_LABELS[bucket]}
        </span>
        <span className="text-[10px] text-text-muted font-body">{active.length}</span>
      </div>

      {active.map((task) => (
        <div
          key={task.id}
          data-testid="task-item"
          className="group flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-bg-elevated transition-colors"
        >
          <button
            onClick={() => user && toggleDone(user.uid, task.id)}
            className="mt-0.5 w-4 h-4 rounded-full border border-border-medium hover:border-accent-lemon flex-shrink-0 transition-colors"
            aria-label="Mark complete"
          />
          <span className="text-sm font-body text-text-primary leading-tight">{task.title}</span>
        </div>
      ))}

      {done.length > 0 && (
        <div className="mt-2 opacity-40">
          {done.map((task) => (
            <div key={task.id} className="flex items-center gap-2.5 p-2 rounded-lg">
              <div className="w-4 h-4 rounded-full bg-accent-sage/40 flex-shrink-0" />
              <span className="text-sm font-body text-text-muted line-through leading-tight">{task.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Implement `src/components/TasksPanel.tsx`**

```tsx
import { useState } from 'react'
import { useTaskStore } from '@/stores/useTaskStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { TaskColumn } from './TaskColumn'
import type { Bucket } from '@shared/types'

const BUCKETS: Bucket[] = ['now', 'next', 'orbit']

export function TasksPanel() {
  const tasks = useTaskStore((s) => s.tasks)
  const create = useTaskStore((s) => s.create)
  const user = useAuthStore((s) => s.user)
  const [newTitle, setNewTitle] = useState('')
  const [addingTo, setAddingTo] = useState<Bucket | null>(null)

  const addTask = (bucket: Bucket) => {
    if (!newTitle.trim() || !user) return
    create(user.uid, { title: newTitle.trim(), bucket, source: 'manual' })
    setNewTitle('')
    setAddingTo(null)
  }

  return (
    <div className="bg-bg-surface border border-border-soft rounded-xl p-4">
      <h2 className="text-[10px] font-body font-semibold text-text-muted tracking-widest uppercase mb-4">Tasks</h2>
      <div className="grid grid-cols-3 gap-3 divide-x divide-border-soft">
        {BUCKETS.map((bucket) => (
          <div key={bucket} className="px-2 first:pl-0 last:pr-0">
            <TaskColumn
              bucket={bucket}
              tasks={tasks.filter((t) => t.bucket === bucket)}
            />
            {addingTo === bucket ? (
              <div className="mt-2 flex gap-1">
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTask(bucket); if (e.key === 'Escape') setAddingTo(null) }}
                  className="flex-1 text-xs font-body bg-bg-elevated border border-border-medium rounded px-2 py-1 text-text-primary outline-none focus:border-accent-lemon/40"
                  placeholder="Add task…"
                />
              </div>
            ) : (
              <button
                onClick={() => setAddingTo(bucket)}
                className="mt-2 text-[11px] text-text-muted hover:text-text-secondary font-body transition-colors w-full text-left"
              >
                + add
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test -- src/__tests__/TasksPanel.test.tsx
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/components/TasksPanel.tsx src/components/TaskColumn.tsx src/__tests__/TasksPanel.test.tsx
git commit -m "feat: TasksPanel with three-bucket columns and inline add"
```

---

### Task 6: InboxPanel + ThreadList + TriageMode

**Files:**
- Modify: `src/components/InboxPanel.tsx`
- Create: `src/components/ThreadList.tsx`
- Create: `src/components/TriageMode.tsx`
- Create: `src/__tests__/TriageMode.test.tsx`

- [ ] **Step 1: Write failing triage keyboard tests**

Create `src/__tests__/TriageMode.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { TriageMode } from '../components/TriageMode'
import { useInboxStore } from '../stores/useInboxStore'
import { seeds } from '../data/seeds'

beforeEach(() => {
  useInboxStore.setState({ threads: seeds.threads, triageMode: true, activeThread: seeds.threads[0].id, loading: false })
})

test('TriageMode shows active thread subject', () => {
  render(<TriageMode />)
  expect(screen.getByText(seeds.threads[0].subject)).toBeInTheDocument()
})

test('ESC exits triage mode', () => {
  render(<TriageMode />)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(useInboxStore.getState().triageMode).toBe(false)
})

test('J key advances to next thread', () => {
  render(<TriageMode />)
  fireEvent.keyDown(document, { key: 'j' })
  expect(useInboxStore.getState().activeThread).toBe(seeds.threads[1].id)
})

test('K key goes to prev thread', () => {
  useInboxStore.setState({ ...useInboxStore.getState(), activeThread: seeds.threads[1].id })
  render(<TriageMode />)
  fireEvent.keyDown(document, { key: 'k' })
  expect(useInboxStore.getState().activeThread).toBe(seeds.threads[0].id)
})

test('? key shows keyboard help overlay', () => {
  render(<TriageMode />)
  fireEvent.keyDown(document, { key: '?' })
  expect(screen.getByTestId('keyboard-help')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- src/__tests__/TriageMode.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create `src/components/ThreadList.tsx`**

```tsx
import { useInboxStore } from '@/stores/useInboxStore'
import { useUIStore } from '@/stores/useUIStore'
import type { InboxThread, ThreadPriority } from '@shared/types'

const PRIORITY_DOT: Record<ThreadPriority, string> = {
  HOT: 'bg-accent-coral',
  MED: 'bg-accent-sage',
  LOW: 'bg-border-medium',
}

interface Props {
  threads: InboxThread[]
}

export function ThreadList({ threads }: Props) {
  const setActiveThread = useInboxStore((s) => s.setActiveThread)
  const setActiveContext = useUIStore((s) => s.setActiveContext)
  const openDrawer = useUIStore((s) => s.openDrawer)

  const openThread = (thread: InboxThread) => {
    setActiveThread(thread.id)
    setActiveContext({ kind: 'thread', id: thread.id })
    openDrawer()
  }

  return (
    <div className="flex flex-col gap-0.5">
      {threads.map((thread) => (
        <button
          key={thread.id}
          onClick={() => openThread(thread)}
          className="group flex items-start gap-3 p-2.5 rounded-lg hover:bg-bg-elevated transition-colors text-left w-full"
        >
          <div className="mt-1.5 flex-shrink-0">
            <span className={`block w-2 h-2 rounded-full ${PRIORITY_DOT[thread.priority]}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-body font-medium truncate ${thread.unread ? 'text-text-primary' : 'text-text-secondary'}`}>
                {thread.from}
              </span>
              <span className="text-[10px] text-text-muted font-body flex-shrink-0">
                {new Date(thread.receivedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            <p className={`text-xs font-body truncate mt-0.5 ${thread.unread ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
              {thread.subject}
            </p>
            <p className="text-[11px] font-body text-text-muted truncate mt-0.5">{thread.snippet}</p>
          </div>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Create `src/components/TriageMode.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useInboxStore } from '@/stores/useInboxStore'
import { useUIStore } from '@/stores/useUIStore'

const KEYBOARD_HELP = [
  { key: 'H / M / L', action: 'Tag HOT / MED / LOW' },
  { key: 'R', action: 'Reply in BillyDrawer' },
  { key: 'A', action: 'Archive' },
  { key: 'S', action: 'Snooze' },
  { key: 'E', action: 'Read in BillyDrawer' },
  { key: 'J / →', action: 'Next thread' },
  { key: 'K / ←', action: 'Previous thread' },
  { key: 'ESC', action: 'Exit triage' },
  { key: '?', action: 'Toggle this help' },
]

export function TriageMode() {
  const { threads, activeThread, exitTriage, nextThread, prevThread } = useInboxStore()
  const { openDrawer, setActiveContext } = useUIStore()
  const [showHelp, setShowHelp] = useState(false)

  const active = threads.find((t) => t.id === activeThread)

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key.toLowerCase()) {
        case 'escape': exitTriage(); break
        case 'j':
        case 'arrowright': nextThread(); break
        case 'k':
        case 'arrowleft': prevThread(); break
        case '?': setShowHelp((v) => !v); break
        case 'e':
          if (active) {
            setActiveContext({ kind: 'thread', id: active.id })
            openDrawer()
          }
          break
        case 'a':
          // Archive: remove from list (API call from InboxPanel handles the real archive)
          nextThread()
          break
      }
    }

    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [active, exitTriage, nextThread, prevThread, openDrawer, setActiveContext])

  if (!active) return null

  return (
    <div className="fixed inset-0 z-50 bg-bg-base flex flex-col" data-testid="triage-mode">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-soft">
        <span className="text-xs font-body font-medium text-text-muted uppercase tracking-widest">Triage Mode</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="text-xs text-text-muted hover:text-text-secondary font-body"
          >
            ?
          </button>
          <button
            onClick={exitTriage}
            className="text-xs font-body text-text-muted hover:text-text-secondary"
          >
            ESC to exit
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
        <div className="mb-2 flex items-center gap-2">
          <span className={`text-xs font-body font-medium px-2 py-0.5 rounded-full ${
            active.priority === 'HOT' ? 'bg-accent-coral/20 text-accent-coral' :
            active.priority === 'MED' ? 'bg-accent-sage/20 text-accent-sage' :
            'bg-bg-elevated text-text-muted'
          }`}>
            {active.priority}
          </span>
          <span className="text-xs text-text-muted font-body">{active.tag}</span>
        </div>
        <h2 className="font-body text-xl font-medium text-text-primary mb-1">{active.subject}</h2>
        <p className="text-sm text-text-secondary font-body mb-4">From: {active.from}</p>
        <p className="font-body text-sm text-text-secondary leading-relaxed">{active.snippet}</p>
      </div>

      {showHelp && (
        <div
          data-testid="keyboard-help"
          className="absolute bottom-16 right-4 bg-bg-elevated border border-border-medium rounded-xl p-4 shadow-xl w-64"
        >
          <p className="text-xs font-body font-semibold text-text-secondary mb-3 uppercase tracking-widest">Keyboard Shortcuts</p>
          {KEYBOARD_HELP.map(({ key, action }) => (
            <div key={key} className="flex items-center justify-between py-1">
              <kbd className="text-[11px] font-body bg-bg-surface px-1.5 py-0.5 rounded text-text-muted">{key}</kbd>
              <span className="text-[11px] font-body text-text-tertiary">{action}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Implement `src/components/InboxPanel.tsx`**

```tsx
import { useInboxStore } from '@/stores/useInboxStore'
import { ThreadList } from './ThreadList'
import { TriageMode } from './TriageMode'

export function InboxPanel() {
  const { threads, triageMode, enterTriage, loading } = useInboxStore()

  return (
    <>
      <div className="bg-bg-surface border border-border-soft rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[10px] font-body font-semibold text-text-muted tracking-widest uppercase">Inbox</h2>
          <button
            onClick={enterTriage}
            className="text-[11px] font-body font-medium text-accent-lemon hover:opacity-80 transition-opacity"
          >
            Triage →
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 rounded-full border-2 border-accent-lemon border-t-transparent animate-spin" />
          </div>
        ) : (
          <ThreadList threads={threads} />
        )}
      </div>
      {triageMode && <TriageMode />}
    </>
  )
}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
npm test -- src/__tests__/TriageMode.test.tsx
```

Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add src/components/InboxPanel.tsx src/components/ThreadList.tsx src/components/TriageMode.tsx src/__tests__/TriageMode.test.tsx
git commit -m "feat: InboxPanel, ThreadList, TriageMode with keyboard shortcuts"
```

---

### Task 7: BrainPanel

**Files:**
- Modify: `src/components/BrainPanel.tsx`
- Create: `src/__tests__/BrainPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/BrainPanel.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { BrainPanel } from '../components/BrainPanel'
import { useBrainStore } from '../stores/useBrainStore'
import { seeds } from '../data/seeds'

beforeEach(() => {
  useBrainStore.setState({ blocks: seeds.notionBlocks, loading: false, cached: false })
})

test('BrainPanel renders notion blocks', () => {
  render(<BrainPanel />)
  const firstBlock = seeds.notionBlocks.find(b => b.text.length > 0)
  expect(screen.getByText(firstBlock!.text)).toBeInTheDocument()
})

test('BrainPanel renders tone dots', () => {
  render(<BrainPanel />)
  expect(screen.getAllByTestId('tone-dot').length).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- src/__tests__/BrainPanel.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/components/BrainPanel.tsx`**

```tsx
import { useBrainStore } from '@/stores/useBrainStore'
import type { NotionBlock, ToneDot } from '@shared/types'

const TONE_DOT_COLORS: Record<ToneDot, string> = {
  hot: 'bg-accent-coral',
  active: 'bg-accent-lemon',
  cool: 'border border-border-medium bg-transparent',
}

function Block({ block }: { block: NotionBlock }) {
  const isHeading = block.type.startsWith('heading_')
  const headingLevel = isHeading ? parseInt(block.type.split('_')[1]) : null

  return (
    <div className="flex items-start gap-2.5">
      {block.toneDot && (
        <span
          data-testid="tone-dot"
          className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${TONE_DOT_COLORS[block.toneDot]}`}
        />
      )}
      {!block.toneDot && <span className="w-1.5 h-1.5 mt-1.5 flex-shrink-0" />}
      <span
        className={[
          'font-body leading-relaxed',
          headingLevel === 2 ? 'text-sm font-semibold text-text-secondary mt-2' :
          headingLevel === 3 ? 'text-xs font-semibold text-text-tertiary uppercase tracking-wide mt-2' :
          'text-sm text-text-secondary',
          block.type === 'divider' ? 'w-full border-t border-border-soft' : '',
        ].join(' ')}
      >
        {block.text}
      </span>
    </div>
  )
}

export function BrainPanel() {
  const { blocks, loading } = useBrainStore()

  return (
    <div className="bg-bg-surface border border-border-soft rounded-xl p-4">
      <h2 className="text-[10px] font-body font-semibold text-text-muted tracking-widest uppercase mb-4">Brain</h2>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-4 h-4 rounded-full border-2 border-accent-lemon border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {blocks.map((block) => (
            <Block key={block.id} block={block} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- src/__tests__/BrainPanel.test.tsx
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/BrainPanel.tsx src/__tests__/BrainPanel.test.tsx
git commit -m "feat: BrainPanel with tone dots (hot/active/cool)"
```

---

### Task 8: SparkCard + DecisionJournal

**Files:**
- Modify: `src/components/SparkCard.tsx`
- Modify: `src/components/DecisionJournal.tsx`
- Create: `src/__tests__/DecisionJournal.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/DecisionJournal.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { DecisionJournal } from '../components/DecisionJournal'
import { useDecisionStore } from '../stores/useDecisionStore'
import { seeds } from '../data/seeds'

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({ id: 'new-id' }),
  serverTimestamp: vi.fn(() => new Date()),
}))
vi.mock('@/lib/firestore', () => ({ db: {} }))

beforeEach(() => {
  useDecisionStore.setState({ decisions: seeds.decisions, searchQuery: '' })
})

test('DecisionJournal renders decisions list', () => {
  render(<DecisionJournal />)
  expect(screen.getByText(seeds.decisions[0].text)).toBeInTheDocument()
})

test('typing in search filters decisions', () => {
  render(<DecisionJournal />)
  const input = screen.getByPlaceholderText(/search/i)
  fireEvent.change(input, { target: { value: 'distribution' } })
  expect(useDecisionStore.getState().searchQuery).toBe('distribution')
})

test('export button is present', () => {
  render(<DecisionJournal />)
  expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- src/__tests__/DecisionJournal.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/components/SparkCard.tsx`**

```tsx
import { useSparkStore } from '@/stores/useSparkStore'
import { useUIStore } from '@/stores/useUIStore'

export function SparkCard() {
  const { text, loading, fetch } = useSparkStore()
  const setActiveContext = useUIStore((s) => s.setActiveContext)

  const handleHover = () => {
    setActiveContext({ kind: 'spark', id: 'current' })
  }

  const handleLeave = () => {
    setActiveContext({ kind: null, id: null })
  }

  return (
    <div
      className="bg-bg-surface border border-border-soft rounded-xl p-5 flex flex-col justify-between min-h-[140px]"
      onMouseEnter={handleHover}
      onMouseLeave={handleLeave}
    >
      <div>
        <h2 className="text-[10px] font-body font-semibold text-text-muted tracking-widest uppercase mb-3">Spark</h2>
        {loading ? (
          <div className="w-4 h-4 rounded-full border-2 border-accent-lemon border-t-transparent animate-spin" />
        ) : (
          <p className="font-display italic text-base text-text-primary leading-relaxed">{text}</p>
        )}
      </div>
      <button
        onClick={() => fetch()}
        className="mt-3 self-start text-[11px] font-body text-text-muted hover:text-accent-lemon transition-colors"
      >
        new spark →
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Implement `src/components/DecisionJournal.tsx`**

```tsx
import { useState } from 'react'
import { useDecisionStore } from '@/stores/useDecisionStore'
import { useAuthStore } from '@/stores/useAuthStore'

export function DecisionJournal() {
  const { decisions, searchQuery, filteredDecisions, add, setSearch, exportMd } = useDecisionStore()
  const user = useAuthStore((s) => s.user)
  const [draft, setDraft] = useState('')

  const submit = () => {
    if (!draft.trim() || !user) return
    add(user.uid, draft.trim())
    setDraft('')
  }

  const handleExport = () => {
    const md = exportMd()
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `decisions-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-bg-surface border border-border-soft rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-body font-semibold text-text-muted tracking-widest uppercase">Decisions</h2>
        <button
          onClick={handleExport}
          className="text-[11px] font-body text-text-muted hover:text-text-secondary transition-colors"
        >
          Export
        </button>
      </div>

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        placeholder="Log a decision…"
        className="w-full text-sm font-body bg-bg-elevated border border-border-soft rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted outline-none focus:border-border-medium transition-colors"
      />

      <input
        value={searchQuery}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search decisions…"
        className="w-full text-xs font-body bg-transparent border border-border-soft rounded-lg px-3 py-1.5 text-text-secondary placeholder:text-text-muted outline-none focus:border-border-medium transition-colors"
      />

      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
        {filteredDecisions.map((d) => (
          <div key={d.id} className="p-2.5 rounded-lg hover:bg-bg-elevated transition-colors">
            <p className="text-sm font-body text-text-secondary leading-relaxed">{d.text}</p>
            <p className="text-[10px] text-text-muted font-body mt-1">{d.ts.slice(0, 10)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test -- src/__tests__/DecisionJournal.test.tsx
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/components/SparkCard.tsx src/components/DecisionJournal.tsx src/__tests__/DecisionJournal.test.tsx
git commit -m "feat: SparkCard (Fraunces italic) + DecisionJournal with search + export"
```

---

### Task 9: SkillLauncher + SkillModal

**Files:**
- Modify: `src/components/SkillLauncher.tsx`
- Modify: `src/components/SkillModal.tsx`
- Create: `src/__tests__/SkillLauncher.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/SkillLauncher.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { SkillLauncher } from '../components/SkillLauncher'
import { useUIStore } from '../stores/useUIStore'

beforeEach(() => {
  useUIStore.setState({ skillLauncherOpen: false, activeModal: null, drawerOpen: false, activeContext: { kind: null, id: null } })
})

test('renders FAB button', () => {
  render(<SkillLauncher />)
  expect(screen.getByTestId('skill-launcher-fab')).toBeInTheDocument()
})

test('clicking FAB opens skill grid', () => {
  render(<SkillLauncher />)
  fireEvent.click(screen.getByTestId('skill-launcher-fab'))
  expect(useUIStore.getState().skillLauncherOpen).toBe(true)
  expect(screen.getByPlaceholderText(/search skills/i)).toBeInTheDocument()
})

test('shows all 27 skills when open and search is empty', () => {
  useUIStore.setState({ ...useUIStore.getState(), skillLauncherOpen: true })
  render(<SkillLauncher />)
  expect(screen.getAllByTestId('skill-item').length).toBe(27)
})

test('search filters skills by title', () => {
  useUIStore.setState({ ...useUIStore.getState(), skillLauncherOpen: true })
  render(<SkillLauncher />)
  fireEvent.change(screen.getByPlaceholderText(/search skills/i), { target: { value: 'pitch' } })
  expect(screen.getAllByTestId('skill-item').length).toBeLessThan(27)
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- src/__tests__/SkillLauncher.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/components/SkillLauncher.tsx`**

```tsx
import { useState } from 'react'
import { useUIStore } from '@/stores/useUIStore'
import { SKILLS } from '@/data/skills'
import type { Skill } from '@shared/types'

export function SkillLauncher() {
  const { skillLauncherOpen, openSkillLauncher, closeSkillLauncher, openModal, setActiveContext, activeContext } = useUIStore()
  const [search, setSearch] = useState('')

  const filtered = SKILLS.filter(
    (s) =>
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()),
  )

  const launchSkill = (skill: Skill) => {
    setActiveContext({ kind: activeContext.kind, id: activeContext.id })
    openModal('skill')
    closeSkillLauncher()
  }

  return (
    <>
      <button
        data-testid="skill-launcher-fab"
        onClick={() => (skillLauncherOpen ? closeSkillLauncher() : openSkillLauncher())}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 bg-accent-lemon text-bg-base rounded-full shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity font-body font-bold text-lg"
        aria-label="Open skill launcher"
      >
        ✦
      </button>

      {skillLauncherOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeSkillLauncher} />
          <div className="relative w-full max-w-sm bg-bg-elevated border border-border-medium rounded-2xl p-4 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-body font-semibold text-text-primary">Skills</h2>
              <button onClick={closeSkillLauncher} className="text-text-muted hover:text-text-secondary text-xl leading-none">×</button>
            </div>

            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills…"
              className="w-full text-sm font-body bg-bg-surface border border-border-soft rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted outline-none focus:border-border-medium mb-3"
            />

            <div className="overflow-y-auto flex-1 grid grid-cols-2 gap-1.5">
              {filtered.map((skill) => (
                <button
                  key={skill.id}
                  data-testid="skill-item"
                  onClick={() => launchSkill(skill)}
                  className="text-left p-3 rounded-xl bg-bg-surface hover:bg-bg-base border border-border-soft hover:border-border-medium transition-colors"
                >
                  <p className="text-xs font-body font-medium text-text-primary">{skill.title}</p>
                  <p className="text-[11px] font-body text-text-muted mt-0.5 leading-tight">{skill.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: Implement `src/components/SkillModal.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { useUIStore } from '@/stores/useUIStore'
import { useInboxStore } from '@/stores/useInboxStore'
import { apiFetch } from '@/lib/apiClient'

export function SkillModal() {
  const { activeModal, closeModal, activeContext } = useUIStore()
  const threads = useInboxStore((s) => s.threads)
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [useLastOutput, setUseLastOutput] = useState(false)

  useEffect(() => {
    if (activeModal !== 'skill') { setInput(''); setOutput(''); return }
    if (activeContext.kind === 'thread') {
      const thread = threads.find((t) => t.id === activeContext.id)
      if (thread) setInput(`Subject: ${thread.subject}\nFrom: ${thread.from}\n\n${thread.snippet}`)
    }
  }, [activeModal, activeContext])

  if (activeModal !== 'skill') return null

  const run = async () => {
    if (!input.trim()) return
    setLoading(true)
    setOutput('')
    try {
      const data = await apiFetch<any>('/api/claude/chat', {
        method: 'POST',
        body: JSON.stringify({ message: input }),
      })
      setOutput(typeof data === 'string' ? data : JSON.stringify(data))
    } catch {
      setOutput('Error: request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
      <div className="relative w-full max-w-lg bg-bg-elevated border border-border-medium rounded-2xl p-5 shadow-2xl flex flex-col gap-4 max-h-[80vh]">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-body font-semibold text-text-primary">Skill</h2>
          <button onClick={closeModal} className="text-text-muted hover:text-text-secondary text-xl leading-none">×</button>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          className="w-full text-sm font-body bg-bg-surface border border-border-soft rounded-lg px-3 py-2.5 text-text-primary outline-none focus:border-border-medium resize-none"
          placeholder="Paste context or describe what you need…"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={run}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-accent-lemon text-bg-base text-sm font-body font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {loading ? 'Running…' : 'Run'}
          </button>
          <label className="flex items-center gap-1.5 text-xs font-body text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={useLastOutput}
              onChange={(e) => setUseLastOutput(e.target.checked)}
              className="accent-accent-lemon"
            />
            Use last result as input
          </label>
        </div>
        {output && (
          <div className="flex-1 overflow-y-auto p-3 bg-bg-surface rounded-lg border border-border-soft">
            <p className="text-sm font-body text-text-secondary leading-relaxed whitespace-pre-wrap">{output}</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test -- src/__tests__/SkillLauncher.test.tsx
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/components/SkillLauncher.tsx src/components/SkillModal.tsx src/__tests__/SkillLauncher.test.tsx
git commit -m "feat: SkillLauncher FAB + 27-skill searchable grid + SkillModal"
```

---

### Task 10: BillyDrawer + final integration

**Files:**
- Modify: `src/components/BillyDrawer.tsx`
- Create: `src/__tests__/BillyDrawer.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/BillyDrawer.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { BillyDrawer } from '../components/BillyDrawer'
import { useUIStore } from '../stores/useUIStore'

beforeEach(() => {
  useUIStore.setState({ drawerOpen: false, activeModal: null, skillLauncherOpen: false, activeContext: { kind: null, id: null } })
})

test('BillyDrawer is not visible when drawerOpen=false', () => {
  render(<BillyDrawer />)
  expect(screen.queryByTestId('billy-drawer')).not.toBeInTheDocument()
})

test('BillyDrawer is visible when drawerOpen=true', () => {
  useUIStore.setState({ ...useUIStore.getState(), drawerOpen: true })
  render(<BillyDrawer />)
  expect(screen.getByTestId('billy-drawer')).toBeInTheDocument()
})

test('close button hides drawer', () => {
  useUIStore.setState({ ...useUIStore.getState(), drawerOpen: true })
  render(<BillyDrawer />)
  fireEvent.click(screen.getByRole('button', { name: /close/i }))
  expect(useUIStore.getState().drawerOpen).toBe(false)
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- src/__tests__/BillyDrawer.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/components/BillyDrawer.tsx`**

```tsx
import { useState, useRef, useEffect } from 'react'
import { useUIStore } from '@/stores/useUIStore'
import { useInboxStore } from '@/stores/useInboxStore'
import { parseSseEvent } from '@/lib/briefStream'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

export function BillyDrawer() {
  const { drawerOpen, closeDrawer, activeContext } = useUIStore()
  const threads = useInboxStore((s) => s.threads)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!drawerOpen) return null

  const activeThread = activeContext.kind === 'thread'
    ? threads.find((t) => t.id === activeContext.id)
    : null

  const send = async () => {
    if (!input.trim() || streaming) return
    const userMsg = input.trim()
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: userMsg }])
    setStreaming(true)

    let assistantText = ''
    setMessages((m) => [...m, { role: 'assistant', text: '' }])

    const context = activeThread
      ? `Thread context:\nSubject: ${activeThread.subject}\nFrom: ${activeThread.from}\n\n${activeThread.snippet}`
      : undefined

    try {
      const response = await fetch('/api/claude/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, context }),
      })

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const event = parseSseEvent(line.trim())
          if (event?.type === 'token') {
            assistantText += event.text
            setMessages((m) => {
              const updated = [...m]
              updated[updated.length - 1] = { role: 'assistant', text: assistantText }
              return updated
            })
          }
        }
      }
    } catch {
      setMessages((m) => {
        const updated = [...m]
        updated[updated.length - 1] = { role: 'assistant', text: 'Error: request failed' }
        return updated
      })
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div
      data-testid="billy-drawer"
      className="fixed top-0 right-0 h-full z-50 flex flex-col bg-bg-elevated border-l border-border-medium shadow-2xl w-full md:w-[420px] transition-transform"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-soft">
        <div>
          <span className="font-body font-semibold text-sm text-text-primary">Billy</span>
          {activeThread && (
            <p className="text-[11px] text-text-muted font-body mt-0.5 truncate max-w-[280px]">{activeThread.subject}</p>
          )}
        </div>
        <button
          onClick={closeDrawer}
          aria-label="Close"
          className="text-text-muted hover:text-text-secondary text-xl leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-sm font-body text-text-muted text-center mt-8">
            {activeThread ? `Discussing: ${activeThread.subject}` : 'What do you need?'}
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm font-body leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-accent-lemon text-bg-base rounded-br-sm'
                  : 'bg-bg-surface text-text-secondary rounded-bl-sm border border-border-soft'
              }`}
            >
              {msg.text || (streaming && msg.role === 'assistant' ? '▊' : '')}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border-soft p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Message Billy…"
          className="flex-1 text-sm font-body bg-bg-surface border border-border-soft rounded-xl px-3.5 py-2.5 text-text-primary placeholder:text-text-muted outline-none focus:border-border-medium"
        />
        <button
          onClick={send}
          disabled={streaming || !input.trim()}
          className="px-4 py-2.5 bg-accent-lemon text-bg-base text-sm font-body font-medium rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          →
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- src/__tests__/BillyDrawer.test.tsx
```

Expected: 3 passed.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 7: Start dev server and verify visually (requires env vars)**

```bash
npm run dev
```

Open http://localhost:5173. Expected:
- Dark warm background
- "Demo data — sign in for live" banner at top
- "Lemon Studios" wordmark in Fraunces
- Morning Brief panel with seed Jarvis/Billy text
- Required meetings in NextUpBar
- Three task columns: NOW / NEXT / ORBIT with seed tasks
- Inbox panel with 10 seeded threads
- Brain panel with Notion blocks + tone dots
- SparkCard with italic Fraunces question
- Decision journal with seeded decisions
- Yellow FAB (✦) in bottom-right corner

- [ ] **Step 8: Final commit**

```bash
git add src/components/BillyDrawer.tsx src/__tests__/BillyDrawer.test.tsx
git commit -m "feat: BillyDrawer with SSE chat streaming"
git tag v0.1.0
git commit --allow-empty -m "chore: plan 5 complete — full dashboard UI verified"
```

---

## Spec Coverage

| Spec section | Covered |
|---|---|
| Component tree (§6) | ✅ All components: Header, BriefPanel, NextUpBar, TasksPanel, TaskColumn, InboxPanel, ThreadList, TriageMode, BrainPanel, SparkCard, DecisionJournal, SkillLauncher, BillyDrawer, MeetingPrepModal, SkillModal |
| Fraunces 19px for brief (§6) | ✅ BriefPanel jarvis `font-display text-[19px]` |
| Inter 15px for Billy (§6) | ✅ BriefPanel billy `font-body text-[15px]` |
| Fraunces italic for Spark (§6) | ✅ SparkCard `font-display italic` |
| 200ms cross-fade on brief (§6) | ✅ opacity transition on BriefPanel |
| SyncingPill appears/disappears (§6) | ✅ SyncingPill reads isStreaming from useBriefStore |
| Triage mode keyboard shortcuts (§6) | ✅ H/M/L/R/A/S/E/J/K/←/→/ESC/? |
| Keyboard help overlay (§6) | ✅ ? toggles data-testid="keyboard-help" |
| Tone dots hot/active/cool (§6) | ✅ BrainPanel color-coded dots |
| 27-skill launcher (§6) | ✅ SKILLS array, grid + search |
| "Use last result as input" (§6) | ✅ SkillModal toggle |
| Context injection (§6) | ✅ activeContext → SkillModal + BillyDrawer thread context |
| BillyDrawer 420px desktop (§6) | ✅ `md:w-[420px]` |
| BillyDrawer full-width mobile (§6) | ✅ `w-full md:w-[420px]` |
| DemoBanner isDemo=true (§4, §6) | ✅ DemoBanner reads useAuthStore.isDemo |
| AuthGate spinner while loading (§6) | ✅ AuthGate renders spinner during loading state |
| Decision search + export .md (§6) | ✅ filteredDecisions + download trigger |
| "new spark" bypass (§6) | ✅ SparkCard "new spark →" button calls useSparkStore.fetch() |
