// Current Claude model ids. Every server AI call routes through these so a
// model refresh is a one-line change here (audit #7).
//
// `balanced` is Sonnet 5. Sonnet 5 runs ADAPTIVE THINKING by default, so every
// balanced call site passes `thinking: { type: 'disabled' }` to preserve the
// prior (Sonnet 4.6, thinking-off) behavior and keep tight max_tokens budgets
// intact (aiChat 1024, priorityEngine 512). To enable adaptive thinking on a
// given route, drop the `thinking` line there and raise max_tokens to leave
// room for the reasoning tokens.
export const CLAUDE_MODELS = {
  /** Deep work: slate chat, briefings, skill dispatch, coverage. */
  smart: 'claude-opus-4-8',
  /** General reasoning: chat, drafts, priority ranking, brief prose. */
  balanced: 'claude-sonnet-5',
  /** Cheap + fast: filing confirmations, classification, small parses. */
  fast: 'claude-haiku-4-5',
} as const

export type ClaudeModelId = (typeof CLAUDE_MODELS)[keyof typeof CLAUDE_MODELS]
