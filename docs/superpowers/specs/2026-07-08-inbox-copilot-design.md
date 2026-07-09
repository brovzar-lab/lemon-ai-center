# Inbox Copilot — Design Spec

**Date:** 2026-07-08
**Status:** Approved in brainstorm, pending spec review
**Branch:** `killer-features`
**Source proposal:** [`docs/product/2026-07-08-killer-features.md`](../../product/2026-07-08-killer-features.md) feature #1 ("Inbox Copilot", wow-per-effort 9, the "build this weekend" pick)

---

## 1. Context (from the proposal)

Billy's #1 job-to-be-done is "triage and respond without dropping anything." The proposal frames Inbox Copilot as the daily-headline feature: every HOT thread already waiting with a reply drafted in his voice, so triage becomes near-instant.

The proposal's target moment (verbatim): *6:40am, Billy opens the app before the kids are up. The GBM associate asked for the updated cap table. Instead of a red dot, the thread is expanded with a reply already written in his voice ("Adjunto la tabla actualizada, con la nota sobre EFICINE que hablamos"). He reads it, sends, moves on. Four of six HOT threads clear before coffee.*

The proposal's "only new work" note was: pre-generate drafts for HOT threads during the inbox scan and cache them. This spec keeps that and adds the decisions made in the brainstorm below.

## 2. What we are building

A keyboard-driven triage deck ("Copilot Triage") that flips through HOT inbox threads one at a time. Each card shows the thread and a reply drafted in Billy's voice. Billy reads the draft and acts with one key: send, edit, or skip. Send is reversible for 5 seconds.

**Decisions locked in the brainstorm:**

| Decision | Choice | Why |
|---|---|---|
| Send model | Show, then send | The draft is always on screen before any send. Billy's name is on investor mail; nothing goes out unread. |
| Unsend | 5-second Undo window | Gmail-style. Send starts a 5s countdown; Undo cancels; after 5s the real send fires. A regretted send is always catchable. |
| Editing | Full inline edit | Press E, edit freely, Enter sends the edited version. |
| Freshness | Hybrid | Pre-write and cache drafts for HOT threads that owe a reply; draft the rest on demand when their card appears. |
| Surface | Keyboard triage deck | Full-screen card deck driven by keys (proposal option C, chosen over the inline-block sketch). |
| Device | Keyboard-first, touch later | Desktop keyboard deck now; phone tap/swipe is a later phase. |

## 3. Divergence from the proposal's original sketch

The proposal's UX sketch put a collapsible "Suggested reply" block inline inside `InboxIntelView`. This spec supersedes that sketch per the brainstorm:

- **Surface:** a dedicated full-screen keyboard deck, not inline blocks in the narrative view. (Revives the triage surface that was removed in the 2026-07-08 audit cleanup: the old `src/components/TriageMode.tsx`.)
- **Send:** "show then send + 5s unsend," not the proposal's bare "tap to send."
- **Scope of pre-generation:** only HOT threads that owe a reply are pre-cached (not all HOT), which sharpens the proposal's per-scan draft budget note.

`InboxIntelView` stays as-is (narrative for delegations and stalling deals). The deck is a new, separate surface launched from the inbox.

## 4. Phased delivery

Honest scope: the keyboard deck plus hybrid caching is more than one weekend. Delivered in phases so each is usable on its own.

- **Phase 1 (weekend core, desktop):** the deck, keyboard Send/Edit/Skip, drafts generated on demand as each card appears (reusing the existing draft-reply streaming path), and Send wired through the 5s unsend into the existing send route. Complete and usable with no caching.
- **Phase 2 (the "already waiting" hybrid):** during the inbox scan, pre-write and cache drafts for HOT reply-owed threads; the deck reads cache first (instant) and only draws on demand for misses. Adds staleness handling. This delivers the 6:40am moment.
- **Phase 3 (later, not scoped here):** touch gestures (tap to send, swipe to skip) so the deck works on a phone.

## 5. Architecture

### Reuse (exists today, grounded in code)
- **HOT ranking.** `server/routes/gmail.ts` `GET /threads` returns `InboxThread[]` with `priority: 'HOT'|'MED'|'LOW'` (via `prioritizeThread` in `server/lib/threadTags.ts`), sorted HOT-first. The deck consumes HOT threads from `useInboxStore` (which calls that route).
- **Triage navigation.** `src/stores/useInboxStore.ts` already has dormant `triageMode`, `enterTriage`, `exitTriage`, `nextThread`, `prevThread`, `activeThread`, `setActiveThread`. The deck builds on these.
- **Voice drafting.** `server/routes/draftReply.ts` streams a reply in Billy's voice using the voice profile at `users/{uid}/voiceProfile/current` and `buildVoicePrompt`. Model is `CLAUDE_MODELS.balanced` (Sonnet 5, `thinking: disabled`). This is the code fixed and smoke-tested in the SDK 0.110 upgrade.
- **Sending.** `server/routes/gmail.ts` `POST /send` takes `{threadId, to, subject, body}`, Zod-validated, CRLF-sanitized, `gmailSendLimit`-rated, and audit-logged as `gmail_send`. The deck's Send calls straight into it after the 5s hold.
- **Scan.** `server/lib/engine/jobs/inboxScan.ts` `runInboxScan` already fetches threads at FULL format (has message bodies) on the 04:30 job and the manual button. Phase 2 pre-generation hooks in here to avoid a second Gmail fetch.

