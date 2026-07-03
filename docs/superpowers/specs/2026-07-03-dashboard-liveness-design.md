# Dashboard liveness — auto-generate on arrival + manual refresh

**Date:** 2026-07-03
**Status:** Approved design — ready for implementation plan
**Scope:** LEMON-AI-CENTER dashboard (`BriefingView` spine + `InboxIntelView`)

## Problem

Opening the dashboard, three panels sit dormant behind a manual "wake the AI"
click instead of already showing current, actionable intelligence:

- **Advisor** (`AdvisorCard`) — empty until you click "Generate now".
- **Five Fronts** (`FrontBands`) — empty until you click "Rank now".
- **Inbox Intel** (`InboxIntelView`) — thin/empty until data is scanned; the
  only prompt is a manual "Ask Billy: what am I missing?".

Root cause: each panel is fed by a Mission-Control **engine job**, and those
jobs only run on a schedule (`morning_assembly` 05:30, `slip_detect` hourly,
`inbox_scan` every 2h). Scheduling runs on **Railway Cron only** — locally
(`npm run dev`) nothing runs the schedule except a one-time boot catch-up, so
the panels' backing state is absent or stale on arrival and the UI falls back
to a dormant "Generate now" state.

The engine already writes its output to Firestore and the frontend already
subscribes live (`useMissionStore`), and `runJob(jobId)` already exists to
trigger a job on demand. The gap is purely that nothing triggers generation
*when the user arrives and the data is stale*.

## Goal

When Billy opens the dashboard and a panel's backing data is missing or stale,
the panel **auto-triggers its engine job**, shows a "working…" state, and fills
in live — and every panel exposes an explicit **manual refresh**. Populated
state, not a dormant button. Works identically locally and deployed.

### Non-goals (deferred to a follow-up pass)

- **Item 3** — collapse the Brain panel by default / de-prioritize it.
- **Item 4** — calendar time-grid with a "now" line when there are no meetings.

These are independent UX tweaks, explicitly scoped out of this design.

## Decisions

- **Approach A — per-panel freshness hook** (chosen over a centralized
  orchestrator or a server "ensure-fresh" endpoint). Most idiomatic: it uses
  the ledger and API that already exist, each panel keeps its own refresh
  affordance, and the staleness logic is a pure, testable function. No new
  server endpoints.
- **"Generate always" = always *populated*, not re-run every load.** Auto-run
  only when the backing job is stale; serve cache otherwise. Manual refresh
  forces a run. Re-running fresh AI output on every page load would be slow and
  burn tokens for no gain.
- **Staleness threshold = each job's own period.** A job is stale when
  `now − lastSuccess > periodMs` — the same definition the engine's boot
  catch-up already uses, so client and server never disagree.

## Architecture

### Single source of truth for job periods — `shared/engineJobs.ts` (new)

Job periods currently live only in the server's `JOBS` array
(`server/lib/engine/index.ts`). Lift them into `shared/` so the client can read
the same numbers:

`EngineJobId` includes `seed_from_vault`, which has no schedule/period, so the
period map is keyed on the scheduled jobs only:

```ts
import type { EngineJobId } from './types'

/** The scheduled jobs — everything except the boot-only seed_from_vault. */
export type ScheduledJobId = Exclude<EngineJobId, 'seed_from_vault'>

export const ENGINE_JOB_PERIOD_MS: Record<ScheduledJobId, number> = {
  inbox_scan: 2 * 3_600_000,
  morning_assembly: 24 * 3_600_000,
  slip_detect: 3_600_000,
  evening_wrap: 24 * 3_600_000,
  nightly: 24 * 3_600_000,
  weekly_review: 7 * 24 * 3_600_000,
  watchlist: 24 * 3_600_000,
}

/** A job is stale when its last success is older than its period. Absent = stale. */
export function isEngineJobStale(
  lastSuccessISO: string | undefined,
  periodMs: number,
  now: number,
): boolean {
  if (!lastSuccessISO) return true
  const t = new Date(lastSuccessISO).getTime()
  if (Number.isNaN(t)) return true
  return now - t > periodMs
}
```

`server/lib/engine/index.ts` is refactored to import `ENGINE_JOB_PERIOD_MS`
for its `JOBS[].periodMs` values, so there is one source of truth. Boot
catch-up behavior is unchanged (it keeps its existing `* 1.25` grace factor;
the client uses the raw period so the user sees fresh data slightly sooner).

### The hook — `src/hooks/useEngineFreshness.ts` (new)

```ts
useEngineFreshness(jobId: ScheduledJobId): {
  running: boolean          // job is running now (from the live ledger)
  stale: boolean            // lastSuccess older than the job's period
  lastSuccess?: string
  error?: string
  refresh: () => void       // force runJob(jobId), bypassing staleness
}
```

