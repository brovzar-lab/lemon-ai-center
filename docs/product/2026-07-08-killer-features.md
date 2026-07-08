# LEMON-AI-CENTER — Killer Features Proposal

**Date:** 2026-07-08
**Author hat:** product-minded staff engineer, one month of daily use
**Grounding:** every feature cites this codebase and Billy's real jobs. No generic ideas.

---

## Phase 1 — The user

**Who.** Billy Rovzar, CEO of Lemon Studios. Film producer, not an engineer, builds through AI. Dictates by voice, has ADHD, runs a NOW/NEXT/ORBIT model, wants brutal honesty and scannable action-first output. Raising Lemon Trust I ($300M MXN fund; GBM, Cinepolis, Talipot in the pipeline) and writing 7 of 10 slate scripts. Wife and 5 kids, explicit anti-burnout guardrails.

**Top 3 jobs-to-be-done (inferred from the code):**
1. **Triage and respond without dropping anything.** The inbox intel view, priority engine (`server/lib/priorityEngine.ts`), thread tagging (`server/lib/threadTags.ts`), draft-reply (`server/routes/draftReply.ts`), and Gmail triage routes (`server/routes/gmail.ts`) are the biggest surface in the app.
2. **Move the fund and the people forward.** Trackers for investors, deals, scripts, deadlines, ventures (`src/stores/useTrackersStore.ts`), delegations (`server/routes/delegations.ts`), slip detection (`server/lib/engine/slips.ts`), relationship flags (`server/lib/relationshipContext.ts`).
3. **Start the day knowing what matters.** Morning assembly, the Today view, the spoken brief (`server/routes/tts.ts` + `src/components/AudioPlayer.tsx`), and the decision journal (`src/stores/useDecisionStore.ts`).

**Power ceiling (where a heavy user leaves the app).** Three walls:
- **Voice input does not exist.** The app has text-to-speech out (`AudioPlayer.tsx`) and a writing-voice profile (`server/routes/voice.ts`), but no speech-to-text in. A voice-first CEO has to type, or dictate through the OS and paste. He leaves the app to talk.
- **Reading is where it stops.** The app tells you an email is HOT and even drafts a reply on request, but triaging 20 threads is still 20 manual round-trips. At volume he exports the thinking to his own head.
- **The Brain is a library, not a partner.** He can search notes, but the app never uses how notes connect, never brings the neighborhood of a person or deal into context automatically.

**Dormant data (free feature fuel, already collected, never exploited):**
- **The Brain link graph.** `server/lib/brain/scanner.ts:28` extracts `links: string[]` per note into `types.ts:20`, and nothing ever reads it. A 4,400-note knowledge graph sits unused.
- **The audit log.** `server/lib/auditLog.ts` records `gmail_send`, `triage_defer`, `triage_undo`, `login` with timestamps and 90-day TTL. Rules lock it (`firestore.rules:92`) and no code reads it back. A full record of what Billy actually did, invisible.
- **Sent mail as a promise ledger.** Every reply goes out through `gmail.ts:97`, logged, then forgotten. The commitments inside ("I'll send the deck Friday") are never captured.
- **Relationship logs and decisions.** `relationship_logs` (`today.ts:119`) and the `decisions` collection are write-mostly; outcomes and cadence are never resurfaced.
- **Watchlist without market data.** `useTrackersStore.ts:109` subscribes to a `watchlist`, `FINNHUB_API_KEY` is documented, but no code calls Finnhub. Tickers with no prices.

**Top 3 repetitive / high-friction actions:**
1. Per-thread inbox triage: read, judge, draft, send, file. Every scan, every thread.
2. Proposing meeting times: leave the reply, open Calendar, find gaps, type them back.
3. Delegating: decide who, write the ask, send it, log who owes what by when.

---

## Phase 2 — Raw brainstorm (16, before the cut)

