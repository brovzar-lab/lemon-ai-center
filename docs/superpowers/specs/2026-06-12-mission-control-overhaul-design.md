# Mission Control Overhaul — Design

**Date:** 2026-06-12
**Status:** Approved by Billy (design review in brainstorming session)
**Delivery:** Big-bang — one milestone, everything lands together (Billy's explicit choice). Work is internally sequenced (Engine → data → UI → Advisor → Personal OS) but ships as a single transformation.

## 1. Problem

Lemon AI Center today is a well-built *reader*, not a *partner*. Billy's verdict on the morning experience: stale (everything manual), about the wrong things (emails instead of the fund/scripts/deadlines), shallow (summarizes, never advises), and consequently not trusted. Specifically:

1. **Zero background jobs.** Brief, inbox scan, task generation all require manual clicks.
2. **His real objects are not in the product.** The $300M MXN Lemon Trust I raise, the 7 slate screenplays he is personally writing, the Oxido Jalisco Dec 31 2027 funding deadline, Las Azules S2 / Los Corruptores — none exist as first-class data.
3. **No advisor function.** The AI never analyzes, warns, or recommends.
4. **Broken learning loop.** Corrections go nowhere; Memory isn't auto-taught; Waiting On and Delegation Queue panels are wired to empty arrays.
5. **Personal goals invisible.** Anti-burnout, family (5 kids), writing time, AI ambitions, stocks — absent.

## 2. Decisions made (calibration answers)

| Question | Billy's answer |
|---|---|
| #1 letdown | All of the above (stale + wrong things + shallow + untrusted) |
| Home screen | **Mission Control** — the morning brief becomes one panel inside it |
| Layout | **B — The Spine** (editorial ranked feed; Advisor speaks first) |
| AI autonomy | **Read + organize freely, act with approval** — outward-facing actions (send email, calendar changes) queue for one-tap approval |
| Advisor style | **Brutally honest, daily + weekly** — with a settings toggle to switch to supportive "consigliere" tone |
| Personal scope | **All four now:** burnout guardrails, writing protection, AI leverage tracker, stocks/personal wealth |
| Build approach | **A — Big-bang rebuild** (one milestone, single reveal) |

## 3. The Spine (new home screen)

Replaces the briefing layout as home (`view='spine'`, default). Existing editorial design system (chocolate/parchment/lemon-gold, Fraunces/Inter) is kept.

Top to bottom:

1. **Advisor daily note** — the first thing on screen. What you're avoiding, what's at risk, what deserves you today. Tone per settings toggle (`advisorTone: 'brutal' | 'consigliere'`, default brutal).
2. **Five fronts as ranked bands**, reordered every morning by the engine's ranker:
   - **Fund** — Lemon Trust I: committed vs $300M MXN progress bar, investor pipeline summary, next action
   - **Writing** — the 7 slate scripts: stage, staleness, today's protected block
   - **Shows** — streamer projects (Las Azules S2, Los Corruptores, + active development)
   - **Deals** — pipeline summary, slipping deals
   - **You** — burnout score + trend, AI ventures, watchlist snapshot
   A quiet front collapses to a one-line band; a front that needs Billy expands with its next actions inline. Rank = f(deadline proximity, staleness, slip count, explicit pins).
3. **Today panel** — One Thing, calendar (today; tomorrow after 6pm per his briefing rules), hot inbox threads, Waiting On (now real data).
4. **Evening mode** — after 18:00 the Spine flips: end-of-day wrap, tomorrow preview.

Navigation: Spine (home) · Fund · Writing · Projects · Deals · Inbox Intel · You · Memory · Archive. Existing Deals/Projects/Inbox Intel/Memory/Archive views are kept (restyled where needed). Three new views:

- **Fund view** — investor pipeline kanban (contacted → interested → docs → committed / passed), per-investor: org, amount, last touch, next action, linked threads. Committed total vs target chart. Manual edit + auto-update from scans.
- **Writing view** — the 7 scripts as cards: stage (idea → outline → draft N → polish → delivered), last-touched, target date, staleness flag, notes; link to vault note.
- **You view** — burnout dashboard (meeting hours, late-night emails, days since break, writing minutes), AI ventures tracker, watchlist/holdings, protected-time suggestions.

## 4. The Engine (background scheduler)

Server-side `node-cron` scheduler in the existing Express app (Railway runs persistently). Jobs run as the single primary user using the already-stored encrypted refresh tokens — no active session required. All times America/Mexico_City.

| Time | Job | What it does |
|---|---|---|
| 04:30 daily | **Inbox scan** | Existing `/api/scan/inbox` logic, invoked headlessly: extracts deals, projects, delegations, memories from overnight threads → writes to LEMON Firestore + updates Fund/Script/Deadline trackers |
| 05:30 daily | **Morning assembly** | Ranks the five fronts; generates the 3-pass brief; generates Advisor daily note. Everything waiting at 6am. |
| Hourly 07–22 | **Slip detection** | Overdue delegations, unanswered sent threads (>3 days), stalled deals (no movement >7 days), stale scripts (no vault touch >14 days), approaching deadlines. Thresholds are constants in one module, tunable. Writes `Slip[]` consumed by Spine bands + Inbox Intel. |
| Nightly 23:00 | **Metrics + learning** | Burnout metrics from calendar density + late-night sent mail + weekend activity; distills corrections/snoozes/swaps into auto Memory entries; writes daily digest back to vault (git commit + push). |
| 18:00 daily | **Evening wrap** | End-of-day summary + tomorrow preview for the Spine's evening mode. |
| Sun 17:00 | **Weekly CEO review** | Attention analysis (calendar hours by front, email volume by front) vs stated priorities; stalled items; risk flags; ONE strategic recommendation. |
| Market close (weekdays) | **Watchlist snapshot** | Quotes for tickers in watchlist via free market-data API. |

**Engine reliability rules:**
- Every job writes a heartbeat doc (`engine/jobs/{jobId}`: lastRun, status, error). The UI shows freshness everywhere ("scan 04:30 ✓").
- A failed job surfaces as a banner in the Spine. **Never silent staleness** — stale trust is what killed v1.
- Jobs are idempotent and individually retryable; a manual "run now" button exists per job in settings.

**Autonomy boundary:** the engine reads and reorganizes freely (trackers, memories, labels, internal state). Outward-facing actions — sending email, modifying calendar — are queued as `AIAction`s pending one-tap approval, reusing the existing AIAction/undo infrastructure.

## 5. New data model (additions to `shared/types.ts`, stored in LEMON Firestore unless noted)

- `Front` — `{ key: 'fund'|'writing'|'shows'|'deals'|'you', rank, headline, status: 'quiet'|'attention'|'critical', items[] }` (computed daily, cached)
- `Investor` — `{ id, name, org, stage: 'contacted'|'interested'|'docs'|'committed'|'passed', amountMXN, lastTouch, nextAction, linkedThreadIds[] }`
- `FundState` — `{ targetMXN: 300_000_000, committedMXN (derived), notes }`
- `Script` — `{ id, title, slatePosition, stage: 'idea'|'outline'|'draft'|'polish'|'delivered', draftNumber?, lastTouchedAt, targetDate?, vaultPath, stale (derived) }` — `lastTouchedAt` from vault git activity for the linked note, plus manual override
- `Deadline` — `{ id, title, date, severity: 'hard'|'soft', linkedEntity?, source }` (e.g., Oxido Year-2 funding 2027-12-31)
- `Slip` — `{ id, kind: 'delegation'|'thread'|'deal'|'script'|'deadline', refId, summary, detectedAt, severity, dismissed }`
- `AdvisorNote` — `{ date, headline, body, callouts[], tone }`
- `WeeklyReview` — `{ weekOf, attentionByFront, stalls[], risks[], recommendation, scorecard }`
- `BurnoutDay` — `{ date, meetingHours, lateNightEmails, weekendActivity, writingMinutes, daysSinceBreak, score 0–100 }`
- `AIVenture` — `{ id, name, stage, nextAction, lastTouch, notes }` (seeded: CARPETIFY, Fractal Story Room, Topsheet AI)
- `WatchlistItem` — `{ ticker, shares?, costBasisUSD?, notes }` + `QuoteSnapshot` cached server-side
- `EngineJob` — `{ jobId, lastRun, lastSuccess, status, error? }` (primary Firestore)
- Settings additions — `{ advisorTone: 'brutal'|'consigliere', protectedBlocks[], quietHours }`

Trackers are **seeded from the vault** at first run (fund details, slate, deadlines, ventures verified against wiki notes during implementation), then maintained by the engine + manual edits. Numbers shown in design mockups ($182M committed, burnout 71) were illustrative only.

## 6. The Advisor

- **Daily note** (05:30 job): Opus-class model; context = all trackers, slips, burnout, today's calendar, relevant vault chunks, recent corrections. Output: headline + 2–4 callouts, each citing its source facts (same zero-hallucination citation discipline as the brief, fact-check pass included). Brutal by default; consigliere via settings toggle changes the system prompt's register, not the facts.
- **Weekly CEO review** (Sun 17:00): computes attention-by-front from calendar event classification + sent-mail volume; compares against stated priorities (vault `briefing-rules` + pinned fronts); lists stalls and risks; exactly one strategic recommendation. Rendered as its own document in the Spine Monday morning, narrated via existing TTS on demand.

## 7. Learning loop + vault write-back

- **Corrections → Memory:** nightly job distills the day's corrections, snoozes, dismissals, and One-Thing swaps into proposed Memory entries (`source: 'auto'`, active by default, reviewable/toggleable in Memory view — existing UI).
- **Ranking feedback:** repeated dismissal of a front's items lowers that signal's weight; pins raise it.
- **Vault write-back:** nightly job writes `Jarvis/dashboard/YYYY-MM-DD.md` (daily digest: fund movement, script touches, decisions, advisor headline) into the vault clone and git commits/pushes. The vault remains the source of truth for project knowledge; the dashboard becomes a contributor to it.

## 8. Personal OS

- **Burnout guardrails:** nightly `BurnoutDay` computation; score and 7-day trend on the You front; Advisor calls out threshold crossings (e.g., >9 meeting-hours/day average, late-night email streaks, zero writing minutes in a week with slate deadlines). Knows family time matters: weekend/evening activity raises the score.
- **Writing protection:** scripts gone >14 days untouched are flagged on the Writing front; the engine proposes protected writing blocks as calendar suggestions (queued AIActions — approval required since calendar is outward-facing).
- **AI leverage:** AIVenture tracker + a daily "AI opportunity" insight tuned to making money with AI (replaces/absorbs Spark; same cached-daily pattern).
- **Stocks:** manual watchlist/holdings entry; daily close snapshot via **Finnhub free tier** (60 calls/min, ample for a watchlist; key in server env). If the key is absent the You view shows the watchlist without quotes — graceful no-op, same pattern as LEMON Firestore config. No trading, no brokerage link in this milestone.

## 9. Security & privacy

- Engine jobs reuse existing encrypted-refresh-token infrastructure; tokens never logged, `TOKEN_ENCRYPTION_KEY` never in Firestore (existing rules hold).
- Vault write-back uses the existing vault git credentials; commits contain digest text only, no tokens/secrets.
- Market API key server-side only.
- All new routes behind `requireAuth` + `csrfCheck` per project convention.

## 10. Error handling

- Job ledger + UI freshness stamps everywhere; failure banners in the Spine.
- Advisor/brief generation failures degrade gracefully (show last good note with its date, marked stale) — never a blank home.
- Tracker auto-updates from scans are additive and attributed (`source: 'auto'`) so a bad extraction is visible and reversible, mirroring the existing AIAction undo pattern.

## 11. Testing

- Vitest units for: front ranker, slip detection heuristics, burnout scoring, correction-distillation input shaping, deadline countdown/severity, fund committed-total derivation.
- Prompt-consuming jobs tested with fixture contexts (no live API in tests).
- Engine scheduler tested via injected clock; jobs tested as plain async functions.
- Existing typecheck (`npm run typecheck`) and test suite must stay green.

## 12. Fresh-eyes revision (2026-06-12, pre-build)

Reviewed against the actual codebase before building. Changes:

1. **Boot catch-up:** every engine job writes a ledger doc; on server boot, any job whose last success is older than its period runs immediately. Railway restarts must not silently kill the schedule.
2. **Approvals strip:** pending outward-facing `AIAction`s render as a one-tap approve/dismiss strip at the top of the Spine's Today panel.
3. **Chat with tools:** the Billy Drawer chat gets Anthropic tool use over the trackers (update investor stage/amount, script stage, deadlines, ventures, watchlist, deals, delegations). Internal reorganization is allowed directly per the autonomy boundary; outward actions still queue as AIActions.
4. **Vault seeding concretized:** a first-run idempotent `seed-from-vault` job extracts investors, the 7 scripts, hard deadlines, and AI ventures from named wiki notes (`wiki/deals/lemon-trust-i.md`, `wiki/projects/*.md`, `wiki/deals/*.md`) via Claude, skipping any collection that already has data.
5. **Simplified data plumbing:** the secondary LEMON Firebase is already deprecated — all data lives in primary Firestore under `users/{uid}/...`. New trackers are plain Firestore collections (`investors`, `scripts`, `deadlines`, `ventures`, `watchlist`, plus `state/*` singleton docs for fronts/slips/burnout/quotes/wrap and `advisor/*` notes). The client subscribes in real time using the existing store pattern; no new REST CRUD layer. Engine-only routes: `GET /api/engine/status`, `POST /api/engine/run/:jobId`.
6. **Shows front** derives from the existing projects store — no new collection.
7. **Home view id** stays `'briefing'` for localStorage compatibility but renders the new Spine; new view ids: `'fund'`, `'writing'`, `'you'`.

## 13. Out of scope (this milestone)

- Sending email / changing calendar without approval (full-copilot mode)
- Brokerage integration or trade execution
- Mobile PWA, multi-user/team features (per spec section 10 exclusions)
- Push notifications to phone (in-app freshness + optional future digest email)
- Notion (deprecated; vault-only stands)
