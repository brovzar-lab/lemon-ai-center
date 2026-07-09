# Inbox Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A keyboard-driven full-screen triage deck that flips through HOT inbox threads, each showing a reply drafted in Billy's voice, with show-then-send + a 5-second unsend.

**Architecture:** A new client deck (`CopilotTriage`) reads HOT threads from the existing `useInboxStore` and per-thread draft state from a new `useCopilotStore`. Phase 1 drafts on demand by reusing the existing `POST /api/claude/draft-reply` (SSE) and sends via the existing `POST /api/gmail/send`, holding each send 5s client-side so it is undoable. Phase 2 pre-generates drafts for reply-owed HOT threads during the inbox scan, caches them under `users/{uid}/copilotDrafts/{threadId}`, and the deck reads that cache first via a new `GET /api/copilot/drafts`.

**Tech Stack:** React 18 + Zustand + Tailwind (frontend), Express + TypeScript + firebase-admin (backend), Vitest, `@anthropic-ai/sdk` 0.110, `CLAUDE_MODELS.balanced` (Sonnet 5, `thinking: disabled`).

## Global Constraints

- Model tier for all drafting is `CLAUDE_MODELS.balanced` from `@shared/models`; every call passes `thinking: { type: 'disabled' }` and reuses the SDK 0.110 stream pattern (`stream.on('text', ...)` + `await stream.finalMessage()`), never `stream.textStream`.
- Server responses: `{ data: T }` on success, `{ error: { code, message, retryable } }` on failure.
- All `/api/*` routes use `requireAuth`; write routes use `csrfCheck`. Send stays behind `gmailSendLimit`.
- Styling obeys `DESIGN.md`: no warm/brown/cream/amber/gold. Use existing tokens (`bg-surface`, `border-line`, `text-ink`, `text-ink-2/3`, `bg-accent`, `bg-data-coral`, `bg-data-teal`).
- Types shared by client and server live in `shared/`, never duplicated.
- Tests mock `@anthropic-ai/sdk` with the 0.110 MessageStream shape (`on('text')` + `finalMessage()`), per `server/routes/claude.test.ts` and `server/routes/draftReply.test.ts`.
- Source of truth: `docs/superpowers/specs/2026-07-08-inbox-copilot-design.md`.

---

# Phase 1 — Desktop keyboard deck with on-demand drafts

Deliverable: open the deck from the inbox, flip HOT threads by key, each card drafts a reply on demand, send is held 5s and undoable, edit inline, skip. No caching yet.

### Task 1: `extractEmail` helper (shared, DRY with Dashboard)

`Dashboard.tsx:170-171` already parses a real email out of a thread `from` header. Factor it into one helper so the deck and Dashboard agree.

**Files:**
- Create: `src/lib/inbox/extractEmail.ts`
- Create: `src/lib/inbox/extractEmail.test.ts`
- Modify: `src/components/Dashboard.tsx:167-179`

**Interfaces:**
- Produces: `extractEmail(from: string, fromDomain: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/inbox/extractEmail.test.ts
import { describe, expect, test } from 'vitest'
import { extractEmail } from './extractEmail'

describe('extractEmail', () => {
  test('pulls the address out of a "Name <addr>" header', () => {
    expect(extractEmail('Ana Lopez <ana@gbm.com>', 'gbm.com')).toBe('ana@gbm.com')
  })
  test('returns a bare address unchanged', () => {
    expect(extractEmail('ana@gbm.com', 'gbm.com')).toBe('ana@gbm.com')
  })
  test('falls back to a dotted name @ domain when there is no address', () => {
    expect(extractEmail('Ana Lopez', 'gbm.com')).toBe('ana.lopez@gbm.com')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/inbox/extractEmail.test.ts`
Expected: FAIL, "Cannot find module './extractEmail'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/inbox/extractEmail.ts
// Extract a real send-to address from a Gmail `From` header
// ("Ana Lopez <ana@gbm.com>" -> "ana@gbm.com"). Mirrors the original
// inline logic from Dashboard (audit note M-6).
export function extractEmail(from: string, fromDomain: string): string {
  const match = from.match(/<([^>]+)>/)
  if (match?.[1]) return match[1]
  if (from.includes('@')) return from.trim()
  return `${from.toLowerCase().replace(/\s/g, '.')}@${fromDomain}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/inbox/extractEmail.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor Dashboard to use it**

In `src/components/Dashboard.tsx`, add `import { extractEmail } from '@/lib/inbox/extractEmail'` and replace lines 170-171:

```tsx
  const handleReply = (thread: InboxThread) => {
    const fromEmail = extractEmail(thread.from, thread.fromDomain)
    setReplyEmail({
      threadId: thread.id,
      from: thread.from,
      fromEmail,
      subject: thread.subject,
      snippet: thread.snippet,
    })
  }
```

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/lib/inbox/extractEmail.ts src/lib/inbox/extractEmail.test.ts src/components/Dashboard.tsx
git commit -m "refactor(inbox): extract extractEmail helper, reuse in Dashboard"
```

---

### Task 2: `sendReply` client helper

**Files:**
- Create: `src/lib/copilot/sendReply.ts`
- Create: `src/lib/copilot/sendReply.test.ts`

**Interfaces:**
- Produces: `sendReply(args: { threadId: string; to: string; subject: string; body: string }): Promise<void>` — resolves on success, throws `Error(message)` on failure.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/copilot/sendReply.test.ts
import { describe, expect, test, vi, afterEach } from 'vitest'
import { sendReply } from './sendReply'

afterEach(() => vi.restoreAllMocks())

describe('sendReply', () => {
  test('POSTs the reply and resolves on ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ data: { sent: true } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(sendReply({ threadId: 't1', to: 'a@b.com', subject: 'Re: Hi', body: 'Hello' }))
      .resolves.toBeUndefined()
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/gmail/send')
    expect(JSON.parse(opts.body)).toEqual({ threadId: 't1', to: 'a@b.com', subject: 'Re: Hi', body: 'Hello' })
    expect(opts.credentials).toBe('include')
  })

  test('throws the server error message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, json: async () => ({ error: { message: 'Send failed' } }),
    }))
    await expect(sendReply({ threadId: 't1', to: 'a@b.com', subject: 'Re', body: 'x' }))
      .rejects.toThrow('Send failed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/copilot/sendReply.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/copilot/sendReply.ts
export async function sendReply(args: {
  threadId: string
  to: string
  subject: string
  body: string
}): Promise<void> {
  const res = await fetch('/api/gmail/send', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || 'Send failed')
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/copilot/sendReply.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/copilot/sendReply.ts src/lib/copilot/sendReply.test.ts
git commit -m "feat(copilot): add sendReply client helper"
```

---

### Task 3: `draftClient` — on-demand draft via SSE

Reuses the SSE contract of `POST /api/claude/draft-reply` (see `ReplyModal.tsx:50-94`). Accumulates tokens and resolves the full draft; calls `onToken` for live streaming into the card.

**Files:**
- Create: `src/lib/copilot/draftClient.ts`
- Create: `src/lib/copilot/draftClient.test.ts`

**Interfaces:**
- Consumes: `extractEmail` (Task 1)
- Produces: `generateDraftForThread(thread: InboxThread, toneTier?: string, onToken?: (text: string) => void): Promise<string>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/copilot/draftClient.test.ts
import { describe, expect, test, vi, afterEach } from 'vitest'
import { generateDraftForThread } from './draftClient'
import type { InboxThread } from '@shared/types'

const thread: InboxThread = {
  id: 't1', subject: 'Cap table', from: 'Ana <ana@gbm.com>', fromDomain: 'gbm.com',
  snippet: 'Can you send it?', unread: true, receivedAt: '2026-07-08T00:00:00Z',
  tag: 'DEAL', priority: 'HOT',
}

function sseBody(events: object[]) {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
  const chunks = [new TextEncoder().encode(text)]
  return { getReader: () => { let i = 0; return { read: async () =>
    i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined } } } }
}

afterEach(() => vi.restoreAllMocks())

describe('generateDraftForThread', () => {
  test('accumulates tokens and resolves the full draft', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, body: sseBody([
        { type: 'token', text: 'Adjunto ' }, { type: 'token', text: 'la tabla.' },
        { type: 'done', draft: 'Adjunto la tabla.' },
      ]),
    }))
    const tokens: string[] = []
    const draft = await generateDraftForThread(thread, 'peer', (t) => tokens.push(t))
    expect(draft).toBe('Adjunto la tabla.')
    expect(tokens).toEqual(['Adjunto ', 'la tabla.'])
  })

  test('throws when the stream emits an error event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, body: sseBody([{ type: 'error', message: 'Draft generation failed' }]),
    }))
    await expect(generateDraftForThread(thread)).rejects.toThrow('Draft generation failed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/copilot/draftClient.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/copilot/draftClient.ts
import type { InboxThread } from '@shared/types'
import { extractEmail } from '@/lib/inbox/extractEmail'

export async function generateDraftForThread(
  thread: InboxThread,
  toneTier = 'peer',
  onToken?: (text: string) => void,
): Promise<string> {
  const res = await fetch('/api/claude/draft-reply', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: {
        from: thread.from,
        fromEmail: extractEmail(thread.from, thread.fromDomain),
        subject: thread.subject,
        snippet: thread.snippet,
      },
      toneTier,
    }),
  })
  if (!res.ok || !res.body) throw new Error('Draft generation failed')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let accumulated = ''
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      let parsed: any
      try { parsed = JSON.parse(line.slice(6)) } catch { continue }
      if (parsed.type === 'token') {
        accumulated += parsed.text
        onToken?.(parsed.text)
      } else if (parsed.type === 'done') {
        accumulated = parsed.draft || accumulated
      } else if (parsed.type === 'error') {
        throw new Error(parsed.message || 'Draft generation failed')
      }
    }
  }
  return accumulated
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/copilot/draftClient.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/copilot/draftClient.ts src/lib/copilot/draftClient.test.ts
git commit -m "feat(copilot): add on-demand draft client (SSE)"
```

---

### Task 4: `useCopilotStore` — deck navigation + draft state

**Files:**
- Create: `src/stores/useCopilotStore.ts`
- Create: `src/stores/useCopilotStore.test.ts`

**Interfaces:**
- Consumes: `generateDraftForThread` (Task 3)
- Produces: store with
  - state: `isOpen: boolean`, `index: number`, `drafts: Record<string, DraftState>` where `DraftState = { text: string; status: 'idle'|'loading'|'ready'|'error'; edited: boolean }`
  - actions: `open(): void`, `close(): void`, `next(count: number): void`, `prev(): void`, `requestDraft(thread: InboxThread): Promise<void>`, `setDraftText(threadId: string, text: string): void`

- [ ] **Step 1: Write the failing test**

```ts
// src/stores/useCopilotStore.test.ts
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/copilot/draftClient', () => ({
  generateDraftForThread: vi.fn().mockResolvedValue('Drafted reply.'),
}))
import { generateDraftForThread } from '@/lib/copilot/draftClient'
import { useCopilotStore } from './useCopilotStore'
import type { InboxThread } from '@shared/types'

