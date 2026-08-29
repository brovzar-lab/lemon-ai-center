# HANDOFF — LEMON-AI-CENTER

> To resume: read this file, then continue. Branch `killer-features`, PR #6 open.

## Headline
**Inbox Copilot (killer feature #1) is built, reviewed, and just live-driven successfully on Billy's real inbox.** It is in **PR #6** (https://github.com/brovzar-lab/lemon-ai-center/pull/6), not yet merged. Earlier this session, the SDK 0.110 + Sonnet 5 upgrade (PR #5) was merged to main and deployed.

## What the live drive confirmed (2026-07-09)
Billy signed into the dev app in his own browser and opened the deck. Confirmed working on live data (from his screenshot):
- The coral **"Triage 2 hot"** button appeared (the hotCount>0 gate works).
- The deck opened full-screen: "1 of 2", a real thread ("Apoyos Lemon" from Mauricio Martinez Vallejo <mmartinez@gbm.com>).
- A reply was **drafted in Billy's voice**: "Hola Mauricio, Great to meet you y buen talk hoy. Confirmo la reunión, ahí estaré. Cualquier cosa que necesites de mi lado antes, avísame. Best. Billy" — bilingual ES/EN, no em dashes, signed Billy. Exactly the voice-profile behavior.
- The keybar rendered: "Enter/S send · E edit · Space/→ skip · ← back · U undo · R retry · Esc close".

**Still not exercised in the live drive** (the remaining verification): pressing E to edit, pressing S to see the 5-second "Sending… Undo" bar, pressing U to cancel, and one real send to Billy's own address. Do these to fully close the loop, then merge.

## Next action
Finish the hands-on check, then merge PR #6.
- Billy drives in his logged-in browser (the MCP preview browser is a SEPARATE session I cannot screenshot — see Infra learnings). Steps: open Triage → E to edit a word → Esc → →/← to move → S (watch the 5s Undo bar) → U to cancel. Then one real send to his own address only.
- If it all holds: `cd /Users/quantumcode/CODE/LEMON-AI-CENTER && gh pr merge 6 --merge` (deploys it).

## What came up (discuss next session)
1. **Draft voice quality.** The live draft read well but had a slightly rough Spanglish patch ("Great to meet you y buen talk hoy"). Worth deciding: tune the voice profile / drafting prompt, or leave it (Billy edits before send anyway). Billy flagged wanting to discuss.
2. **Preview vs this app's two-server setup.** `preview_start` injects `PORT` and assumes one server; this app is Vite (5175, pinned for OAuth/CORS) + Express (3001, proxy target). We worked around it with a `dev:preview` script (commit 90358d0). Decide: keep it, or is the plain `npm run dev` in a terminal the norm and preview not worth supporting?
3. **The MCP preview browser can't carry Billy's Google login**, so I can't screenshot-drive the authed deck — only Billy can drive the real session. Worth knowing for any future live UI work: I drive demo-mode UI + backend via curl; Billy drives anything authed.
4. **Deferred follow-ups** (below) — which, if any, to do before or right after merge (the stale-cache flag is the most substantive).
5. **What's next after Copilot** — pick the next killer feature.

## Infra learnings (so we don't rediscover them)
- Dev = two servers: **Vite on 5175** (the URL you hit; OAuth redirect + CORS + ALLOWED_ORIGIN pinned to localhost:5175) and **Express on 3001** (Vite proxies `/api` → 3001). Express reads `PORT` env (default 3001).
- `preview_start` injects `PORT=<launch port>` and this breaks Express (it binds the wrong port; every `/api` call refuses). Fix committed: `dev:preview` npm script forces `PORT=3001` for the server; `.claude/launch.json` sets port 5175 + `autoPort:false`. Verify a good boot with: `curl localhost:3001/health` → `{"ok":true}` and `curl localhost:5175/api/copilot/drafts` → HTTP 401.
- Always kill stale dev processes before starting: `pkill -f "tsx watch server/index.ts"; pkill -f "concurrently"; pkill -f vite`. Stale servers caused a lot of confusion this session.
- A dev/preview server may be running right now (Vite 5175 / Express 3001). Kill + restart clean if in doubt.

## Locked decisions
- Design spec: `docs/superpowers/specs/2026-07-08-inbox-copilot-design.md`. Plan: `docs/superpowers/plans/2026-07-08-inbox-copilot.md`. SDD ledger (gitignored scratch): `.superpowers/sdd/progress.md`.
- Send safety is non-negotiable: show-then-send (draft always visible) + 5-second client-side unsend; sends go through the existing Zod-validated, CRLF-sanitized, audit-logged `/api/gmail/send`. A sent thread is marked and cannot be re-sent (dup-send guard); key auto-repeat cannot fire a send.
- Model IDs route through `shared/models.ts` (smart=opus-4-8, balanced=sonnet-5, fast=haiku-4-5); balanced calls pass `thinking: { type: 'disabled' }`. SDK 0.110: stream via `on('text')`+`finalMessage()`, never `textStream`; never type an SDK stream as `any`.
- Vitest hooks use block bodies (`afterEach(() => { vi.x() })`); the arrow-return form fails `tsc` (TS2322) and `vitest run` misses it — always run `npm run typecheck`.
- DESIGN.md: no warm/brown/cream/amber/gold; cool tokens + data colors only.
- Every substantive change gets the two-agent adversarial review before merge (it caught a data-loss bug, a timer race, an out-of-range crash, an SSE flush gap, and a duplicate-send bug this feature).

## Open loops
1. Finish the Copilot live drive (edit/undo/one real send) + merge PR #6.
2. **Firebase console sign-in-provider check** (Billy's 2-min manual task, still open).
3. **Deferred Copilot follow-ups** (in the PR body, all fail-safe): the spec-§8 stale-cache flag (needs `latestMessageId` on `InboxThread`); reset `sentThreadIds` on rescan; address-extraction duplicated in 3 places; ReplyModal still duplicates the send helper.
4. **The other 6 killer features** (proposal `docs/product/2026-07-08-killer-features.md`): Promise Keeper, Relationship Radar, Do-Anything Bar, Propose Times, One-Key Delegate, Decision Echo, Ask the Brain by voice. Same brainstorm→spec→plan→subagent-build flow.

## How to run + verify
- Dev (terminal, the normal way): `npm run dev` → Vite 5175 + Express 3001. Hit http://localhost:5175. Under the preview pane instead: `dev:preview` via `.claude/launch.json` (already wired).
- Checks (all green on killer-features): `npm run typecheck`, `npm test` (449 tests, 72 files), `npm run build`.
- Prod: https://ceo.billyrovzar.com (Railway + Cloudflare Tunnel). `GET /health`, `GET /api/ready`.

## Branch state
`killer-features` = main + SDK-upgrade history + Inbox Copilot (Tasks 1-15 + fixes) + docs + the dev:preview chore. Clean working tree. New feature code: client `src/lib/copilot/`, `src/lib/inbox/extractEmail.ts`, `src/stores/useCopilotStore.ts`, `src/components/CopilotTriage.tsx`; server `server/lib/copilot/`, `server/routes/copilot.ts`; edits to `inboxScan.ts`, `draftReply.ts`, `Dashboard.tsx`, `InboxIntelView.tsx`, `shared/types.ts`.
