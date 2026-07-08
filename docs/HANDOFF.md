# HANDOFF — LEMON-AI-CENTER (2026-07-08)

## Where we left off
Big day, all verified. Three things happened in this session, in order:

1. **PR #4 (the 10-fix audit) is MERGED into main and LIVE in prod.** Merged with a merge commit (8d40b8b). Railway auto-deployed; prod verified healthy after the deploy: `/health` ok, Brain ready (4415 docs), and `/api/ready` now shows `lastIndexedAt` — a field added by audit #10, which proves the new code is what is running. The vault-clone PAT gotcha did not bite.
2. **The two blockers on the SDK work are CLEARED.** (a) The adversarial review ran: two independent agents swept all 23 Anthropic call sites and the 0.27-to-0.110 SDK jump. All param/thinking/prefill/registry verdicts PASS. The review caught one real critical bug (see below), now fixed. (b) The live API test ran: 4 real calls on all three tiers including the streaming path — 4/4 passed on SDK 0.110.
3. **PR #5 is open and fully verified: https://github.com/brovzar-lab/lemon-ai-center/pull/5** (sdk-upgrade into main). It contains the SDK 0.27.3 to 0.110.0 upgrade, the Sonnet 5 flip (thinking disabled at all 10 balanced sites), the draft-reply fix, and handoff docs. Full verification evidence is posted as a PR comment. No rebase was ever needed — the merge-commit topology means PR #5 shows only its own commits.

**The bug the review caught (fixed in 5e8dadc):** `/api/claude/draft-reply` consumed `stream.textStream`, which does not exist in SDK 0.110 — or in 0.27. The feature was silently broken BEFORE the upgrade: every call threw at runtime, a bare catch swallowed it, and the frontend dropped the SSE error event, so the reply modal just sat blank. It was invisible to typecheck (`any`-casts) and to tests (the mock faked the old stream shape). Fixed: draftReply.ts now streams via `on('text')` + `finalMessage()` (same pattern as aiChat/brief) with the any-casts removed, ReplyModal.tsx now shows an error message on the SSE error event, the test mock now models the real 0.110 MessageStream, and draftReply.test.ts adds regression coverage. After the fix: typecheck clean, 386/386 tests, build green.

## Next action
Merge PR #5 when Billy gives the word. Everything is verified; it is one command:
```
cd /Users/quantumcode/CODE/LEMON-AI-CENTER
gh pr merge 5 --merge
```
Merging deploys the SDK upgrade + Sonnet 5 + the draft-reply fix to prod. After it deploys, spot-check prod: open the app, use Reply on an email (draft should stream in), and check `GET /api/ready` still shows brain ready.

Then start the killer-features work (see Open loops).

## Locked decisions
- Model IDs route through `shared/models.ts` (`CLAUDE_MODELS`): smart = claude-opus-4-8, balanced = claude-sonnet-5, fast = claude-haiku-4-5. Do not hardcode a model ID anywhere else. (Review verdict (e) confirmed zero violations.)
- Every balanced (Sonnet 5) call site passes `thinking: { type: 'disabled' }`. Exactly 10 such sites exist; review confirmed one-to-one coverage. To enable thinking on a route, drop that line AND raise max_tokens.
- SDK is 0.110.0 (pinned `^0.110.0`). Streams are consumed via `stream.on('text', cb)` + `await stream.finalMessage()`. `textStream` does not exist. NEVER type an SDK stream as `any` — that is exactly what hid the draft-reply outage from typecheck.
- Test mocks for the Anthropic SDK must model the 0.110 MessageStream shape (`on` + `finalMessage`), not the old `textStream` shape. claude.test.ts and draftReply.test.ts are the reference.
- Firestore rules gate the shared corpus on `sign_in_provider == 'custom'` and are deployed to prod. Do not revert.
- Session cookie stays named `sid` with NO `__Host-` prefix (breaks behind the Cloudflare Tunnel). Do not "harden" it.
- `thinking: { type: 'disabled' }` is valid on Sonnet 5 and Opus 4.8 but REJECTED (400) on claude-fable-5. On Sonnet 5, OMITTING thinking runs adaptive thinking by default (spends tokens, can blow small budgets); on Opus 4.8 omitting it runs without thinking. temperature/top_p/top_k also 400 on Sonnet 5 and Opus 4.8.
- Every substantive change is verified with multi-agent adversarial review. Standing rule: be smart, do not break anything. (This session is the proof it pays: the review found a silent full outage.)

