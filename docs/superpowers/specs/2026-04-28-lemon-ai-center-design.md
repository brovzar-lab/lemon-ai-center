# Lemon AI Center — Design Spec
**Date:** 2026-04-28  
**Project:** brovzar-lab/lemon-ai-center  
**Owner:** Billy Rovzar / Lemon Studios

---

## 1. Purpose

Billy Rovzar's CEO command center for Lemon Studios. Single-page dashboard combining Gmail, Google Calendar, Notion (BILLY AI BRAIN), Anthropic AI (Jarvis + AI Billy voices), Firestore task management, and a 27-skill creative launcher. Warm-dark editorial aesthetic matching Lemon brand identity.

---

## 2. System Architecture

### Monorepo layout

```
lemon-ai-center/
├── src/                    # Vite + React 18 + TypeScript frontend
│   ├── components/
│   ├── stores/             # Zustand stores (one per domain)
│   ├── data/seeds.ts       # Offline/unauth fallback data (isDemo: true)
│   ├── lib/                # Frontend API client helpers
│   └── main.tsx
├── server/                 # Express proxy + auth
│   ├── index.ts            # App entry, static serving, route mount
│   ├── routes/
│   │   ├── auth.ts         # /auth/google/start|callback|refresh|logout
│   │   ├── claude.ts       # /api/claude/* (Anthropic proxy)
│   │   ├── gmail.ts        # /api/gmail/*
│   │   ├── calendar.ts     # /api/calendar/*
│   │   └── notion.ts       # /api/notion/*
│   ├── lib/
│   │   ├── firebase.ts     # Admin SDK init
│   │   ├── encryption.ts   # AES-256-GCM for refresh tokens
│   │   ├── session.ts      # Custom connect-compatible Firestore session store (implements SessionStore for express-session)
│   │   ├── threadTags.ts   # Rule-based tag + priority engine
│   │   └── prompts.ts      # System prompts + PROMPT_VERSION const
│   └── middleware/
│       ├── requireAuth.ts  # Session gate for /api/* routes
│       ├── csrfCheck.ts    # Origin header check on all writes
│       └── rateLimit.ts    # Per-route, per-session limits
├── shared/
│   └── types.ts            # Task, Decision, Brief, InboxThread, MeetingEvent,
│                           # NotionBlock, SkillId, Bucket — imported by both sides
├── scripts/
│   ├── encrypt-token.ts    # One-off CLI: encrypt a refresh token for testing
│   ├── seed-firestore.ts   # Populate dev Firestore with known fixture (emulator only)
│   └── revoke-session.ts   # Nuke a session by id (incident response)
├── .agent/                 # APP-TEMPLATE v3 agents (from MASTER-LIBRARY)
├── dist/                   # Vite build output (gitignored)
├── CLAUDE.md
├── DESIGN.md
├── railway.json
└── .env.example
```

### Dev vs. prod

| Mode | Frontend | API/Auth | How |
|------|----------|----------|-----|
| `npm run dev` | Vite on :5173 | Express on :3001 | vite.config.ts proxies `/api` + `/auth` → :3001 |
| `npm start` | Express serves `dist/` | Same Express process | Single port, Railway-assigned |

```
npm run build = vite build && tsc -p server/tsconfig.json
npm start     = node server/dist/index.js
```

### Path aliases

```ts
// tsconfig.json (root)
"paths": {
  "@shared/*": ["shared/*"],
  "@/*": ["src/*"]
}
```

### Deploy

Single Railway service. Express serves `dist/` for all non-`/api`/`/auth` paths. No CORS, same-origin cookies, one deploy = one rollback unit.

---

## 3. Auth & Security

### Google OAuth (server-side only)

```
Browser  →  GET /auth/google/start
              generate state nonce
              set __Host-state cookie (httpOnly, secure, sameSite=strict)
              302 → Google consent (scopes below)

Google   →  GET /auth/google/callback?code=&state=
              validate state cookie
              check email against ALLOWED_EMAILS env var → 403 if not in list
              exchange code for { access_token, refresh_token, expiry }
              encrypt(refresh_token) → AES-256-GCM
              write /users/{uid}/google_tokens (encrypted refresh only)
              create /sessions/{sid}
              set __Host-sid cookie (httpOnly, secure, sameSite=lax)
              302 → /

Browser  →  all subsequent /api/* calls send __Host-sid cookie
              requireAuth reads session from Firestore
              access token held in-memory (Map<uid, {token, expiry}>)
              refresh path serializes per-uid via Map<uid, Promise<string>>
```