const thread = (id: string): InboxThread => ({
  id, subject: 's', from: 'A <a@b.com>', fromDomain: 'b.com', snippet: 'x',
  unread: true, receivedAt: '2026-07-08T00:00:00Z', tag: 'DEAL', priority: 'HOT',
})

beforeEach(() => {
  useCopilotStore.setState({ isOpen: false, index: 0, drafts: {} })
  vi.clearAllMocks()
})
afterEach(() => vi.restoreAllMocks())

describe('useCopilotStore navigation', () => {
  test('open resets to first card; next/prev clamp', () => {
    const s = useCopilotStore.getState()
    s.open()
    expect(useCopilotStore.getState().isOpen).toBe(true)
    expect(useCopilotStore.getState().index).toBe(0)
    s.next(2); s.next(2); s.next(2) // clamp at count-1 = 1
    expect(useCopilotStore.getState().index).toBe(1)
    s.prev(); s.prev()
    expect(useCopilotStore.getState().index).toBe(0)
  })

  test('requestDraft sets loading then ready with text', async () => {
    await useCopilotStore.getState().requestDraft(thread('t1'))
    expect(generateDraftForThread).toHaveBeenCalledOnce()
    expect(useCopilotStore.getState().drafts['t1']).toEqual({
      text: 'Drafted reply.', status: 'ready', edited: false,
    })
  })

  test('requestDraft is a no-op if a draft is already ready', async () => {
    useCopilotStore.setState({ drafts: { t1: { text: 'x', status: 'ready', edited: false } } })
    await useCopilotStore.getState().requestDraft(thread('t1'))
    expect(generateDraftForThread).not.toHaveBeenCalled()
  })

  test('requestDraft sets error status when drafting throws', async () => {
    ;(generateDraftForThread as any).mockRejectedValueOnce(new Error('boom'))
    await useCopilotStore.getState().requestDraft(thread('t2'))
    expect(useCopilotStore.getState().drafts['t2'].status).toBe('error')
  })

  test('setDraftText marks the draft edited', () => {
    useCopilotStore.getState().setDraftText('t1', 'my words')
    expect(useCopilotStore.getState().drafts['t1']).toEqual({
      text: 'my words', status: 'ready', edited: true,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/useCopilotStore.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/stores/useCopilotStore.ts
import { create } from 'zustand'
import type { InboxThread } from '@shared/types'
import { generateDraftForThread } from '@/lib/copilot/draftClient'

export interface DraftState {
  text: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  edited: boolean
}

interface CopilotState {
  isOpen: boolean
  index: number
  drafts: Record<string, DraftState>
  open: () => void
  close: () => void
  next: (count: number) => void
  prev: () => void
  requestDraft: (thread: InboxThread) => Promise<void>
  setDraftText: (threadId: string, text: string) => void
}

export const useCopilotStore = create<CopilotState>()((set, get) => ({
  isOpen: false,
  index: 0,
  drafts: {},

  open: () => set({ isOpen: true, index: 0 }),
  close: () => set({ isOpen: false }),
  next: (count) => set((s) => ({ index: Math.min(s.index + 1, Math.max(0, count - 1)) })),
  prev: () => set((s) => ({ index: Math.max(s.index - 1, 0) })),

  requestDraft: async (thread) => {
    const existing = get().drafts[thread.id]
    if (existing && (existing.status === 'ready' || existing.status === 'loading')) return
    set((s) => ({ drafts: { ...s.drafts, [thread.id]: { text: '', status: 'loading', edited: false } } }))
    try {
      const text = await generateDraftForThread(thread, 'peer', (tok) =>
        set((s) => {
          const d = s.drafts[thread.id]
          if (!d || d.edited) return {}
          return { drafts: { ...s.drafts, [thread.id]: { ...d, text: d.text + tok } } }
        }),
      )
      set((s) => {
        const d = s.drafts[thread.id]
        if (d?.edited) return {}
        return { drafts: { ...s.drafts, [thread.id]: { text, status: 'ready', edited: false } } }
      })
    } catch {
      set((s) => ({ drafts: { ...s.drafts, [thread.id]: { text: '', status: 'error', edited: false } } }))
    }
  },

  setDraftText: (threadId, text) =>
    set((s) => ({ drafts: { ...s.drafts, [threadId]: { text, status: 'ready', edited: true } } })),
}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/stores/useCopilotStore.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/useCopilotStore.ts src/stores/useCopilotStore.test.ts
git commit -m "feat(copilot): deck store with nav and per-thread draft state"
```

---

### Task 5: `useCopilotStore` — 5-second pending-send / unsend queue

Adds the held-send queue to the same store. Timer handles live in a module-level map so state stays serializable.

**Files:**
- Modify: `src/stores/useCopilotStore.ts`
- Modify: `src/stores/useCopilotStore.test.ts`

**Interfaces:**
- Consumes: `sendReply` (Task 2)
- Produces: added state `pending: PendingSend[]` where `PendingSend = { id: string; threadId: string; to: string; subject: string; body: string; status: 'counting'|'sending'|'error' }`; actions `queueSend(args: { threadId: string; to: string; subject: string; body: string }): string` (returns the send id), `undoSend(id: string): void`, `retrySend(id: string): void`. Constant `UNSEND_MS = 5000`.

- [ ] **Step 1: Write the failing test (append to the existing test file)**

```ts
// add to src/stores/useCopilotStore.test.ts
import { UNSEND_MS } from './useCopilotStore'

vi.mock('@/lib/copilot/sendReply', () => ({ sendReply: vi.fn().mockResolvedValue(undefined) }))
import { sendReply } from '@/lib/copilot/sendReply'

describe('useCopilotStore unsend queue', () => {
  beforeEach(() => {
    useCopilotStore.setState({ pending: [] })
    vi.clearAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  const args = { threadId: 't1', to: 'a@b.com', subject: 'Re: s', body: 'Hello' }

  test('queueSend holds for 5s then sends', async () => {
    const id = useCopilotStore.getState().queueSend(args)
    expect(useCopilotStore.getState().pending).toHaveLength(1)
    expect(sendReply).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(UNSEND_MS)
    expect(sendReply).toHaveBeenCalledWith(args)
    expect(useCopilotStore.getState().pending.find((p) => p.id === id)).toBeUndefined()
  })

  test('undoSend within the window cancels the send', async () => {
    const id = useCopilotStore.getState().queueSend(args)
    useCopilotStore.getState().undoSend(id)
    await vi.advanceTimersByTimeAsync(UNSEND_MS)
    expect(sendReply).not.toHaveBeenCalled()
    expect(useCopilotStore.getState().pending).toHaveLength(0)
  })

  test('a failed send is marked error and kept for retry', async () => {
    ;(sendReply as any).mockRejectedValueOnce(new Error('nope'))
    const id = useCopilotStore.getState().queueSend(args)
    await vi.advanceTimersByTimeAsync(UNSEND_MS)
    expect(useCopilotStore.getState().pending.find((p) => p.id === id)?.status).toBe('error')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/useCopilotStore.test.ts`
Expected: FAIL, `UNSEND_MS`/`queueSend` not exported.

- [ ] **Step 3: Extend the implementation**

Add to `src/stores/useCopilotStore.ts`:

```ts
import { sendReply } from '@/lib/copilot/sendReply'

export const UNSEND_MS = 5000

export interface PendingSend {
  id: string
  threadId: string
  to: string
  subject: string
  body: string
  status: 'counting' | 'sending' | 'error'
}

// Timer handles are non-serializable, so keep them out of the store state.
const timers = new Map<string, ReturnType<typeof setTimeout>>()
let seq = 0
```

Add `pending: PendingSend[]` to the `CopilotState` interface and initialize `pending: []`. Add these actions to the interface and the store body:

```ts
  queueSend: (args) => {
    const id = `snd_${Date.now()}_${seq++}`
    set((s) => ({ pending: [...s.pending, { id, ...args, status: 'counting' }] }))
    const fire = async () => {
      timers.delete(id)
      set((s) => ({ pending: s.pending.map((p) => (p.id === id ? { ...p, status: 'sending' } : p)) }))
      try {
        await sendReply(args)
        set((s) => ({ pending: s.pending.filter((p) => p.id !== id) }))
      } catch {
        set((s) => ({ pending: s.pending.map((p) => (p.id === id ? { ...p, status: 'error' } : p)) }))
      }
    }
    timers.set(id, setTimeout(fire, UNSEND_MS))
    return id
  },

  undoSend: (id) => {
    const t = timers.get(id)
    if (t) clearTimeout(t)
    timers.delete(id)
    set((s) => ({ pending: s.pending.filter((p) => p.id !== id) }))
  },

  retrySend: (id) => {
    const p = get().pending.find((x) => x.id === id)
    if (!p) return
    get().undoSend(id)
    get().queueSend({ threadId: p.threadId, to: p.to, subject: p.subject, body: p.body })
  },
```

Add `queueSend: (args: { threadId: string; to: string; subject: string; body: string }) => string`, `undoSend: (id: string) => void`, `retrySend: (id: string) => void` to the `CopilotState` interface.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/stores/useCopilotStore.test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/stores/useCopilotStore.ts src/stores/useCopilotStore.test.ts
git commit -m "feat(copilot): 5-second held-send queue with undo and retry"
```

---

### Task 6: `CopilotTriage` component — card rendering + draft lifecycle

Renders the full-screen deck for HOT threads. Requests a draft for the current card on mount/index change. Keyboard handling comes in Task 7.

**Files:**
- Create: `src/components/CopilotTriage.tsx`
- Create: `src/components/CopilotTriage.test.tsx`

**Interfaces:**
- Consumes: `useInboxStore` (HOT threads), `useCopilotStore` (Tasks 4-5), `extractEmail` (Task 1)
- Produces: `export function CopilotTriage(): JSX.Element | null` — renders null when `!isOpen`; otherwise the deck. Selects HOT threads via `threads.filter((t) => t.priority === 'HOT')`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/CopilotTriage.test.tsx
import { describe, expect, test, beforeEach, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CopilotTriage } from './CopilotTriage'
import { useInboxStore } from '@/stores/useInboxStore'
import { useCopilotStore } from '@/stores/useCopilotStore'
import type { InboxThread } from '@shared/types'

vi.mock('@/lib/copilot/draftClient', () => ({
  generateDraftForThread: vi.fn().mockResolvedValue('Ready draft.'),
}))

const hot = (id: string): InboxThread => ({
  id, subject: `Subject ${id}`, from: `A${id} <a${id}@b.com>`, fromDomain: 'b.com',
  snippet: 'snippet', unread: true, receivedAt: '2026-07-08T00:00:00Z', tag: 'DEAL', priority: 'HOT',
})

beforeEach(() => {
  useInboxStore.setState({ threads: [hot('1'), hot('2'), { ...hot('3'), priority: 'LOW' }], loading: false, error: null })
  useCopilotStore.setState({ isOpen: false, index: 0, drafts: {}, pending: [] })
})
afterEach(() => vi.restoreAllMocks())

describe('CopilotTriage', () => {
  test('renders nothing when closed', () => {
    const { container } = render(<CopilotTriage />)
    expect(container.firstChild).toBeNull()
  })

  test('shows only HOT threads and a position counter', async () => {
    useCopilotStore.setState({ isOpen: true })
    render(<CopilotTriage />)
    expect(await screen.findByText('Subject 1')).toBeInTheDocument()
    expect(screen.getByText('1 of 2')).toBeInTheDocument() // thread 3 is LOW, excluded
  })

  test('shows the calm empty state when there are no HOT threads', () => {
    useInboxStore.setState({ threads: [{ ...hot('3'), priority: 'LOW' }] })
    useCopilotStore.setState({ isOpen: true })
    render(<CopilotTriage />)
    expect(screen.getByText(/Inbox is calm/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/CopilotTriage.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/CopilotTriage.tsx
import { useEffect, useMemo } from 'react'
import { useInboxStore } from '@/stores/useInboxStore'
import { useCopilotStore } from '@/stores/useCopilotStore'

export function CopilotTriage() {
  const isOpen = useCopilotStore((s) => s.isOpen)
  const index = useCopilotStore((s) => s.index)
  const drafts = useCopilotStore((s) => s.drafts)
  const requestDraft = useCopilotStore((s) => s.requestDraft)
  const close = useCopilotStore((s) => s.close)
  const threads = useInboxStore((s) => s.threads)

  const hotThreads = useMemo(() => threads.filter((t) => t.priority === 'HOT'), [threads])
  const current = hotThreads[index]

  useEffect(() => {
    if (isOpen && current) requestDraft(current)
  }, [isOpen, current, requestDraft])

  if (!isOpen) return null

  if (hotThreads.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-bg/95 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="font-display text-xl text-ink">Inbox is calm</p>
          <p className="text-sm text-ink-3">No hot threads right now.</p>
          <button onClick={close} className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            Close
          </button>
        </div>
      </div>
    )
  }

  const draft = current ? drafts[current.id] : undefined

  return (
    <div className="fixed inset-0 z-50 bg-bg/95 flex flex-col items-center justify-center p-6" data-testid="copilot-deck">
      <div className="w-full max-w-2xl bg-surface border border-line rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-sans text-ink-3">{index + 1} of {hotThreads.length}</span>
          <button onClick={close} className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Esc</button>
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">{current.subject}</h3>
          <p className="text-sm text-ink-2 mt-1">{current.from}</p>
          <p className="text-sm text-ink-3 mt-2">{current.snippet}</p>
        </div>
        <div className="border-t border-line pt-4">
          {!draft || draft.status === 'loading' ? (
            <p className="text-sm text-ink-3">Drafting in your voice…</p>
          ) : draft.status === 'error' ? (
            <p className="text-sm text-data-coral">Couldn't draft this. Press E to write it, or skip.</p>
          ) : (
            <p className="text-sm text-ink whitespace-pre-wrap" data-testid="draft-text">{draft.text}</p>
          )}
        </div>
        <p className="text-[11px] text-ink-3">Enter/S send · E edit · Space/→ skip · ← back · Esc close</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/CopilotTriage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/CopilotTriage.tsx src/components/CopilotTriage.test.tsx
git commit -m "feat(copilot): triage deck card rendering + draft lifecycle"
```

---

### Task 7: `CopilotTriage` — keyboard actions, inline edit, undo bar

**Files:**
- Modify: `src/components/CopilotTriage.tsx`
- Modify: `src/components/CopilotTriage.test.tsx`

**Interfaces:**
- Consumes: `useCopilotStore` (`queueSend`, `undoSend`, `setDraftText`, `next`, `prev`, `close`), `extractEmail` (Task 1)
- Produces: keyboard handling on the deck: `Enter`/`s` send current draft, `e` enter edit mode, `Space`/`ArrowRight` skip (next), `ArrowLeft` prev, `u` undo the most recent pending send, `Escape` close (or exit edit).

- [ ] **Step 1: Write the failing test (append)**

```tsx
// add to src/components/CopilotTriage.test.tsx
import { fireEvent } from '@testing-library/react'

describe('CopilotTriage keyboard', () => {
  beforeEach(() => {
    useInboxStore.setState({ threads: [hot('1'), hot('2')], loading: false, error: null })
    useCopilotStore.setState({
      isOpen: true, index: 0, pending: [],
      drafts: { '1': { text: 'Ready draft.', status: 'ready', edited: false } },
    })
  })

  test('S queues a send and advances to the next card', async () => {
    render(<CopilotTriage />)
    await screen.findByText('Subject 1')
    fireEvent.keyDown(window, { key: 's' })
    expect(useCopilotStore.getState().pending).toHaveLength(1)
    expect(useCopilotStore.getState().pending[0]).toMatchObject({
      threadId: '1', to: 'a1@b.com', subject: 'Re: Subject 1', body: 'Ready draft.',
    })
    expect(useCopilotStore.getState().index).toBe(1)
  })

  test('E reveals an editable textarea bound to the draft', async () => {
    render(<CopilotTriage />)
    await screen.findByText('Subject 1')
    fireEvent.keyDown(window, { key: 'e' })
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(ta.value).toBe('Ready draft.')
    fireEvent.change(ta, { target: { value: 'My own words.' } })
    expect(useCopilotStore.getState().drafts['1'].text).toBe('My own words.')
    expect(useCopilotStore.getState().drafts['1'].edited).toBe(true)
  })

  test('Space skips without sending', async () => {
    render(<CopilotTriage />)
    await screen.findByText('Subject 1')
    fireEvent.keyDown(window, { key: ' ' })
    expect(useCopilotStore.getState().pending).toHaveLength(0)
    expect(useCopilotStore.getState().index).toBe(1)
  })

  test('an Undo bar appears while a send is pending and U cancels it', async () => {
    render(<CopilotTriage />)
    await screen.findByText('Subject 1')
    fireEvent.keyDown(window, { key: 's' })
    expect(screen.getByText(/Undo/i)).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'u' })
    expect(useCopilotStore.getState().pending).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/CopilotTriage.test.tsx`
Expected: FAIL (no keyboard handling / no textarea / no undo bar).

- [ ] **Step 3: Extend the implementation**

In `src/components/CopilotTriage.tsx`, add imports and state, replace the returned deck markup to include edit mode + the undo bar, and wire a `keydown` listener. Full updated component:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useInboxStore } from '@/stores/useInboxStore'
import { useCopilotStore } from '@/stores/useCopilotStore'
import { extractEmail } from '@/lib/inbox/extractEmail'

export function CopilotTriage() {
  const isOpen = useCopilotStore((s) => s.isOpen)
  const index = useCopilotStore((s) => s.index)
  const drafts = useCopilotStore((s) => s.drafts)
  const pending = useCopilotStore((s) => s.pending)
  const requestDraft = useCopilotStore((s) => s.requestDraft)
  const setDraftText = useCopilotStore((s) => s.setDraftText)
  const queueSend = useCopilotStore((s) => s.queueSend)
  const undoSend = useCopilotStore((s) => s.undoSend)
  const next = useCopilotStore((s) => s.next)
  const prev = useCopilotStore((s) => s.prev)
  const close = useCopilotStore((s) => s.close)
  const threads = useInboxStore((s) => s.threads)

  const [editing, setEditing] = useState(false)

  const hotThreads = useMemo(() => threads.filter((t) => t.priority === 'HOT'), [threads])
  const current = hotThreads[index]
  const draft = current ? drafts[current.id] : undefined
  const latestPending = pending[pending.length - 1]

  useEffect(() => {
    if (isOpen && current) requestDraft(current)
  }, [isOpen, current, requestDraft])

  useEffect(() => { setEditing(false) }, [index])

  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (editing) {
        if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
        return // let the textarea receive all other keys
      }
      if (e.key === 'Escape') { e.preventDefault(); close(); return }
      if (e.key === 'u' || e.key === 'U') {
        if (latestPending && latestPending.status === 'counting') { e.preventDefault(); undoSend(latestPending.id) }
        return
      }
      if (!current) return
      if (e.key === 'Enter' || e.key === 's' || e.key === 'S') {
        e.preventDefault()
        if (draft?.status === 'ready' && draft.text.trim()) {
          queueSend({
            threadId: current.id,
            to: extractEmail(current.from, current.fromDomain),
            subject: `Re: ${current.subject}`,
            body: draft.text,
          })
          next(hotThreads.length)
        }
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault(); setEditing(true)
      } else if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault(); next(hotThreads.length)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault(); prev()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, editing, current, draft, latestPending, hotThreads.length, queueSend, undoSend, next, prev, close])

  if (!isOpen) return null

  if (hotThreads.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-bg/95 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="font-display text-xl text-ink">Inbox is calm</p>
          <p className="text-sm text-ink-3">No hot threads right now.</p>
          <button onClick={close} className="text-[11px] font-semibold uppercase tracking-wider text-accent">Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg/95 flex flex-col items-center justify-center p-6" data-testid="copilot-deck">
      <div className="w-full max-w-2xl bg-surface border border-line rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-sans text-ink-3">{index + 1} of {hotThreads.length}</span>
          <button onClick={close} className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Esc</button>
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">{current.subject}</h3>
          <p className="text-sm text-ink-2 mt-1">{current.from}</p>
          <p className="text-sm text-ink-3 mt-2">{current.snippet}</p>
        </div>
        <div className="border-t border-line pt-4">
          {editing ? (
            <textarea
              autoFocus
              value={draft?.text ?? ''}
              onChange={(e) => setDraftText(current.id, e.target.value)}
              rows={8}
              className="w-full bg-bg border border-line rounded-md p-3 text-sm text-ink"
            />
          ) : !draft || draft.status === 'loading' ? (
            <p className="text-sm text-ink-3">Drafting in your voice…</p>
          ) : draft.status === 'error' ? (
            <p className="text-sm text-data-coral">Couldn't draft this. Press E to write it, or skip.</p>
          ) : (
            <p className="text-sm text-ink whitespace-pre-wrap" data-testid="draft-text">{draft.text}</p>
          )}
        </div>
        <p className="text-[11px] text-ink-3">Enter/S send · E edit · Space/→ skip · ← back · Esc close</p>
      </div>

      {latestPending && (
        <div className="mt-4 bg-surface border border-line rounded-lg px-4 py-2 flex items-center gap-4">
          <span className="text-sm text-ink-2">
            {latestPending.status === 'error'
              ? 'Send failed.'
              : latestPending.status === 'sending'
              ? 'Sending…'
              : `Sending in 5s${pending.length > 1 ? ` (+${pending.length - 1} more)` : ''}…`}
          </span>
          {latestPending.status === 'counting' && (
            <button onClick={() => undoSend(latestPending.id)} className="text-[11px] font-semibold uppercase tracking-wider text-accent">Undo</button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/CopilotTriage.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Attachment-mention flag (spec §8)**

Add a test to `src/components/CopilotTriage.test.tsx`:

```tsx
test('flags a draft that mentions an attachment', async () => {
  useCopilotStore.setState({
    isOpen: true, index: 0,
    drafts: { '1': { text: 'Adjunto la tabla actualizada.', status: 'ready', edited: false } },
  })
  render(<CopilotTriage />)
  await screen.findByText('Subject 1')
  expect(screen.getByText(/add the attachment in Gmail/i)).toBeInTheDocument()
})
```

Then, in `CopilotTriage.tsx`, add a detector near the top of the module:

```tsx
const ATTACHMENT_HINT = /\b(adjunto|adjunta|attached|attachment|se adjunta|enclosed)\b/i
```

And render the flag right below the draft `<p data-testid="draft-text">…</p>` (only when not editing and the draft is ready):

```tsx
          {!editing && draft?.status === 'ready' && ATTACHMENT_HINT.test(draft.text) && (
            <p className="text-[11px] text-ink-2 mt-2">Mentions an attachment. Add the attachment in Gmail before or after sending.</p>
          )}
```

(Uses the neutral `text-ink-2` token, not a warm accent, to comply with the DESIGN.md ban on amber/gold/cream. Copy avoids em dashes per Billy's voice rule.)

Run: `npx vitest run src/components/CopilotTriage.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/CopilotTriage.tsx src/components/CopilotTriage.test.tsx
git commit -m "feat(copilot): keyboard actions, inline edit, undo bar, attachment flag"
```

---

### Task 8: Mount the deck + add the entry button

**Files:**
- Modify: `src/components/Dashboard.tsx` (mount `<CopilotTriage />` near `<ReplyModal />` at line 248; add an entry button)
- Modify: `src/components/views/InboxIntelView.tsx` (add "Triage HOT" button in the header, opens the deck)
- Modify: `src/components/views/InboxIntelView.tsx` test if present, else no test change

**Interfaces:**
- Consumes: `useCopilotStore.open`, `CopilotTriage`

- [ ] **Step 1: Add the entry button to the inbox header**

In `src/components/views/InboxIntelView.tsx`, import the store at the top:

```tsx
import { useCopilotStore } from '@/stores/useCopilotStore'
```

Inside the component, add `const openCopilot = useCopilotStore((s) => s.open)` alongside the other hooks. Count HOT threads for the label:

```tsx
  const hotCount = threads.filter((t) => t.priority === 'HOT').length
```

In the `<header>` block (next to the existing "Ask Billy" button, around line 242), add:

```tsx
        {hotCount > 0 && (
          <button
            type="button"
            onClick={openCopilot}
            className="text-[11px] font-sans font-semibold uppercase tracking-wider bg-data-coral text-white px-3.5 py-1.5 rounded-md hover:brightness-110 transition-all"
          >
            Triage {hotCount} hot
          </button>
        )}
```

- [ ] **Step 2: Mount the deck**

In `src/components/Dashboard.tsx`, add `import { CopilotTriage } from './CopilotTriage'` and render it next to `<ReplyModal .../>` (line 248):

```tsx
      <ReplyModal email={replyEmail} onClose={() => setReplyEmail(null)} />
      <CopilotTriage />
```

- [ ] **Step 3: Typecheck, build, run full suite**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; all tests pass (existing + the ~20 new Copilot tests); build succeeds.

- [ ] **Step 4: Live drive Phase 1**

Start dev (`npm run dev`, port 5175 per CLAUDE.md; kill any stale process on 5175 first). Log in, open the inbox, click "Triage N hot". Verify: a draft streams into the first card; `E` lets you edit; `S` shows the "Sending in 5s… Undo" bar and advances; `U` cancels; letting it ride sends (test against your own address). Capture the terminal/URL proof.

- [ ] **Step 5: Commit**

```bash
git add src/components/Dashboard.tsx src/components/views/InboxIntelView.tsx
git commit -m "feat(copilot): mount triage deck + inbox entry button (Phase 1 complete)"
```

---

# Phase 2 — The "already waiting" cache

Deliverable: the inbox scan pre-writes drafts for HOT reply-owed threads and caches them; the deck reads cache first (instant), and redrafts on demand for misses or stale entries.

### Task 9: Extract `generateDraft` server helper; refactor the route

Moves the voice profile + prompt + Anthropic call out of the route so both the route (streaming) and the scan job (non-streaming) share one implementation.

**Files:**
- Create: `server/lib/copilot/generateDraft.ts`
- Create: `server/lib/copilot/generateDraft.test.ts`
- Modify: `server/routes/draftReply.ts`

**Interfaces:**
- Produces:
  - `interface VoiceProfile { trained: boolean; emailsAnalyzed: number; lastUpdated: string | null; summary: string; patterns: { openings: string[]; closings: string[]; avoid: string[]; signature: string }; tones: Record<string, string> }`
  - `getDefaultProfile(): VoiceProfile`
  - `loadVoiceProfile(uid: string): Promise<VoiceProfile>`
  - `buildDraftRequest(voiceProfile: VoiceProfile, email: { from: string; fromEmail: string; subject: string; snippet: string }, toneTier: string): { system: string; messages: { role: 'user'; content: string }[] }`
  - `generateDraft(uid: string, email: { from: string; fromEmail: string; subject: string; snippet: string }, toneTier?: string): Promise<string>` (non-streaming; returns full text)

- [ ] **Step 1: Write the failing test**

```ts
// server/lib/copilot/generateDraft.test.ts
import { describe, expect, test, vi, beforeAll } from 'vitest'

vi.mock('../firebase', () => ({
  db: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({
    get: async () => ({ exists: false }),
  }) }) }) }) },
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Adjunto la tabla.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    },
  })),
}))

beforeAll(() => { process.env.ANTHROPIC_API_KEY = 'test-key' })

import { buildDraftRequest, getDefaultProfile, generateDraft } from './generateDraft'

describe('generateDraft helpers', () => {
  test('buildDraftRequest embeds voice + the incoming email', () => {
    const req = buildDraftRequest(getDefaultProfile(), {
      from: 'Ana <ana@gbm.com>', fromEmail: 'ana@gbm.com', subject: 'Cap table', snippet: 'send it?',
    }, 'peer')
    expect(req.system).toContain('Billy Rovzar')
    expect(req.system).toContain('NEVER use em dashes')
    expect(req.messages[0].content).toContain('Cap table')
  })

  test('generateDraft returns the model text', async () => {
    const text = await generateDraft('uid1', {
      from: 'Ana <ana@gbm.com>', fromEmail: 'ana@gbm.com', subject: 'Cap table', snippet: 'send it?',
    })
    expect(text).toBe('Adjunto la tabla.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/lib/copilot/generateDraft.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the helper (move logic out of `draftReply.ts`)**

```ts
// server/lib/copilot/generateDraft.ts
import Anthropic from '@anthropic-ai/sdk'
import { db } from '../firebase'
import { CLAUDE_MODELS } from '@shared/models'

export interface VoiceProfile {
  trained: boolean
  emailsAnalyzed: number
  lastUpdated: string | null
  summary: string
  patterns: { openings: string[]; closings: string[]; avoid: string[]; signature: string }
  tones: Record<string, string>
}

export interface EmailContext {
  from: string
  fromEmail: string
  subject: string
  snippet: string
}

export function getDefaultProfile(): VoiceProfile {
  return {
    trained: false,
    emailsAnalyzed: 0,
    lastUpdated: null,
    summary: 'Direct, peer-to-peer. Bilingual ES/EN. Never uses em dashes. Short sentences.',
    patterns: {
      openings: ['Quick one:', 'Heads up:', 'Just confirming:'],
      closings: ['Billy', 'B.'],
      avoid: ['em dashes', 'I hope this finds you well', 'circling back'],
      signature: 'Billy',
    },
    tones: {
      inner: 'Casual, direct, mixed Spanish/English.',
      peer: 'Warm but efficient. Match their language.',
      exec: 'Crisp, careful. No slang.',
      legal: 'Precise, formal-ish. Reference specifics.',
      talent: 'Generous, encouraging. Lead with the positive.',
    },
  }
}

export async function loadVoiceProfile(uid: string): Promise<VoiceProfile> {
  try {
    const snap = await db.collection('users').doc(uid).collection('voiceProfile').doc('current').get()
    return snap.exists ? (snap.data() as VoiceProfile) : getDefaultProfile()
  } catch {
    return getDefaultProfile()
  }
}

function buildVoicePrompt(profile: VoiceProfile, toneTier: string): string {
  const tone = profile.tones[toneTier] || profile.tones.peer || ''
  return `BILLY ROVZAR'S VOICE PROFILE:
${profile.summary}

TONE FOR THIS RECIPIENT (${toneTier}): ${tone}

SIGNATURE PATTERNS:
- Openings he uses: ${profile.patterns.openings.join(', ') || 'direct openings, no preamble'}
- Closings: ${profile.patterns.closings.join(' or ') || 'Billy'}
- Always avoids: ${profile.patterns.avoid.join(', ') || 'em dashes, corporate speak'}

${profile.trained
  ? `Profile trained on ${profile.emailsAnalyzed} of his sent emails.`
  : 'Profile not yet trained. Using base description.'}

NEVER use em dashes. Use commas or periods. Match the language of the original (ES or EN).`
}

export function buildDraftRequest(profile: VoiceProfile, email: EmailContext, toneTier: string) {
  const voicePrompt = buildVoicePrompt(profile, toneTier)
  return {
    system: `You are drafting an email reply AS Billy Rovzar, CEO of Lemon Studios.

${voicePrompt}

Write ONLY the email body. No subject line. No "Dear" unless the tone tier calls for formality. Keep it concise. Match the language of the incoming email (Spanish or English).`,
    messages: [
      {
        role: 'user' as const,
        content: `Draft a reply to this email:
From: ${email.from} <${email.fromEmail}>
Subject: ${email.subject}
Content: ${email.snippet}`,
      },
    ],
  }
}

export async function generateDraft(uid: string, email: EmailContext, toneTier = 'peer'): Promise<string> {
  const profile = await loadVoiceProfile(uid)
  const { system, messages } = buildDraftRequest(profile, email, toneTier)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await anthropic.messages.create({
    model: CLAUDE_MODELS.balanced,
    thinking: { type: 'disabled' },
    max_tokens: 600,
    system,
    messages,
  })
  return res.content[0]?.type === 'text' ? res.content[0].text : ''
}
```

- [ ] **Step 4: Refactor the route to use the helper**

Replace the body-building parts of `server/routes/draftReply.ts` so it imports from the helper and keeps streaming. Remove the local `VoiceProfile`, `buildVoicePrompt`, `getDefaultProfile` (now in the helper). New route handler core:

```ts
import { loadVoiceProfile, buildDraftRequest } from '../lib/copilot/generateDraft'
// ...
  const voiceProfile = await loadVoiceProfile(uid)
  const { system, messages } = buildDraftRequest(voiceProfile, email, toneTier)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const anthropic = getAnthropicClient()
  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      thinking: { type: 'disabled' },
      max_tokens: 600,
      system,
      messages,
    })
    let fullDraft = ''
    stream.on('text', (text: string) => {
      fullDraft += text
      res.write(`data: ${JSON.stringify({ type: 'token', text })}\n\n`)
    })
    await stream.finalMessage()
    res.write(`data: ${JSON.stringify({ type: 'done', draft: fullDraft })}\n\n`)
  } catch {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Draft generation failed' })}\n\n`)
  }
  res.end()
```

- [ ] **Step 5: Run helper test + existing route test**

Run: `npx vitest run server/lib/copilot/generateDraft.test.ts server/routes/draftReply.test.ts`
Expected: both PASS (the route test still green after the refactor).

- [ ] **Step 6: Commit**

```bash
git add server/lib/copilot/generateDraft.ts server/lib/copilot/generateDraft.test.ts server/routes/draftReply.ts
git commit -m "refactor(copilot): extract shared generateDraft helper from draft-reply route"
```

---

### Task 10: `replyOwed` helper + `CopilotDraft` type

**Files:**
- Create: `server/lib/copilot/replyOwed.ts`
- Create: `server/lib/copilot/replyOwed.test.ts`
- Modify: `shared/types.ts` (add `CopilotDraft`)

**Interfaces:**
- Produces:
  - `threadOwesReply(latestFrom: string, selfEmail: string): boolean` — true when the latest message is inbound (its `From` address is not the user's own).
  - `shared/types.ts`: `export interface CopilotDraft { threadId: string; draft: string; generatedAt: string; basedOnMessageId: string; tone: string }`

- [ ] **Step 1: Write the failing test**

```ts
// server/lib/copilot/replyOwed.test.ts
import { describe, expect, test } from 'vitest'
import { threadOwesReply } from './replyOwed'

describe('threadOwesReply', () => {
  test('true when the latest message is from someone else', () => {
    expect(threadOwesReply('Ana <ana@gbm.com>', 'billy@lemonfilms.com')).toBe(true)
  })
  test('false when Billy sent the latest message', () => {
    expect(threadOwesReply('Billy Rovzar <billy@lemonfilms.com>', 'billy@lemonfilms.com')).toBe(false)
  })
  test('is case-insensitive on the address', () => {
    expect(threadOwesReply('BILLY@LEMONFILMS.COM', 'billy@lemonfilms.com')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/lib/copilot/replyOwed.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation + type**

```ts
// server/lib/copilot/replyOwed.ts
// A thread "owes a reply" when its latest message is inbound — i.e. the
// latest From address is not the user's own address.
export function threadOwesReply(latestFrom: string, selfEmail: string): boolean {
  const match = latestFrom.match(/<([^>]+)>/)
  const addr = (match?.[1] ?? latestFrom).trim().toLowerCase()
  return addr !== selfEmail.trim().toLowerCase()
}
```

Add to `shared/types.ts` (near the other inbox types around line 44):

```ts
export interface CopilotDraft {
  threadId: string
  draft: string
  generatedAt: string
  basedOnMessageId: string
  tone: string
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/lib/copilot/replyOwed.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/lib/copilot/replyOwed.ts server/lib/copilot/replyOwed.test.ts shared/types.ts
git commit -m "feat(copilot): reply-owed detection + CopilotDraft type"
```

---

### Task 11: `pregenerateCopilotDrafts` — build + cache drafts

**Files:**
- Create: `server/lib/copilot/pregenerate.ts`
- Create: `server/lib/copilot/pregenerate.test.ts`

**Interfaces:**
- Consumes: `generateDraft` (Task 9), `threadOwesReply` (Task 10), `CopilotDraft` (Task 10)
- Produces:
  - `interface DraftCandidate { threadId: string; from: string; fromEmail: string; subject: string; snippet: string; latestMessageId: string; priority: 'HOT'|'MED'|'LOW'; latestFrom: string }`
  - `pregenerateCopilotDrafts(uid: string, selfEmail: string, candidates: DraftCandidate[], cap?: number): Promise<number>` — filters HOT + reply-owed, skips entries whose cached `basedOnMessageId` already matches, caps at `cap` (default 8), drafts and writes `users/{uid}/copilotDrafts/{threadId}`, returns the number written.

- [ ] **Step 1: Write the failing test**

```ts
// server/lib/copilot/pregenerate.test.ts
import { describe, expect, test, vi, beforeEach } from 'vitest'

const setMock = vi.fn()
const getMock = vi.fn(async () => ({ exists: false }))
vi.mock('../firebase', () => ({
  db: { collection: () => ({ doc: () => ({ get: getMock, set: setMock }) }) },
}))
vi.mock('./generateDraft', () => ({ generateDraft: vi.fn().mockResolvedValue('Cached draft.') }))
import { generateDraft } from './generateDraft'
import { pregenerateCopilotDrafts, type DraftCandidate } from './pregenerate'

const cand = (id: string, priority: 'HOT' | 'MED' | 'LOW', latestFrom: string): DraftCandidate => ({
  threadId: id, from: latestFrom, fromEmail: 'a@b.com', subject: 's', snippet: 'x',
  latestMessageId: `m_${id}`, priority, latestFrom,
})

beforeEach(() => { setMock.mockClear(); getMock.mockClear(); vi.clearAllMocks() })

describe('pregenerateCopilotDrafts', () => {
  test('drafts only HOT + reply-owed, writes cache, returns count', async () => {
    const n = await pregenerateCopilotDrafts('uid1', 'billy@lemonfilms.com', [
      cand('1', 'HOT', 'Ana <ana@b.com>'),                 // HOT + owed -> draft
      cand('2', 'MED', 'Bob <bob@b.com>'),                  // not HOT -> skip
      cand('3', 'HOT', 'Billy <billy@lemonfilms.com>'),     // HOT but Billy sent last -> skip
    ])
    expect(n).toBe(1)
    expect(generateDraft).toHaveBeenCalledOnce()
    expect(setMock).toHaveBeenCalledOnce()
    const written = setMock.mock.calls[0][0]
    expect(written).toMatchObject({ threadId: '1', draft: 'Cached draft.', basedOnMessageId: 'm_1' })
  })

  test('respects the cap', async () => {
    const many = Array.from({ length: 12 }, (_, i) => cand(String(i), 'HOT', 'Ana <ana@b.com>'))
    const n = await pregenerateCopilotDrafts('uid1', 'billy@lemonfilms.com', many, 8)
    expect(n).toBe(8)
  })

  test('skips a thread whose cache already matches the latest message', async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ basedOnMessageId: 'm_1' }) })
    const n = await pregenerateCopilotDrafts('uid1', 'billy@lemonfilms.com', [cand('1', 'HOT', 'Ana <ana@b.com>')])
    expect(n).toBe(0)
    expect(generateDraft).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/lib/copilot/pregenerate.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

```ts
// server/lib/copilot/pregenerate.ts
import { db } from '../firebase'
import { generateDraft } from './generateDraft'
import { threadOwesReply } from './replyOwed'

export interface DraftCandidate {
  threadId: string
  from: string
  fromEmail: string
  subject: string
  snippet: string
  latestMessageId: string
  priority: 'HOT' | 'MED' | 'LOW'
  latestFrom: string
}

export async function pregenerateCopilotDrafts(
  uid: string,
  selfEmail: string,
  candidates: DraftCandidate[],
  cap = 8,
): Promise<number> {
  const eligible = candidates
    .filter((c) => c.priority === 'HOT' && threadOwesReply(c.latestFrom, selfEmail))
    .slice(0, cap)

  let written = 0
  for (const c of eligible) {
    const ref = db.collection(`users/${uid}/copilotDrafts`).doc(c.threadId)
    const existing = await ref.get()
    if (existing.exists && (existing.data() as any)?.basedOnMessageId === c.latestMessageId) continue

    let draft: string
    try {
      draft = await generateDraft(uid, {
        from: c.from, fromEmail: c.fromEmail, subject: c.subject, snippet: c.snippet,
      })
    } catch {
      continue // never let one bad draft fail the scan
    }
    if (!draft.trim()) continue

    await ref.set({
      threadId: c.threadId,
      draft,
      generatedAt: new Date().toISOString(),
      basedOnMessageId: c.latestMessageId,
      tone: 'peer',
    })
    written++
  }
  return written
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/lib/copilot/pregenerate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/lib/copilot/pregenerate.ts server/lib/copilot/pregenerate.test.ts
git commit -m "feat(copilot): pre-generate and cache drafts for hot reply-owed threads"
```

---

### Task 12: Hook pre-generation into the inbox scan

`runInboxScan` already fetches threads FULL. Build `DraftCandidate[]` from that data and call `pregenerateCopilotDrafts` at the end, using the Gmail profile address as `selfEmail`.

**Files:**
- Modify: `server/lib/engine/jobs/inboxScan.ts`

**Interfaces:**
- Consumes: `pregenerateCopilotDrafts`, `DraftCandidate` (Task 11); `tagThread`, `prioritizeThread`, `DEFAULT_TAG_PATTERNS` from `../../threadTags`

- [ ] **Step 1: Capture the fields needed for candidates during the fetch**

In `inboxScan.ts`, extend the `EmailDigest` interface and the per-thread map (around lines 106-140) to also carry `latestMessageId`, `fromDomain`, and `labels`:

```ts
  interface EmailDigest {
    threadId: string
    subject: string
    from: string
    fromDomain: string
    date: string
    body: string
    latestMessageId: string
    labels: string[]
  }
```

In the batch map, compute and include them:

```ts
        const latest = msgs[msgs.length - 1]
        const headers = (latest.payload?.headers ?? []) as Array<{ name: string; value: string }>
        const from = extractHeader(headers, 'From')
        const fromDomain = from.match(/<([^>]+)>/)?.[1]?.split('@')[1]?.toLowerCase()
          ?? from.split('@')[1]?.toLowerCase() ?? ''
        return {
          threadId: t.id,
          subject: extractHeader(headers, 'Subject'),
          from,
          fromDomain,
          date: extractHeader(headers, 'Date'),
          body: extractBody(latest.payload).slice(0, 1500),
          latestMessageId: latest.id ?? '',
          labels: latest.labelIds ?? [],
        } as EmailDigest
```

- [ ] **Step 2: Add the pre-generation pass after Firestore write**

Add imports at the top:

```ts
import { tagThread, prioritizeThread, DEFAULT_TAG_PATTERNS } from '../../threadTags'
import { pregenerateCopilotDrafts, type DraftCandidate } from '../../copilot/pregenerate'
import { extractEmail } from '../../inbox/extractEmailServer'
```

Wait — `extractEmail` lives in the frontend (`src/lib/inbox`). For the server, parse inline instead (no cross-tree import). Remove that import and, after `const stats = await writeToFirestore(...)` (line 167), add:

```ts
  // ── Phase 4: pre-generate Copilot drafts for HOT reply-owed threads ──
  try {
    onProgress('saving', 'Pre-writing Copilot drafts…')
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const selfEmail = profile.data.emailAddress ?? ''
    const candidates: DraftCandidate[] = emails.map((e) => {
      const tag = tagThread({ from: e.from, fromDomain: e.fromDomain, subject: e.subject, labels: e.labels }, DEFAULT_TAG_PATTERNS)
      const priority = prioritizeThread({
        tag, unread: e.labels.includes('UNREAD'), receivedAt: e.date ? new Date(e.date).toISOString() : new Date().toISOString(),
        subject: e.subject, fromDomain: e.fromDomain, from: e.from,
      })
      const fromEmail = e.from.match(/<([^>]+)>/)?.[1] ?? e.from
      return {
        threadId: e.threadId, from: e.from, fromEmail, subject: e.subject, snippet: e.body.slice(0, 300),
        latestMessageId: e.latestMessageId, priority, latestFrom: e.from,
      }
    })
    if (selfEmail) await pregenerateCopilotDrafts(uid, selfEmail, candidates)
  } catch (err) {
    console.warn('[scan] Copilot pre-generation skipped:', (err as Error).message)
  }
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (Confirm `prioritizeThread`/`tagThread` argument shapes match `server/lib/threadTags.ts`; adjust field names to match that file if the compiler flags them.)

- [ ] **Step 4: Run the scan job's tests (if present) + full server suite**

Run: `npx vitest run server/`
Expected: PASS. If an existing `inboxScan` test asserts on Gmail-call counts, update it to allow the added `getProfile` call.

- [ ] **Step 5: Commit**

```bash
git add server/lib/engine/jobs/inboxScan.ts
git commit -m "feat(copilot): pre-generate drafts during the inbox scan"
```

---

### Task 13: `GET /api/copilot/drafts` cache-read route

**Files:**
- Create: `server/routes/copilot.ts`
- Create: `server/routes/copilot.test.ts`
- Modify: `server/index.ts` (mount `copilotRouter` at `/api/copilot`)

**Interfaces:**
- Produces: `GET /api/copilot/drafts` -> `{ data: Record<string, CopilotDraft> }` keyed by `threadId`, for the authed user.

- [ ] **Step 1: Write the failing test**

```ts
// server/routes/copilot.test.ts
import { describe, expect, test, vi, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'

const docs = [
  { id: 't1', data: () => ({ threadId: 't1', draft: 'A', generatedAt: '2026-07-08T00:00:00Z', basedOnMessageId: 'm1', tone: 'peer' }) },
  { id: 't2', data: () => ({ threadId: 't2', draft: 'B', generatedAt: '2026-07-08T00:00:00Z', basedOnMessageId: 'm2', tone: 'peer' }) },
]
vi.mock('../lib/firebase', () => ({
  db: { collection: () => ({ get: async () => ({ docs }) }) },
}))

beforeAll(() => { process.env.ALLOWED_ORIGIN = 'https://app.example.com' })

import { copilotRouter } from './copilot'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => { req.session = { uid: 'uid1' }; next() })
  app.use('/api/copilot', copilotRouter)
  return app
}

describe('GET /api/copilot/drafts', () => {
  test('returns cached drafts keyed by threadId', async () => {
    const res = await request(makeApp()).get('/api/copilot/drafts')
    expect(res.status).toBe(200)
    expect(res.body.data.t1.draft).toBe('A')
    expect(res.body.data.t2.basedOnMessageId).toBe('m2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routes/copilot.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the route**

```ts
// server/routes/copilot.ts
import { Router } from 'express'
import { db } from '../lib/firebase'
import { requireAuth } from '../middleware/requireAuth'
import type { CopilotDraft } from '@shared/types'

export const copilotRouter = Router()
copilotRouter.use(requireAuth)

// GET /api/copilot/drafts — cached drafts for the authed user, keyed by threadId.
copilotRouter.get('/drafts', async (req, res) => {
  const uid = req.session.uid!
  try {
    const snap = await db.collection(`users/${uid}/copilotDrafts`).get()
    const out: Record<string, CopilotDraft> = {}
    for (const d of snap.docs) out[d.id] = d.data() as CopilotDraft
    res.json({ data: out })
  } catch {
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Failed to load drafts', retryable: true } })
  }
})
```

Mount in `server/index.ts` alongside the other routers:

```ts
import { copilotRouter } from './routes/copilot'
// ... with the other app.use('/api/...') lines:
app.use('/api/copilot', copilotRouter)
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run server/routes/copilot.test.ts && npm run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 5: Verify the Firestore rule already covers the cache (no change needed)**

Confirm in `firestore.rules` that `users/{userId}/{collectionId}/{docId}` allows owner read/write and `copilotDrafts` is NOT in the excluded list (`google_tokens`, `global_memories`, `conv_memories`). It is covered. Reads go through this server route (admin SDK) anyway, so no rule change is required. No edit.

- [ ] **Step 6: Commit**

```bash
git add server/routes/copilot.ts server/routes/copilot.test.ts server/index.ts
git commit -m "feat(copilot): GET /api/copilot/drafts cache-read route"
```

---

### Task 14: Deck reads cache first, redraws on demand for misses/stale

Adds a cache-hydration step so the deck shows cached drafts instantly and only calls the on-demand path for misses or stale entries.

**Files:**
- Modify: `src/lib/copilot/draftClient.ts` (add `fetchCachedDrafts`)
- Modify: `src/stores/useCopilotStore.ts` (`hydrateFromCache`, and `requestDraft` respects a hydrated cache entry)
- Modify: `src/stores/useCopilotStore.test.ts`
- Modify: `src/components/CopilotTriage.tsx` (call `hydrateFromCache` on open)

**Interfaces:**
- Consumes: `GET /api/copilot/drafts` (Task 13), `CopilotDraft` (Task 10)
- Produces:
  - `fetchCachedDrafts(): Promise<Record<string, CopilotDraft>>`
  - store: `hydrateFromCache(threads: InboxThread[]): Promise<void>` — loads cache and seeds `drafts[threadId]` as `ready` for non-stale hits. Staleness is checked in Task 12's `basedOnMessageId`; the client cannot see the latest message id from `InboxThread`, so it treats any cache hit as ready and lets the next scan refresh it. (Documented limitation; a message-id on `InboxThread` is a future follow-up.)

- [ ] **Step 1: Write the failing test (append to store test)**

```ts
// add to src/stores/useCopilotStore.test.ts
vi.mock('@/lib/copilot/draftClient', async (orig) => ({
  ...(await orig<any>()),
  fetchCachedDrafts: vi.fn().mockResolvedValue({
    t1: { threadId: 't1', draft: 'Cached!', generatedAt: 'x', basedOnMessageId: 'm1', tone: 'peer' },
  }),
}))

describe('useCopilotStore cache hydration', () => {
  beforeEach(() => useCopilotStore.setState({ drafts: {} }))
  test('hydrateFromCache seeds ready drafts from the server cache', async () => {
    await useCopilotStore.getState().hydrateFromCache([thread('t1'), thread('t2')])
    expect(useCopilotStore.getState().drafts['t1']).toEqual({ text: 'Cached!', status: 'ready', edited: false })
    expect(useCopilotStore.getState().drafts['t2']).toBeUndefined()
  })
})
```

Note: the earlier `vi.mock('@/lib/copilot/draftClient', ...)` at the top of the file must be reconciled — replace the top mock with this spread version so both `generateDraftForThread` and `fetchCachedDrafts` are mocked. Keep `generateDraftForThread` returning `'Drafted reply.'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/useCopilotStore.test.ts`
Expected: FAIL, `fetchCachedDrafts`/`hydrateFromCache` undefined.

- [ ] **Step 3: Implement**

Add to `src/lib/copilot/draftClient.ts`:

```ts
import type { CopilotDraft } from '@shared/types'

export async function fetchCachedDrafts(): Promise<Record<string, CopilotDraft>> {
  const res = await fetch('/api/copilot/drafts', { credentials: 'include' })
  if (!res.ok) return {}
  const json = await res.json().catch(() => ({ data: {} }))
  return (json.data ?? {}) as Record<string, CopilotDraft>
}
```

Add to `useCopilotStore` (interface + body), and import `fetchCachedDrafts`:

```ts
  hydrateFromCache: async (threads) => {
    const cached = await fetchCachedDrafts()
    set((s) => {
      const drafts = { ...s.drafts }
      for (const t of threads) {
        const hit = cached[t.id]
        if (hit && !drafts[t.id]) drafts[t.id] = { text: hit.draft, status: 'ready', edited: false }
      }
      return { drafts }
    })
  },
```

Interface line: `hydrateFromCache: (threads: InboxThread[]) => Promise<void>`.

In `src/components/CopilotTriage.tsx`, hydrate on open (add `hydrateFromCache` selector and an effect):

```tsx
  const hydrateFromCache = useCopilotStore((s) => s.hydrateFromCache)
  useEffect(() => {
    if (isOpen) hydrateFromCache(hotThreads)
  }, [isOpen, hotThreads, hydrateFromCache])
```

`requestDraft` already no-ops when a `ready` draft exists (Task 4), so hydrated cards won't re-draft.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/stores/useCopilotStore.test.ts src/lib/copilot/draftClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/copilot/draftClient.ts src/stores/useCopilotStore.ts src/stores/useCopilotStore.test.ts src/components/CopilotTriage.tsx
git commit -m "feat(copilot): deck hydrates cached drafts first, drafts on demand for misses (Phase 2 complete)"
```

---

### Task 15: Full verification, adversarial review, live drive

**Files:** none (verification only)

- [ ] **Step 1: Full local gate**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; all tests pass (existing + new Copilot suite); build succeeds.

- [ ] **Step 2: Live drive Phase 2**

Start dev on port 5175 (kill stale first). Run a manual inbox scan, then open the deck. Verify HOT reply-owed cards appear instantly (cache hit, no "Drafting…" flash); a HOT thread with no cache still drafts on demand. Send one to your own address through the 5s hold; undo one. Capture proof.

- [ ] **Step 3: Adversarial multi-agent review**

Dispatch two independent read-only reviewers over the diff (`git diff main...killer-features`): one for correctness/security (SSE parsing, the send path, the 5s timer race, reply-owed logic, no token/PII logging), one for the SDK-0.110 and store-consistency concerns (stream shape, no `textStream`, timer cleanup, cache staleness). Fix confirmed findings; re-verify.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin killer-features
gh pr create --base main --head killer-features --title "Inbox Copilot: keyboard triage deck (Phase 1 + 2)" --body "Implements docs/superpowers/specs/2026-07-08-inbox-copilot-design.md. Phase 1 (on-demand deck) + Phase 2 (pre-cached drafts). Verification, review, and live-drive proof in comments."
```

- [ ] **Step 5: Post verification evidence as a PR comment** (checks output, review summary, live-drive proof), matching the SDK-upgrade PR pattern.

---

## Self-Review

**1. Spec coverage:**
- Keyboard deck (spec §2, §5) -> Tasks 6, 7, 8.
- Show-then-send + 5s unsend (spec §2, §7) -> Tasks 2, 5, 7.
- Full inline edit (spec §2) -> Task 7.
- Hybrid freshness (spec §2, §4) -> on-demand Tasks 3-4; pre-cache Tasks 11-12, 14.
- HOT-only scope (spec §10) -> Task 6 filter, Task 11 filter.
- Reuse HOT ranking / triage nav / voice drafting / send (spec §5) -> Tasks 3, 4, 8, 9.
- generateDraft refactor (spec §5) -> Task 9.
- Cache doc + budget (spec §6) -> Task 11 (cap 8).
- Firestore rule (spec §6) -> Task 13 Step 5 (existing catch-all covers it; documented, no change).
- GET /api/copilot/drafts (spec §5) -> Task 13.
- Reply-owed detection (spec §5) -> Task 10.
- Attachment-mention flag (spec §8) -> Task 7 Step 5.
- Error handling: draft fail (Task 4/6), send fail (Task 5/7), no HOT (Task 6), stale (Task 11/14 limitation noted). Reauth is handled by the existing `apiFetch`/`ReconnectBanner` for `sendReply` errors surfaced generically; the deck shows "Send failed, retry."
- Testing + adversarial review + live drive (spec §9) -> Tasks throughout + Task 15.

**2. Placeholder scan:** No TBD/TODO. Every code step has real code. One documented limitation (client-side staleness in Task 14, because `InboxThread` carries no latest-message id) is called out explicitly with its follow-up, not hidden.

**3. Type consistency:** `DraftState`, `PendingSend`, `CopilotDraft`, `DraftCandidate`, `VoiceProfile`, `EmailContext` are each defined once and consumed with matching field names. `generateDraftForThread`/`fetchCachedDrafts`/`generateDraft`/`pregenerateCopilotDrafts`/`threadOwesReply` signatures match across their producer and consumer tasks. Store action names (`open/close/next/prev/requestDraft/setDraftText/queueSend/undoSend/retrySend/hydrateFromCache`) are consistent between the store, the component, and the tests.