1. Do-anything bar (type or say what you want, it routes to the action)
2. Bulk inbox triage (multi-select archive/defer/label)
3. Reply templates in Billy's voice
4. Keyboard triage mode expansion
5. Promise Keeper (extract commitments from sent mail + delegations)
6. Relationship Radar (important people going cold)
7. Brain graph context (use the dormant link graph for retrieval + display)
8. Morning brief "what changed since yesterday" diff
9. Decision Echo (resurface past decisions, capture outcomes)
10. Inbox Copilot (pre-drafted reply waiting on every HOT thread)
11. One-Key Delegate (extract task, pick assignee from Brain, draft + send + log)
12. Ask the Brain by voice (extend slate RAG to the whole vault + STT)
13. Capture by voice (dictate a thought, AI files it to the right tracker/note)
14. Calendar-aware "Propose Times" (insert real open slots into a reply)
15. Weekly retrospective from the audit log (what you actually shipped)
16. Watchlist live prices via Finnhub

Cut: 2, 3, 4, 8, 13, 15, 16 (reasons in "Kill your darlings").

---

## Phase 3 — The shortlist (8)

### 1. Inbox Copilot
- **One-liner:** Every HOT thread is already waiting with a reply drafted in your voice, so triage becomes tap-to-send.
- **The moment:** 6:40am. Billy opens the app before the kids are up. The GBM associate asked for the updated cap table. Instead of a red dot, the thread is expanded with a reply already written in his voice ("Adjunto la tabla actualizada, con la nota sobre EFICINE que hablamos"), the cap table flagged as an attachment to confirm. He reads it, taps Send, moves on. Four of six HOT threads clear before coffee.
- **Builds on:** `server/lib/priorityEngine.ts` (already ranks HOT/MED/LOW), `server/routes/draftReply.ts` + `server/routes/voice.ts` (voice-profile drafting already exists), `src/components/views/InboxIntelView.tsx` (render surface), `server/routes/gmail.ts` (send/label). Only new work: pre-generate drafts for HOT threads during `inboxScan` and cache them.
- **UX sketch:** In InboxIntelView, HOT threads render with a collapsible "Suggested reply" block, an editable text area, and Send / Edit / Skip. A per-scan draft budget avoids burning tokens on low-value mail.
- **AI task:** draft a context-aware reply in Billy's established voice from the thread + his voice profile. A model beats code because it is open-ended natural-language generation matched to a learned style.
- **Effort:** M
- **Wow-per-effort:** 9

### 2. Promise Keeper
- **One-liner:** The app reads what you promised in your own sent mail and delegations, and tracks each commitment until it is done.
- **The moment:** Friday 5pm. A banner: "3 promises come due today." One is "I'll get you the Matadero budget by end of week" to a Cinepolis contact, pulled from an email Billy sent Tuesday and half-forgot. He would have dropped it. He sends it in two minutes and clears the flag.
- **Builds on (DORMANT DATA):** sent mail via `gmail.ts`, the `delegations` collection (`delegations.ts:49`), and the `audit_log` `gmail_send` events (`auditLog.ts`). Reuses the Anthropic client and the slip-detection UI pattern (`server/lib/engine/slips.ts`) to render commitments as trackable items.
- **UX sketch:** a "Promises" lane in the Today view and the trackers area. Each item shows the quote, the recipient, the inferred due date, and Done / Snooze / Not-a-promise (the correction feeds accuracy). A nightly engine job scans new sent mail.
- **AI task:** extract first-person commitments and their deadlines from prose ("I'll send", "by Friday", "next week I will"). A model beats code because commitment detection is fuzzy natural-language understanding, not pattern matching.
- **Effort:** M
- **Wow-per-effort:** 9

### 3. Relationship Radar
- **One-liner:** Flags the important people you have gone quiet on, before the silence costs you.
- **The moment:** Monday brief. "You have not spoken to Mauricio Llanes (your lead lawyer) in 18 days, and the Talipot term sheet is open." One line, one suggested next touch. Billy pings him that morning instead of three weeks later when something is on fire.
- **Builds on (DORMANT DATA):** `relationship_logs` (`today.ts:119`), the enriched-flags writer that already exists (`server/lib/relationshipContext.ts` literally writes "one-line relationship context for an executive daily briefing"), Brain people notes (`wiki/people/*`), and investor/deal trackers (`useTrackersStore.ts`). Last-contact comes from email recency via `gmail.ts`.
- **UX sketch:** a "Going cold" section in the morning edition. Each card: person, days since contact, why they matter now (tied to an open deal or deadline), and a "Draft a check-in" button that hands off to the reply drafter.
- **AI task:** rank who matters now by fusing contact recency with open deals and deadlines, and write the one-line why. A model beats code because "who matters now" is a judgment over mixed signals, which `relationshipContext.ts` already trusts a model to phrase.
- **Effort:** M
- **Wow-per-effort:** 8