**Single-user lockdown:** `ALLOWED_EMAILS=billy@lemonfilms.com` in Railway env. Hard 403 if callback email not in list — no user record or session created.

**OAuth scopes:**
```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/calendar.readonly
openid email profile
```

**Scope revocation / PERMISSION_DENIED:** Per-panel re-grant prompt, not a global error. InboxPanel/CalendarPanel each detect `PERMISSION_DENIED` and show inline "Re-grant Gmail/Calendar access" → hits `/auth/google/start?scopes=...` incremental auth.

### Token encryption

`server/lib/encryption.ts` — AES-256-GCM. Key = `TOKEN_ENCRYPTION_KEY` env var (32-byte hex, Railway only, never in Firestore).

```ts
encrypt(plaintext): { ciphertext: string; iv: string; tag: string }
decrypt(ciphertext, iv, tag): string
```

Firestore stores `{ ciphertext, iv, tag }`. Useless without Railway env key. On every token refresh, check if Google returns a new refresh token — if yes, re-encrypt and overwrite Firestore.

### Session schema

```
/sessions/{sid}
  uid             string
  email           string
  createdAt       timestamp
  lastSeenAt      timestamp       // updated async on each authenticated request
  absoluteExpiry  timestamp       // createdAt + 90 days (Firestore TTL field)
  userAgent       string
  ip              string
```

**TTL rules (enforced in requireAuth):**
- `lastSeenAt` > 30 days ago → reject, redirect to `/auth/google/start`
- `absoluteExpiry` exceeded → same
- Firestore TTL policy on `absoluteExpiry` auto-deletes expired docs

### CSRF protection

All write routes (`POST`, `PATCH`, `DELETE` on `/api/*`): `csrfCheck` middleware validates `req.headers.origin === process.env.ALLOWED_ORIGIN`. Same-origin in prod, zero client complexity.

### Audit log

```
/users/{uid}/audit_log/{eventId}
  event       "login" | "logout" | "token_refresh" | "gmail_send" | "scope_change"
  ts          timestamp
  ip          string
  userAgent   string
  metadata    object?             // e.g. { threadId } for gmail_send
  expiresAt   timestamp           // ts + 90 days (Firestore TTL)
```

---

## 4. Data Layer

### Firestore schema

```
/users/{uid}/
  email, displayName, photoURL, createdAt

/users/{uid}/google_tokens              # single doc
  tokenExpiry     timestamp
  refreshToken    { ciphertext, iv, tag }
  scope           string
  updatedAt       timestamp
  # accessToken NOT stored — held in-memory Map<uid, {token, expiry}>

/sessions/{sid}                         # TTL: absoluteExpiry
  uid, email, createdAt, lastSeenAt, absoluteExpiry, userAgent, ip

/users/{uid}/tasks/{taskId}
  id              string (Firestore auto)
  title           string
  bucket          "now" | "next" | "orbit"
  done            boolean
  doneAt          timestamp?
  createdAt       timestamp (serverTimestamp)
  updatedAt       timestamp (serverTimestamp)
  source          "manual" | "morning-brief" | "ai-suggested" | "email" | "meeting"
  notes           string?
  linkedSkill     string?
  linkedEmailId   string?
  linkedMeetingId string?
  dueDate         timestamp?

/users/{uid}/decisions/{decisionId}
  id, text, ts, updatedAt
  tags            string[]?
  outcome         "made" | "deferred" | "reversed"?
  linkedTaskId    string?
  context         string?

/users/{uid}/briefs/{briefId}           # briefId = hash(top-12 threadIds + promptVersion + model) + YYYY-MM-DD
  jarvis          string
  billy           string
  generatedAt     timestamp
  inboxSnapshot   string[]
  model           string
  promptVersion   string
  expiresAt       timestamp             # generatedAt + 90min (Firestore TTL)

/users/{uid}/notion_cache/{pageId}
  blocks          object[]
  lastEditedTime  string                # Notion API value, primary cache key
  cachedAt        timestamp
  expiresAt       timestamp             # cachedAt + 24h (Firestore TTL)

/users/{uid}/spark_cache/current
  text            string
  generatedAt     timestamp
  expiresAt       timestamp             # + 24h (Firestore TTL)

/users/{uid}/audit_log/{eventId}        # TTL: expiresAt (ts + 90d)
  event, ts, ip, userAgent, metadata, expiresAt

/config/thread_tags                     # Global config doc (no uid)
  patterns        { DEAL, INT, INFO, INDUSTRY }   # see threadTags.ts shape

/config/priority_rules                  # Global config doc
  rules           { HOT, MED, LOW, overridePatterns }
```