### Build (new)
- **On-demand drafts (Phase 1):** reuse the existing `POST /api/claude/draft-reply` streaming route as-is. The client already holds the `InboxThread` fields it needs (`from`, `subject`, `snippet`), so Phase 1 needs no new drafting route and no refactor.
- **Refactor (Phase 2 only):** when the scan job needs to draft without HTTP streaming, extract the voice-drafting core (voice-prompt build + system prompt + Anthropic call) out of the `draftReply.ts` route into a shared helper, e.g. `server/lib/copilot/generateDraft.ts`. The route then calls the helper and keeps streaming; the scan job calls a non-streaming variant. Identical wording from both callers, one source of truth.
- **Cache read route (Phase 2):** `GET /api/copilot/drafts` returns a map `threadId -> { draft, generatedAt, stale }` for the current HOT threads. New `copilotRouter`, `requireAuth`.
- **Deck component:** `src/components/CopilotTriage.tsx`, full-screen. Owns keyboard handling and renders the current card (thread + draft + status). The countdown/Undo bar is a small child component.
- **Store:** extend `useInboxStore` (or a `useCopilotStore` slice) with per-thread draft state (`text`, `status: idle|loading|ready|error`, `edited`) and a pending-send queue for the 5s unsend.
- **Entry point:** a "Copilot Triage" button in the inbox header and a hotkey to open the deck.

### Reply-owed detection (Phase 2)
Server-side, in the pre-generation pass: a thread "owes a reply" when the latest message is inbound (its `From` is not Billy's own Gmail address / lacks the `SENT` label). Mirrors the client-side `awaiting_reply` reason in `src/lib/inbox/slipDetection.ts`.

## 6. Data and storage

- **Cache doc (Phase 2):** `users/{uid}/copilotDrafts/{threadId}` = `{ threadId, draft, generatedAt, basedOnMessageId, tone }`. `basedOnMessageId` is the latest message the draft answered; if a newer message arrives, the cache is stale and the deck redrafts.
- **Firestore rules:** add an owner-only read/write rule for `users/{uid}/copilotDrafts/{threadId}`, matching the pattern used by the other per-user subcollections in `firestore.rules`.
- **Shared type:** add `CopilotDraft` to `shared/types.ts`. `InboxThread` is unchanged; drafts are stored separately.
- **Pre-generation budget:** cap pre-writing to the top ~8 HOT reply-owed threads per scan (the proposal's per-scan draft budget).

## 7. Send safety and 5-second unsend

- The draft is always visible on the current card before any send.
- Send does not call the network immediately. It enqueues a pending send with a 5-second timer and shows a "Sending in 5s... Undo" bar. The deck advances to the next card at once so flow is unbroken.
- Undo (button or `U`) within the window cancels the timer; nothing is sent; the thread returns to the deck.
- On timer expiry, the real send fires through `POST /api/gmail/send` (validated, sanitized, audit-logged). `to` is the sender address extracted from the thread `From`; `subject` is `Re: <subject>`.
- Multiple sends in quick succession each get their own 5s window; the bar shows the most recent with a pending count.
- Unsend is entirely client-side (a held timer). No server change is needed for it.

## 8. Error handling (rule: never freeze the deck)

- **Draft generation fails or is declined:** the card shows an empty editable box and a note ("Couldn't draft this, write it or skip"). Edit and Skip still work.
- **Send fails:** the countdown bar becomes "Send failed, retry." The thread is not marked done; nothing is lost.
- **Google needs reauth:** the existing `ReconnectBanner` handles it (same as elsewhere).
- **Stale draft (Phase 2):** if a newer message arrived on the thread, the card flags it and redrafts before send, so Billy never answers an out-of-date message.
- **No HOT threads:** the deck shows "Inbox is calm" and exits.
- **Attachments:** text replies only in v1. If a draft mentions an attachment, the card flags it so Billy adds it in Gmail rather than sending a promise the app cannot keep.

## 9. Testing and verification

- **Unit:** the `generateDraft` helper (prompt building, with the Anthropic 0.110 mock shape established in `claude.test.ts` / `draftReply.test.ts`); reply-owed and staleness logic; the pending-send/unsend timer logic (fake timers).
- **Route:** `GET /api/copilot/drafts` (mock Gmail + Firestore). The reused `draft-reply` route is already covered.
- **Component:** `CopilotTriage` keyboard behavior (send, edit, skip, prev/next, undo, empty, error states) with a mocked store.
- **Adversarial review:** run the two-agent review on the finished feature before merge, per the standing rule, as done for the SDK upgrade.
- **Live proof:** drive the real app: open the deck, draft, edit one, send one through the 5s hold, and undo one. The real-send test targets Billy's own address so no test mail reaches a real contact.

## 10. Out of scope (v1)
- MED / LOW threads (HOT only).
- Attachments (text replies only; flagged if mentioned).
- Phone touch gestures (Phase 3).
- Bulk / multi-select triage (a cut idea in the proposal).
- MED/LOW auto-drafting and the other 7 killer features (separate specs).

## 11. Follow-ups noted during design
- Confirm Billy's own send-identity address for reply-owed detection (Gmail profile `emailAddress`).
- Phase 3 (touch) will retrofit gestures onto the same deck; keep the deck's action layer separate from the key bindings so touch can reuse it.
