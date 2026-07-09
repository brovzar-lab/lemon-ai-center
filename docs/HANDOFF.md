# HANDOFF — LEMON-AI-CENTER

## Where we left off
Two things shipped this session, in order:

1. **SDK + Sonnet 5 upgrade is merged and live.** PR #5 (Anthropic SDK 0.27 to 0.110, balanced tier moved to Sonnet 5 with thinking disabled, plus a real bug fix: the draft-reply route was silently broken on `stream.textStream`) merged to main and deployed. Prod verified healthy.

2. **Inbox Copilot (killer feature #1) is built and in review as PR #6.** Branch `killer-features`. Not merged yet. It is the keyboard triage deck: open "Triage N hot" from Inbox Intelligence, flip HOT threads, each card shows a reply drafted in Billy's voice, send with one key (held 5 seconds with Undo), edit inline, skip, retry. Drafts are pre-cached for reply-owed HOT threads during the inbox scan (instant first card) and drafted on demand otherwise.

**PR #6: https://github.com/brovzar-lab/lemon-ai-center/pull/6**

Built with a 15-task test-first plan, subagent-driven: a fresh implementer per task, a spec+quality review after each, and a two-agent adversarial whole-branch review at the end. Verified: typecheck clean, 449/449 tests (72 files), build succeeds. The final adversarial review found and fixed a duplicate-send bug (key auto-repeat and re-sending an already-sent card) and time-bounded the draft cache probe. Both reviewers now say SHIP.

## Next action (Billy's call)
**Live drive, then merge PR #6.** The one verification left is a real end-to-end run, because it sends a real email. Do it with Billy's logged-in session:
```
cd /Users/quantumcode/CODE/LEMON-AI-CENTER
npm run dev
```
Open http://localhost:5175 (kill any stale process on 5175 first). Log in, open the inbox, click "Triage N hot". Confirm: a draft streams into the first card (or appears instantly if pre-cached), E lets you edit, S shows the "Sending in 5s... Undo" bar and advances, U cancels, letting it ride sends. Test the real send against Billy's own address only. If it works, merge PR #6 (`gh pr merge 6 --merge`), which deploys it.

## Locked decisions
- Inbox Copilot design spec: `docs/superpowers/specs/2026-07-08-inbox-copilot-design.md`. Plan: `docs/superpowers/plans/2026-07-08-inbox-copilot.md`. These are the source of truth for the feature.
- Send safety is non-negotiable: show-then-send (draft always visible first) + a 5-second client-side unsend. Sends go through the existing `/api/gmail/send` (Zod-validated, CRLF-sanitized, audit-logged). The deck must never send unread or un-undoable.
- Model IDs route through `shared/models.ts` (`CLAUDE_MODELS`): smart = opus-4-8, balanced = sonnet-5, fast = haiku-4-5. Balanced calls pass `thinking: { type: 'disabled' }`. Never hardcode a model ID.
- SDK 0.110: stream via `stream.on('text')` + `await stream.finalMessage()`. `textStream` does not exist. Never type an SDK stream as `any`.
- Vitest hooks use block bodies: `afterEach(() => { vi.x() })`, never `afterEach(() => vi.x())` (the arrow-return form fails `tsc` with TS2322 and `vitest run` does not catch it; `npm run typecheck` does).
- DESIGN.md: no warm/brown/cream/amber/gold. Cool tokens + data colors (coral urgent, teal info) only.
- Every substantive change is verified with the two-agent adversarial review before merge. It keeps earning its keep: this feature's reviews caught a data-loss bug, a timer race, an out-of-range crash, an SSE flush gap, and the duplicate-send bug.

## Open loops
1. **Live-drive + merge PR #6** (next action above). Done when: the deck works in the real app and PR #6 is merged and deployed.
2. **Firebase console sign-in-provider check** (Billy's 2-minute manual task, still open from the audit session). Confirm only intended providers are enabled.
3. **Inbox Copilot follow-ups** (deferred, non-blocking, all in the PR description): the spec-§8 stale-cache flag (needs `latestMessageId` on `InboxThread`); reset `sentThreadIds` on rescan; the address-extraction duplication (3 copies) and the ReplyModal/sendReply duplication.
4. **The other 6 killer features** (from the proposal): Promise Keeper, Relationship Radar, Do-Anything Bar, Propose Times, One-Key Delegate, Decision Echo, Ask the Brain by voice. Each gets the same brainstorm to spec to plan to subagent-build treatment.
5. **Minor audit cleanup deferred earlier:** the orphaned `/api/claude/spark` route + `spark` seed. Inert.

## How to run and verify
- Dev: `npm run dev` (Vite 5175 + Express 3001). Use http://localhost:5175. Check the port first, kill stale processes.
- Checks (all green on `killer-features`): `npm run typecheck`, `npm test` (449 tests), `npm run build`.
- Prod: https://ceo.billyrovzar.com (Railway behind Cloudflare Tunnel). `GET /health`, `GET /api/ready`.
- The SDD progress ledger for this feature is at `.superpowers/sdd/progress.md` (gitignored scratch; the real record is git log + PR #6). It lists every task, its commits, and the deferred-minors roll-up.

## Gotchas / context not on disk
- `killer-features` = main + the SDK-upgrade history + 29 Inbox Copilot commits (Tasks 1-15 + fixes). PR #6 diff is those 29 commits (27 files, +3572/-95), including the spec/plan docs.
- New Inbox Copilot code: client `src/lib/copilot/` (draftClient, sendReply), `src/lib/inbox/extractEmail.ts`, `src/stores/useCopilotStore.ts`, `src/components/CopilotTriage.tsx`; server `server/lib/copilot/` (generateDraft, replyOwed, pregenerate), `server/routes/copilot.ts`; edits to `inboxScan.ts`, `draftReply.ts`, `Dashboard.tsx`, `InboxIntelView.tsx`, `shared/types.ts`.
- The pre-cache runs inside the inbox scan (04:30 cron + manual button), capped at the top 8 HOT reply-owed threads, and can never fail the scan (wrapped in try/catch).
- Build toolchain stays in `dependencies` (Railway installs in production mode). Never hardcode rosters/people/legal facts; read them from the Obsidian brain.