Behavior:

- Reads the job's ledger entry from `useMissionStore((s) => s.engineJobs)`
  (each has `status: 'running'|'ok'|'error'`, `lastSuccess`, `error`).
- Computes `stale` via `isEngineJobStale(lastSuccess, ENGINE_JOB_PERIOD_MS[jobId], Date.now())`.
- **On mount**, if `stale && !running` and the user is signed in (not demo),
  calls `runJob(jobId)` exactly once. A `useRef` latch prevents re-firing when
  the live ledger update re-renders the hook.
- `refresh()` calls `runJob(jobId)` unconditionally (forced re-run) and re-arms
  as appropriate.
- Never auto-triggers in demo / signed-out (the API is authed; a trigger would
  401). Uses `useAuthStore((s) => s.isDemo)`.

Concurrency: the server's existing per-process `running` Set already dedupes
overlapping triggers, so multiple panels mounting at once is safe.

## Component changes

### AdvisorCard (item 1) — `src/components/spine/AdvisorCard.tsx`

- Use `useEngineFreshness('morning_assembly')`.
- Replace the dormant empty state's "Generate now" button with a **working
  state** — *"The Advisor is writing your note…"* — shown while `running` (or
  while an auto-trigger is in flight and no note exists yet).
- Auto-trigger fires when there's no note for today or the job is stale.
- Move a small **Refresh** control into the card header so it's always
  available, not only in the empty state. Keep the existing `(stale)` /
  `(degraded)` badges.

### FrontBands (item 2) — `src/components/spine/FrontBands.tsx`

- Use `useEngineFreshness('slip_detect')`.
- Empty/stale → working state *"Ranking your fronts…"*; auto-trigger when the
  ranking is older than 1h (the job period).
- Add a **Refresh** control beside the existing "ranked Xm ago" label.

### InboxIntelView (item 5) — `src/components/views/InboxIntelView.tsx`

The narrative is computed client-side from live stores (`threads`, `deals`,
`projects`, `delegations`) via `detectSlippingThreads` / `…OverdueDelegations`
/ `…StallingDeals`; `inbox_scan` is the job that keeps `deals`/`projects`/
`delegations` populated from email.

- Use `useEngineFreshness('inbox_scan')` so the AI email-extraction is
  refreshed on arrival (it already auto-fetches Gmail threads on mount).
- Replace the bare empty / "All clear" gap with a **working state** —
  *"Reading your inbox…"* — while a scan or the inbox fetch is in flight.
- Add a **Refresh** control in the header, kept separate from the existing
  "Ask Billy: what am I missing?" button (that opens the chat drawer — a
  different action, left as-is).
- The narrative logic is unchanged. If nothing is genuinely slipping, "All
  clear" still shows — but it is now proactively computed on arrival, not gated
  behind a manual click.

## Cost & safety

- Thresholds equal each job's period, so a normal first-open-of-the-day
  triggers at most one of each job; re-opens inside the window serve cached
  Firestore state with zero AI calls.
- Manual **Refresh** is the only way to force a run inside the fresh window.
- The `useRef` latch + server `running` Set prevent trigger loops and
  duplicate concurrent runs.
- Demo / signed-out never auto-triggers.

## Testing

- **`shared/engineJobs.test.ts`** — `isEngineJobStale`: absent → stale;
  within period → fresh; past period → stale; malformed date → stale.
- **`src/hooks/useEngineFreshness.test.ts`** — with a mocked mission/auth
  store: auto-triggers once when stale + signed-in; does not trigger when
  fresh, when running, or in demo; `refresh()` forces a run; the ref latch
  prevents a second auto-trigger on ledger re-render.
- **Component tests** (as the existing harness allows) — each panel shows its
  working state while `running` and renders content when the store updates.

## Files touched

| File | Change |
|---|---|
| `shared/engineJobs.ts` | **new** — periods + `isEngineJobStale` |
| `shared/engineJobs.test.ts` | **new** — staleness unit tests |
| `server/lib/engine/index.ts` | import periods from shared (single source of truth) |
| `src/hooks/useEngineFreshness.ts` | **new** — the hook |
| `src/hooks/useEngineFreshness.test.ts` | **new** — hook tests |
| `src/components/spine/AdvisorCard.tsx` | working state + auto-trigger + header refresh |
| `src/components/spine/FrontBands.tsx` | working state + auto-trigger + refresh |
| `src/components/views/InboxIntelView.tsx` | freshness trigger + working state + refresh |

No new server routes; `runJob` (`POST /api/engine/run/:jobId`) and the
`useMissionStore` Firestore subscription are reused as-is.
