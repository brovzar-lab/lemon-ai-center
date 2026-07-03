// Current Claude model ids — the DEVELOPMENT-HELL module routes every AI
// call through these (architecture decision D3). One constant so a model
// refresh is a one-line change. The rest of the app still hardcodes
// previous-generation ids per file; migrating those is a separate cleanup.
export const CLAUDE_MODELS = {
  /** Deep work: slate chat, briefings, skill dispatch, coverage. */
  smart: 'claude-opus-4-8',
  /** Cheap + fast: filing confirmations, classification, small parses. */
  fast: 'claude-haiku-4-5',
} as const

export type ClaudeModelId = (typeof CLAUDE_MODELS)[keyof typeof CLAUDE_MODELS]