### Indexes

```
tasks:     composite (bucket ASC, done ASC, createdAt DESC)
decisions: (ts DESC)
audit_log: (ts DESC)
briefs:    (generatedAt DESC)
```

### Brief cache strategy

```
briefId = hash(top-12 threadIds + promptVersion + model) + YYYY-MM-DD
```

`PROMPT_VERSION` is an integer constant in `server/lib/prompts.ts` (e.g. `1`, `2`, `3`). Bump it whenever Jarvis or Billy voice prompts are tuned. Integer keeps the hash short and unambiguous.

1. Fetch top-12 Gmail thread IDs → compute hash → briefId
2. `forceRefresh=false` AND cache hit AND not expired → return `{ cached: {..., isStale: false }, streaming: false }`
3. Cache miss OR `forceRefresh=true`:
   - Fetch most-recent prior brief from Firestore
   - Open SSE response
   - Send `{ type: "cached", jarvis, billy, generatedAt, isStale: true }` (or seed brief with `isDemo: true` if no prior cache)
   - Stream Anthropic tokens: `{ type: "token", voice: "jarvis"|"billy", text }`
   - On complete: `{ type: "done", jarvis, billy, generatedAt, briefId }`
   - Write new brief doc to Firestore

Client never shows a spinner. Always has content: seed → stale cache → fresh. Cross-fade on `type: "done"` with 200ms CSS transition.

### Notion cache strategy

```
1. Fetch /users/{uid}/notion_cache/{pageId}
2. If cached:
   a. If cachedAt > 24h → force refresh (sub-page protection)
   b. Else compare cachedDoc.lastEditedTime vs Notion API last_edited_time
      Match → return cached blocks
      Mismatch → fetch full page, overwrite cache
3. If no cache → fetch, write
```

### Seed data fallback

`src/data/seeds.ts` — renders when unauthenticated OR any Firestore read throws.

```ts
export const seeds = {
  isDemo: true,                 // UI shows "demo data — sign in for live"
  tasks: Task[],                // NOW/NEXT/ORBIT samples
  decisions: Decision[],        // 3-5 journal entries
  brief: { jarvis: string, billy: string },  // static v33 brief text
  threads: InboxThread[],       // 8-10 tagged threads
  meetings: MeetingEvent[],     // 2-3 required meetings today
  notionBlocks: NotionBlock[],  // 3-4 Brain blocks with tone dots
  spark: string,                // daily wildcard
}
```

Zustand stores hydrate from seeds synchronously on init. Firestore data overwrites on successful load.

---

## 5. API Proxy Routes

All routes behind `requireAuth`. All writes behind `csrfCheck`.

### Route map

```
POST /api/claude/brief          Brief generation (SSE or cached JSON)
POST /api/claude/chat           Billy chat drawer (SSE stream)
POST /api/claude/spark          Spark card generation

GET  /api/gmail/threads         List threads (top 20, tagged + prioritized)
GET  /api/gmail/threads/:id     Full thread (meeting prep, triage read)
POST /api/gmail/send            Send reply (audit logged)
POST /api/gmail/label           Apply label
POST /api/gmail/archive         Archive thread

GET  /api/calendar/events       Today + tomorrow, required attendee filter
GET  /api/calendar/events/:id   Single event

GET  /api/notion/brain          Brain hub + sub-pages (cached)

GET  /api/csrf                  CSRF token bound to session
```

### Rate limits (per session)

```
/api/claude/brief   5/min
/api/claude/chat   30/min
/api/claude/spark   5/min
/api/gmail/send     5/min   (hard cap, audit logged)
/api/gmail/*       60/min
/api/calendar/*    30/min
/api/notion/*      20/min
```

All `429` responses include `Retry-After` header. Client shows toast, no crash.