### 4. The Do-Anything Bar
- **One-liner:** One bar you open from anywhere; type or say what you want and it does it, no navigating.
- **The moment:** Billy is reading a deal and thinks of something unrelated. He hits the bar, says "log decision: we pass on the Oro Verde co-production," and it is filed to the decision journal without leaving the deal. No menu hunt, no context loss, which for an ADHD brain is the whole game.
- **Builds on:** `src/stores/useViewStore.ts` (jump to any view), the existing action routes (draft, delegate, capture, log decision, run engine job), `src/components/BillyDrawer.tsx` (there is already a context-aware AI drawer with a global keydown listener at `:42`), and the corrections loop (`server/routes/corrections.ts`).
- **UX sketch:** Cmd/Ctrl-K (and a mic button) opens a bar over any view. Two modes: fuzzy jump (views, threads, deals, people) and a natural-language command that the AI routes to the right action with a confirmation chip before anything sends.
- **AI task:** map a free-text or spoken instruction to one of a known set of app actions with extracted arguments. A model beats code because it parses loose, misspelled, voice-dictated intent, exactly Billy's input style.
- **Effort:** S
- **Wow-per-effort:** 8

### 5. Propose Times
- **One-liner:** In any reply, one tap drops in three real open slots from your actual calendar.
- **The moment:** An investor asks to meet next week. Instead of leaving the reply to check Calendar, Billy taps "Propose times" and the draft fills with "Tuesday 10am, Wednesday 3pm, or Thursday 11am (CDMX)." Sends in seconds.
- **Builds on:** `server/routes/calendar.ts` (events already fetched), `src/components/ReplyModal.tsx` (the reply UI), `server/routes/draftReply.ts`. Read-only against Calendar, so it is a safe first taste of the AI touching live data.
- **UX sketch:** a "Propose times" button in the reply composer. It reads the next 7 business days, finds gaps of the requested length, and inserts a formatted line in the user's timezone.
- **AI task:** mostly plain code (free/busy math). The model only phrases the slot sentence to match the reply's tone and language (Spanish or English). Honest note: this is the least AI-heavy feature, and that is fine.
- **Effort:** S
- **Wow-per-effort:** 8

### 6. One-Key Delegate
- **One-liner:** From any thread or task, the app extracts the ask, suggests who from your Brain, drafts the delegation, sends it, and logs it.
- **The moment:** An email needs the festival submission handled. Billy hits "Delegate." The app reads the thread, proposes his festivals lead (pulled from Brain people notes), shows a drafted ask with the deadline, he taps Send. It is delivered and now tracked as a delegation with a due date, all from one action.
- **Builds on:** `server/routes/delegations.ts` (send + log already exists), Brain people notes for assignee suggestion (`server/lib/brain/`), `server/routes/draftReply.ts` for the draft, and `useTrackersStore` / `useLemonDelegationsStore` for tracking. Note: fix the header-injection issue (audit item 2) as part of this, since it touches the same route.
- **UX sketch:** a "Delegate" action on any thread or task opens a one-screen sheet: extracted task (editable), suggested assignee (changeable), drafted email, due date. One Send.
- **AI task:** summarize the thread into a crisp task, and match it to the right person from the Brain roster. A model beats code because it is summarization plus fuzzy person-matching over unstructured notes.
- **Effort:** M
- **Wow-per-effort:** 8

### 7. Decision Echo
- **One-liner:** The app brings back a decision weeks later and asks how it played out, so you build a real track record.
- **The moment:** Three weeks after Billy logged "greenlight development on La Ciguena," the app resurfaces it: "How did this play out?" He taps "Went well" and adds a line. Over a year, he can search not just what he decided but how his calls actually landed.
- **Builds on (DORMANT DATA):** the `decisions` collection and store (`src/stores/useDecisionStore.ts`, which already has `exportMd`). Adds an `outcome` field and a resurfacing job (reuse the engine scheduler pattern in `server/lib/engine/`).
- **UX sketch:** in the decision journal, aged decisions without an outcome get a gentle "Follow up" prompt. Outcome is one tap (Went well / Mixed / Went badly) plus an optional line. A new filter: "decisions by outcome."
- **AI task:** optional and small. Cluster decisions by theme and surface a periodic pattern ("your co-production passes have aged well"). The core loop is plain code; the model only adds the retrospective insight.
- **Effort:** S
- **Wow-per-effort:** 7

