// Current Claude model ids. Every server AI call routes through these so a
// model refresh is a one-line change here (audit #7).
//
// `balanced` is still Sonnet 4.6, NOT Sonnet 5, on purpose: Sonnet 5 runs
// adaptive thinking by default and the only way to preserve the current
// thinking-off behavior is `thinking: { type: 'disabled' }`, which the pinned
// @anthropic-ai/sdk (0.27.x) does not type. Upgrade the SDK first, then flip
// `balanced` to 'claude-sonnet-5' and add thinking:disabled at the small
// max_tokens call sites (aiChat 1024, priorityEngine 512) — do those together.
export const CLAUDE_MODELS = {
  /** Deep work: slate chat, briefings, skill dispatch, coverage. */
  smart: 'claude-opus-4-8',
  /** General reasoning: chat, drafts, priority ranking, brief prose. */
  balanced: 'claude-sonnet-4-6',
  /** Cheap + fast: filing confirmations, classification, small parses. */
  fast: 'claude-haiku-4-5',
} as const

export type ClaudeModelId = (typeof CLAUDE_MODELS)[keyof typeof CLAUDE_MODELS]