### Thread tagging engine (`server/lib/threadTags.ts`)

Pure rule-based, v1. Patterns loaded from Firestore `/config/thread_tags`, hardcoded fallback in `seeds.ts` if unreachable.

```ts
const TAG_PATTERNS = {
  DEAL: {
    domains: ["creel.mx", "magneticlabs.com", "apple.com", "netflix.com",
              "andersen.com", "llh.com.mx", "gbm.com", "morenafilms.com", "onzafilms.com"],
    senders: ["mirna alvarado", "tyler gould", "alex ferrando", "mauricio llanes",
              "pilar benito", "santiago de la rica", "rene cardona", "bernardo gomez", "lebrija"]
  },
  INT:      { domains: ["lemonfilms.com"] },
  INFO:     { domains: ["theblacklist.com", "anthropic.com"],
              subjectIncludes: ["payment", "receipt", "newsletter", "digest", "your order"] },
  INDUSTRY: { domains: ["canacine.org.mx", "imcine.gob.mx", "focine.gob.mx", "sofiasalud.com"],
              senders: ["uriel de la cruz"] }
}
```

### Priority rules (`/config/priority_rules`)

```
HOT: DEAL tag AND (unread OR <12h old) AND sender is named counterparty
MED: DEAL without HOT criteria, OR INT with action verbs in subject
     ("review", "approve", "decide", "needs", "deadline")
LOW: INFO and INDUSTRY default, any thread untouched >7 days
Override: subject contains "URGENT"|"DEADLINE" or matches /\b(today|tomorrow|EOD|COB)\b/i → force HOT
```

### Error shape

```ts
// Success
{ data: T, cached?: boolean, generatedAt?: string }

// Error
{ error: { code: "UNAUTHENTICATED"|"FORBIDDEN"|"RATE_LIMITED"|"UPSTREAM_ERROR"|"CACHE_MISS",
           message: string, retryable: boolean } }
```

---

## 6. Frontend Architecture

### Zustand stores

```ts
useAuthStore     // { user, isAuthenticated, isDemo }
useBriefStore    // { jarvis, billy, isStale, isStreaming, generatedAt }
useTaskStore     // { tasks, create, update, delete, moveBucket, queueMutation }
useInboxStore    // { threads, triageMode, activeThread }
useCalendarStore // { events }
useBrainStore    // { blocks }
useSparkStore    // { text, isStale }
useDecisionStore // { decisions, searchQuery, add, search, exportMd, queueMutation }
useUIStore       // { drawerOpen, activeModal, skillLauncherOpen,
                 //   activeContext: { kind: 'thread'|'task'|'decision'|'spark'|null, id } }
useConfigStore   // { tagPatterns, priorityRules }
```

### Component tree

```
App
├── AuthGate
├── DemoBanner                  // visible when isDemo=true
└── Dashboard
    ├── Header                  // wordmark, Sync All, SyncingPill
    ├── BriefPanel              // Jarvis (Fraunces 19px) + Billy (Inter 15px)
    ├── NextUpBar               // required meetings, click → MeetingPrepModal
    ├── MainGrid
    │   ├── TasksPanel
    │   │   ├── TaskColumn("now")
    │   │   ├── TaskColumn("next")
    │   │   └── TaskColumn("orbit")
    │   ├── InboxPanel
    │   │   ├── ThreadList
    │   │   └── TriageMode      // full-screen overlay
    │   └── BrainPanel
    │       └── NotionBlockList // tone dots: hot/active/cool
    ├── SparkCard               // Fraunces italic, "new spark" bypass
    ├── DecisionJournal         // one-line input, list, search, export .md
    └── SkillLauncher           // floating FAB, 27-skill grid + search

// Portals
├── BillyDrawer                 // 420px desktop / full-width mobile
├── MeetingPrepModal
└── SkillModal
```

### Brief streaming state machine

```
idle → streaming → complete

1. isStreaming=true, isStale=true → SyncingPill appears
2. SSE to POST /api/claude/brief
3. event type="cached" → render stale jarvis+billy (cross-fade in, 200ms)
4. event type="token" → accumulate into streaming buffers
5. event type="done" → swap buffers → isStreaming=false, isStale=false → SyncingPill gone
6. error → revert to last known, toast
```

### Optimistic write queue

