# HANDOFF — LEMON-AI-CENTER (2026-07-08)

## Where we left off
We executed the full 2026-07-08 code audit (10 fixes) plus a follow-up SDK/model upgrade, across three stacked branches:

- `audit` — the 11-commit reviewed core (not the PR branch; superseded by audit_2).
- `audit_2` — 15 commits = all 10 audit fixes. **This is open as PR #4** (audit_2 to main): "Audit 2026-07-08: 10 security, reliability & cleanup fixes". Both its reviewers (every one of the 10 items) came back clean. Firestore rules from that PR are ALREADY DEPLOYED to prod.
- `sdk-upgrade` — 17 commits = audit_2's 15 PLUS 2 new commits: (1) upgraded `@anthropic-ai/sdk` 0.27.3 to 0.110.0, (2) flipped the Sonnet tier to Sonnet 5 with `thinking: disabled` at all 10 call sites. **Pushed to origin. Current branch. Working tree clean.**

The SDK+Sonnet5 work passed typecheck, build, all 384 tests, and a runtime construction smoke test. Its adversarial reviewer was still running when the session ended, so that one review did NOT finish (see Open loops).

## Next action
Merge PR #4 (audit_2 into main) on GitHub, then rebase `sdk-upgrade` onto the updated main and open its PR. Concrete:
```
cd /Users/quantumcode/CODE/LEMON-AI-CENTER
gh pr merge 4 --merge        # or --squash, Billy's choice
git checkout sdk-upgrade
git fetch origin && git rebase origin/main
npm run typecheck && npm test && npm run build   # confirm still green after rebase
git push --force-with-lease
gh pr create --base main --head sdk-upgrade --title "Upgrade Anthropic SDK 0.27 to 0.110 + Sonnet 5" --body "..."
```
After the rebase, `sdk-upgrade` should show only its 2 SDK/Sonnet commits (audit_2's commits become part of main).

Then start the killer-features work (see the last Open loop).

## Locked decisions
- Model IDs route through `shared/models.ts` (`CLAUDE_MODELS`): smart = claude-opus-4-8, balanced = claude-sonnet-5, fast = claude-haiku-4-5. Do not hardcode model IDs anywhere else.
- Sonnet 5 runs adaptive thinking by default, so every balanced call site passes `thinking: { type: 'disabled' }` to keep behavior and protect small token budgets. To enable thinking on a route later, drop that line AND raise max_tokens.
- SDK is now 0.110.0 (pin `^0.110.0`). It supports the `thinking` param; 0.27 did not (that was the whole reason Sonnet 5 was blocked before).
- Firestore rules gate the shared corpus on `sign_in_provider == 'custom'` and are DEPLOYED to prod (project gen-lang-client-0882654423). Do not revert.
- Session cookie stays named `sid` with NO `__Host-` prefix (breaks behind the Cloudflare Tunnel). Do not "harden" it.
- Big-ticket changes go on their own branches, never piled onto a PR branch. Keep PRs clean and independently reviewable.
- Every substantive change is verified with multi-agent adversarial review, one item at a time. Billy's standing rule: "be smart, do not break anything."

## Open loops
1. **PR #4 not merged yet.** Done when: audit_2 is merged into main on GitHub.
2. **`sdk-upgrade` not rebased/PR'd yet.** Done when: it is rebased onto the post-merge main, still green, pushed, and has its own open PR.
3. **SDK+Sonnet5 adversarial review did not finish** (its agent was stopped when the session cycled). Done when: a fresh code-review agent confirms the SDK upgrade + Sonnet 5 flip is clean — specifically (a) no call site passes params current models reject (temperature/top_p/top_k, budget_tokens, trailing assistant prefill), (b) all 10 balanced sites have thinking:disabled, (c) no opus/haiku site wrongly got thinking config. Re-run this before merging sdk-upgrade.
4. **Live Anthropic call never exercised.** Everything verified except a real paid API call. Done when: a preview deploy confirms chat, brief, and priority all return correctly on Sonnet 5 + SDK 0.110.
5. **Firebase console sign-in-provider check (Billy's 2-minute manual task).** Confirm only intended providers are enabled (defense in depth; the deployed rules already protect the corpus regardless). Done when: Billy reports what is enabled.
6. **Killer features build — the next big phase.** New branch `killer_features` off the merged main. Build the proposal in `docs/product/2026-07-08-killer-features.md`, one feature at a time, each verified with multi-agent review. Suggested order (improve if better): Propose Times (S) then Do-Anything Bar (S) then Inbox Copilot (M) then One-Key Delegate (M) then Promise Keeper (M) then Relationship Radar (M) then Decision Echo (S) then Ask the Brain by voice (M). "Build this weekend" pick = Inbox Copilot; cheapest first delight = Do-Anything Bar or Propose Times. Done when: features shipped per the proposal.
7. **Minor cleanup deferred (from audit #8):** deleting `SparkCard` orphaned the `/api/claude/spark` route and the `spark` seed in `shared/seeds.ts` / `shared/types.ts`. Inert (no caller). Sweep when convenient; keep `SPARK_SYSTEM` in prompts.ts (still used by brief.ts).

## How to run and verify
- Dev server: `npm run dev` (Vite on port 5175 + Express on 3001, via concurrently). Open the app at **http://localhost:5175**, not 3001. Port 5175 is this app's fixed port; check it is free first (`lsof -i:5175`) and kill any stale process before starting, so a stale server does not make a fix look broken.
- Checks (all currently green on sdk-upgrade): `npm run typecheck`, `npm test` (384 tests), `npm run build`.
- Prod is https://ceo.billyrovzar.com (single Railway service behind a Cloudflare Tunnel). Health: `GET /health`. Config/brain status: `GET /api/ready`.
- Engine + Brain need env: `CEO_UID`, `ENGINE_CRON_SECRET`, and `OBSIDIAN_VAULT_GIT_URL` (must embed a read-only PAT). New optional var `ALERT_WEBHOOK_URL` enables job-failure alerts (audit #6).

## Gotchas / context not on disk
- Full audit write-up: `docs/audits/2026-07-08-audit.md`. Killer-features proposal: `docs/product/2026-07-08-killer-features.md`. Both committed.
- A separate worktree session may have been spawned for the SDK task (the task chip showed "already started"). THIS repo's `sdk-upgrade` branch (pushed to origin) is the authoritative one. If a duplicate branch/worktree exists, discard it to avoid confusion.
- `thinking: { type: 'disabled' }` is valid on Sonnet 5 and Opus 4.7/4.8 but is REJECTED (400) on claude-fable-5. Keep that in mind if any tier ever moves to Fable 5.
- Build toolchain (vite, tailwind, tsc, etc.) lives in `dependencies`, not devDependencies, on purpose (Railway runs `npm ci --production`). Do not move them.
- Styling obeys `DESIGN.md`: never use warm/brown/cream/amber/gold colors. Never hardcode rosters/people/legal facts; read them from the Obsidian brain.
- This HANDOFF.md is committed on the `sdk-upgrade` branch. If you are on main and cannot see it, `git show sdk-upgrade:docs/HANDOFF.md`.