### 8. Ask the Brain (by voice)
- **One-liner:** Hold the mic and ask a question across your whole Brain, deals, and calendar, and get a spoken, sourced answer.
- **The moment:** Driving to a meeting, Billy holds the mic: "What did we agree with Talipot on the waterfall, and what is still open?" The app retrieves the relevant notes and deal records, answers in two sentences with sources, and reads it aloud. He walks in ready without opening a laptop.
- **Builds on:** the slate RAG pipeline that already exists (`server/lib/slate/chat.ts`, `server/lib/slate/embeddings.ts`) pointed at the Brain index (`server/lib/brain/`), the `BillyDrawer.tsx` chat surface, and `tts.ts` + `AudioPlayer.tsx` for the spoken answer. New work: Web Speech API for input (fills the voice ceiling) and wiring RAG over the Brain.
- **UX sketch:** a mic button in the Billy drawer. Speak, see the transcript, get a sourced answer with note links, optional read-aloud. Also unlocks the Do-Anything Bar's voice mode.
- **AI task:** retrieval-augmented answer over the vault with citations. A model is the whole point, and the embeddings and chat plumbing already exist for the slate, so this is reuse, not new infrastructure.
- **Effort:** M
- **Wow-per-effort:** 8

---

## Build this weekend
**Inbox Copilot.** It reuses three systems that already exist (priority engine, voice-profile drafting, Gmail send), so the weekend is wiring not inventing, and it is the single feature that makes Billy say "oh damn" every single morning. If he wants a one-session win first, **Propose Times** (S) is the cheapest real delight and a safe way to prove the AI can touch live data without risk.

## The moat
**Promise Keeper.** Once the app has spent months quietly tracking every commitment Billy made across his email, leaving the app means carrying that load in his head again. The other accreting features (Decision Echo, Relationship Radar, and the existing corrections + voice profile) deepen it: the longer he uses it, the more the app knows what he owes, how his calls land, and how he writes. That memory is not exportable to a competitor. Features that get better with use are the ones you cannot rip out.

## Roadmap (build order and why)
1. **Propose Times (S)** — cheapest win, proves AI-on-live-data is safe, earns trust for what follows.
2. **Do-Anything Bar (S)** — cheap, used constantly, and becomes the launch surface later features plug commands into. Momentum.
3. **Inbox Copilot (M)** — the daily headline value; wants the drafting trust established first.
4. **One-Key Delegate (M)** — extends drafting trust from replying to sending-and-tracking; reuses Copilot's draft muscle.
5. **Promise Keeper (M)** — now that sends and delegations flow through the app, the commitment data is clean to read, and the moat starts accruing.
6. **Relationship Radar (M)** — the people-side twin of Promise Keeper; both are "do not drop the ball on humans."
7. **Decision Echo (S)** — light, starts the decision track record, can slot in any time momentum allows.
8. **Ask the Brain by voice (M)** — biggest infra reuse but most net-new UX; do it last, when RAG-over-Brain deserves the polish, and let it retrofit voice into the Do-Anything Bar.

Thread: cheap-first for momentum and trust, drafting-trust before auto-send, and the data-accreting moat features after the flows that generate their data.

## Kill your darlings (cuts, so you see the judgment)
- **Watchlist live prices (Finnhub).** Tempting because the dormant data and the unused `FINNHUB_API_KEY` are right there. Cut because stock tickers are peripheral to the fund/slate/inbox core jobs, and it adds a live-market-data dependency for near-zero impact on the top 3 JTBD. (It was also flagged as dead config in the audit; wiring it would be polishing a distraction.)
- **Bulk inbox triage.** A classic power feature, but at roughly 20 threads per scan for one user, multi-select UI does not earn its keep, and Inbox Copilot's tap-to-send already collapses the per-thread cost. Low marginal wow.
- **Morning-brief "what changed" diff.** Genuinely nice, but it is incremental polish on an existing view, not a change to what the app is for. It loses its slot to features that open new capability.
