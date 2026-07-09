import { useEffect, useMemo } from 'react'
import { useInboxStore } from '@/stores/useInboxStore'
import { useCopilotStore } from '@/stores/useCopilotStore'

export function CopilotTriage(): JSX.Element | null {
  const isOpen = useCopilotStore((s) => s.isOpen)
  const index = useCopilotStore((s) => s.index)
  const drafts = useCopilotStore((s) => s.drafts)
  const requestDraft = useCopilotStore((s) => s.requestDraft)
  const close = useCopilotStore((s) => s.close)
  const threads = useInboxStore((s) => s.threads)

  const hotThreads = useMemo(() => threads.filter((t) => t.priority === 'HOT'), [threads])
  // index can point past the end if the HOT set shrank (e.g. a background inbox
  // refetch) while the deck was open; clamp so we never read undefined and crash.
  const safeIndex = hotThreads.length > 0 ? Math.min(index, hotThreads.length - 1) : 0
  const current = hotThreads[safeIndex]

  useEffect(() => {
    if (isOpen && current) requestDraft(current)
  }, [isOpen, current, requestDraft])

  if (!isOpen) return null

  if (hotThreads.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-bg/95 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="font-display text-xl text-ink">Inbox is calm</p>
          <p className="text-sm text-ink-3">No hot threads right now.</p>
          <button onClick={close} className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            Close
          </button>
        </div>
      </div>
    )
  }

  const draft = current ? drafts[current.id] : undefined

  return (
    <div className="fixed inset-0 z-50 bg-bg/95 flex flex-col items-center justify-center p-6" data-testid="copilot-deck">
      <div className="w-full max-w-2xl bg-surface border border-line rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-sans text-ink-3">{safeIndex + 1} of {hotThreads.length}</span>
          <button onClick={close} className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Esc</button>
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">{current.subject}</h3>
          <p className="text-sm text-ink-2 mt-1">{current.from}</p>
          <p className="text-sm text-ink-3 mt-2">{current.snippet}</p>
        </div>
        <div className="border-t border-line pt-4">
          {!draft || draft.status === 'loading' ? (
            <p className="text-sm text-ink-3">Drafting in your voice…</p>
          ) : draft.status === 'error' ? (
            <p className="text-sm text-data-coral">Couldn't draft this. Press E to write it, or skip.</p>
          ) : (
            <p className="text-sm text-ink whitespace-pre-wrap" data-testid="draft-text">{draft.text}</p>
          )}
        </div>
        <p className="text-[11px] text-ink-3">Enter/S send · E edit · Space/→ skip · ← back · Esc close</p>
      </div>
    </div>
  )
}