## Open loops
1. **PR #5 awaiting Billy's go to merge.** Everything verified (review, live smoke, 386 tests, build). Done when: merged and prod spot-checked (draft-reply streams, `/api/ready` healthy).
2. **Firebase console sign-in-provider check (Billy's 2-minute manual task).** Confirm only intended providers are enabled — defense in depth; deployed rules already protect the corpus. Done when: Billy reports what is enabled.
3. **Killer features build — the next big phase.** New branch `killer_features` off main (after PR #5 merges). Build the proposal in `docs/product/2026-07-08-killer-features.md`, one feature at a time, each verified with multi-agent review. Suggested order: Propose Times (S), Do-Anything Bar (S), Inbox Copilot (M), One-Key Delegate (M), Promise Keeper (M), Relationship Radar (M), Decision Echo (S), Ask the Brain by voice (M). "Build this weekend" pick = Inbox Copilot. Note: the draft-reply fix directly benefits One-Key Delegate / reply flows.
4. **Minor cleanup deferred (audit #8):** the orphaned `/api/claude/spark` route and `spark` seed in `shared/seeds.ts` / `shared/types.ts` (SparkCard was deleted; no caller). Inert. Sweep when convenient; keep `SPARK_SYSTEM` in prompts.ts (used by brief.ts).

## How to run and verify
- Dev server: `npm run dev` (Vite on port 5175 + Express on 3001). Open http://localhost:5175, not 3001. Check the port first (`lsof -i:5175`), kill stale processes — a stale server is the usual reason a fix looks broken.
- Checks (all green as of 5e8dadc): `npm run typecheck`, `npm test` (386 tests, 62 files), `npm run build`.
- Prod: https://ceo.billyrovzar.com (Railway behind Cloudflare Tunnel). `GET /health` -> ok. `GET /api/ready` -> config + brain status (now includes `lastIndexedAt`).
- Live-API smoke pattern (if ever needed again): tiny node script requiring the repo's own `node_modules/@anthropic-ai/sdk`, .env key never printed, one call per tier + one streaming call with `on('text')`/`finalMessage`. The exact results are in the PR #5 verification comment.
- Engine + Brain env: `CEO_UID`, `ENGINE_CRON_SECRET`, `OBSIDIAN_VAULT_GIT_URL` (must embed the read-only PAT). Optional `ALERT_WEBHOOK_URL` for job-failure alerts.

## Gotchas / context not on disk
- Branch state: `sdk-upgrade` = main's history + 2 SDK commits + 2 handoff commits + the draft-reply fix (5e8dadc) + this handoff commit. All pushed. PR #5 diff = exactly those commits; the handoff docs commits in the PR are harmless.
- The old `audit` and `audit_2` branches are merged/superseded. Safe to delete whenever, not urgent.
- Full audit write-up: `docs/audits/2026-07-08-audit.md`. Killer-features proposal: `docs/product/2026-07-08-killer-features.md`.
- Build toolchain (vite, tailwind, tsc, @types) lives in `dependencies` on purpose — Railway runs `npm ci` in production mode. Do not move to devDependencies.
- Styling obeys `DESIGN.md`: never warm/brown/cream/amber/gold. Never hardcode rosters/people/legal facts — read them from the Obsidian brain.
- This HANDOFF.md lives on `sdk-upgrade` until PR #5 merges; from main use `git show sdk-upgrade:docs/HANDOFF.md`.