Shared utility across `useTaskStore` and `useDecisionStore`:

```ts
// Map<resourceId, Promise<void>> per store
queueMutation(id: string, fn: () => Promise<void>): Promise<void>
// New mutation on same id chains to previous Promise
// Different ids run in parallel
// 5-second timeout → toast "Save slow, retrying" + re-queue
```

### Triage mode keyboard shortcuts

```
H → tag HOT        M → tag MED        L → tag LOW
R → Reply          A → Archive        S → Snooze
F → Forward        E → read in BillyDrawer (stay in triage)
J/K or ←/→ → prev/next thread
ESC → exit triage  ? → keyboard help overlay
```

### Skill Launcher context injection

`useUIStore.activeContext: { kind: 'thread'|'task'|'decision'|'spark'|null, id: string }`

| Active context | Injected into skill |
|---------------|---------------------|
| BillyDrawer thread loaded | `threadContext: { id, subject, from, body }` |
| Task detail modal open | `taskContext: { id, title, notes, linkedEmailId, linkedSkill }` |
| Decision selected | `decisionContext: { id, text, context, tags }` |
| SparkCard hovered/clicked | `sparkContext: { text, generatedAt }` |
| Nothing focused | No pre-context, user pastes manually |

"Use last result as input" toggle — chains skill output as next skill's input context (e.g., lemon-coverage → logline-extractor).

### Design tokens (Tailwind)

```ts
// tailwind.config.ts
colors: {
  'bg-base': '#15110e',
  'bg-surface': '#1c1816',
  'bg-elevated': '#221d1a',
  'accent-lemon': '#f5d547',
  'accent-coral': '#d97757',
  'accent-blue': '#8ab4d6',
  'accent-sage': '#a8b89a',
  'accent-rose': '#c97062',
  'text-primary': '#f5ede2',
  'text-secondary': '#c9b9a3',
  'text-tertiary': '#8a7a65',
  'text-muted': '#5a4d3f',
  'border-soft': 'rgba(180,140,100,0.08)',
  'border-medium': 'rgba(180,140,100,0.14)',
  'border-strong': 'rgba(200,160,110,0.22)',
}
fontFamily: {
  display: ['Fraunces', 'serif'],
  body: ['Inter', 'sans-serif'],
}
```

---

## 7. Environment Variables

```bash
# Railway (server-side only)
ANTHROPIC_API_KEY=          # Named lemon-lemon-ai-center in Anthropic console
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=        # https://{railway-domain}/auth/google/callback
TOKEN_ENCRYPTION_KEY=       # 32-byte hex, AES-256-GCM key for refresh tokens
SESSION_SECRET=             # express-session secret
ALLOWED_EMAILS=billy@lemonfilms.com
ALLOWED_ORIGIN=             # https://{railway-domain}
NOTION_BRAIN_PAGE_ID=33e9ea4083a280b2a8a5ece897250a7e
NOTION_API_KEY=

# Firebase (server-side — Admin SDK)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Frontend (build-time, Vite — public, non-secret)
VITE_APP_TITLE=Lemon AI Center
```

---

## 8. Repo Hygiene Files

- `CLAUDE.md` — project conventions for future Claude Code sessions (from MASTER-LIBRARY AGENTS.md)
- `DESIGN.md` — design system spec (tokens, typography, component patterns)
- `README.md` — setup, env vars, run, deploy
- `.env.example` — all vars above with blank values
- `.gitignore` — node_modules, .env, dist, server/dist, .DS_Store
- `railway.json` — build + start commands
- `.agent/` — APP-TEMPLATE v3 agents from MASTER-LIBRARY (core + business/ops domain)

---

## 9. Seed Data Note

`src/data/seeds.ts` populates from v33 artifact content (pasted by Billy after spec approval). Seed tasks, threads, meetings, brief text, and decisions match real current-world state as of spec date. Seeds are static strings — no fake timestamps. UI renders `DemoBanner` ("demo data — sign in for live") whenever `isDemo: true`.

---

## 10. Not in v1

- Subtasks, assignee, recurrence, estimated time
- ML-based email tagging (v2, after labeled examples accumulate)
- Multi-user / team access
- Notion write operations
- Task drag-and-drop across columns (v1.1)
- Task detail modal with notes field (v1.1)
- Skill output history / chained session memory
- Mobile PWA / push notifications
