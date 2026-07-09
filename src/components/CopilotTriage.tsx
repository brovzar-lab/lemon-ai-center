import { useEffect, useMemo, useState } from 'react'
import { useInboxStore } from '@/stores/useInboxStore'
import { useCopilotStore } from '@/stores/useCopilotStore'
import { extractEmail } from '@/lib/inbox/extractEmail'

const ATTACHMENT_HINT = /\b(adjunto|adjunta|attached|attachment|se adjunta|enclosed)\b/i

export function CopilotTriage(): JSX.Element | null {
  const isOpen = useCopilotStore((s) => s.isOpen)
  const index = useCopilotStore((s) => s.index)
  const hydrated = useCopilotStore((s) => s.hydrated)
  const drafts = useCopilotStore((s) => s.drafts)
  const pending = useCopilotStore((s) => s.pending)
  const requestDraft = useCopilotStore((s) => s.requestDraft)
  const hydrateFromCache = useCopilotStore((s) => s.hydrateFromCache)
  const setDraftText = useCopilotStore((s) => s.setDraftText)
  const queueSend = useCopilotStore((s) => s.queueSend)
  const undoSend = useCopilotStore((s) => s.undoSend)
  const retrySend = useCopilotStore((s) => s.retrySend)
  const next = useCopilotStore((s) => s.next)
  const prev = useCopilotStore((s) => s.prev)
  const close = useCopilotStore((s) => s.close)
  const threads = useInboxStore((s) => s.threads)

  const [editing, setEditing] = useState(false)

  const hotThreads = useMemo(() => threads.filter((t) => t.priority === 'HOT'), [threads])
  // index can point past the end if the HOT set shrank (e.g. a background inbox
  // refetch) while the deck was open; clamp so we never read undefined and crash.
  const safeIndex = hotThreads.length > 0 ? Math.min(index, hotThreads.length - 1) : 0
  const current = hotThreads[safeIndex]
  const draft = current ? drafts[current.id] : undefined
  const latestPending = pending[pending.length - 1]

  // Seed any cached drafts (Task 13's pre-generation) the instant the deck
  // opens, so hot threads the inbox scan already drafted show up right away
  // instead of every card starting from "Drafting in your voice…".
  useEffect(() => {
    if (isOpen) hydrateFromCache(hotThreads)
  }, [isOpen, hotThreads, hydrateFromCache])

  // Gated on `hydrated` (set by the hydrate-on-open effect above, once cache
  // seeding has been attempted) so this doesn't read `drafts` before the cache
  // hydration for the current card has had a chance to land — otherwise the
  // first card always misses its cache hit and takes the slow on-demand path.
  useEffect(() => {
    if (isOpen && hydrated && current) requestDraft(current)
  }, [isOpen, hydrated, current, requestDraft])

  // Leaving edit mode when the displayed card changes (send/skip/back) avoids
  // carrying a stale textarea into the next thread's draft.
  useEffect(() => { setEditing(false) }, [safeIndex])

  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (editing) {
        if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
        return // let the textarea receive all other keys
      }
      if (e.key === 'Escape') { e.preventDefault(); close(); return }
      if (e.key === 'u' || e.key === 'U') {
        // Only a still-counting send can be undone — once it's sending/committed
        // (or already failed) there is nothing live left to cancel.
        if (latestPending && latestPending.status === 'counting') { e.preventDefault(); undoSend(latestPending.id) }
        return
      }
      if (e.key === 'r' || e.key === 'R') {
        // Only a failed send can be retried — retrying a still-counting/sending
        // entry would queue a duplicate send.
        if (latestPending && latestPending.status === 'error') { e.preventDefault(); retrySend(latestPending.id) }
        return
      }
      if (!current) return
      if (e.key === 'Enter' || e.key === 's' || e.key === 'S') {
        e.preventDefault()
        if (draft?.status === 'ready' && draft.text.trim()) {
          queueSend({
            threadId: current.id,
            to: extractEmail(current.from, current.fromDomain),
            subject: `Re: ${current.subject}`,
            body: draft.text,
          })
          next(hotThreads.length)
        }
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault(); setEditing(true)
      } else if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'j' || e.key === 'J') {
        e.preventDefault(); next(hotThreads.length)
      } else if (e.key === 'ArrowLeft' || e.key === 'k' || e.key === 'K') {
        e.preventDefault(); prev()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, editing, current, draft, latestPending, hotThreads.length, queueSend, undoSend, retrySend, next, prev, close])

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
          {editing ? (
            <textarea
              autoFocus
              value={draft?.text ?? ''}
              onChange={(e) => setDraftText(current.id, e.target.value)}
              rows={8}
              className="w-full bg-bg border border-line rounded-md p-3 text-sm text-ink"
            />
          ) : !draft || draft.status === 'loading' ? (
            <p className="text-sm text-ink-3">Drafting in your voice…</p>
          ) : draft.status === 'error' ? (
            <p className="text-sm text-data-coral">Couldn't draft this. Press E to write it, or skip.</p>
          ) : (
            <p className="text-sm text-ink whitespace-pre-wrap" data-testid="draft-text">{draft.text}</p>
          )}
          {!editing && draft?.status === 'ready' && ATTACHMENT_HINT.test(draft.text) && (
            <p className="text-[11px] text-ink-2 mt-2">Mentions an attachment. Add the attachment in Gmail before or after sending.</p>
          )}
        </div>
        <p className="text-[11px] text-ink-3">Enter/S send · E edit · Space/→ skip · ← back · U undo · R retry · Esc close</p>
      </div>

      {latestPending && (
        <div className="mt-4 bg-surface border border-line rounded-lg px-4 py-2 flex items-center gap-4">
          <span className="text-sm text-ink-2">
            {latestPending.status === 'error'
              ? 'Send failed.'
              : latestPending.status === 'sending'
              ? 'Sending…'
              : `Sending in 5s${pending.length > 1 ? ` (+${pending.length - 1} more)` : ''}…`}
          </span>
          {latestPending.status === 'counting' && (
            <button onClick={() => undoSend(latestPending.id)} className="text-[11px] font-semibold uppercase tracking-wider text-accent">Undo</button>
          )}
          {latestPending.status === 'error' && (
            <button onClick={() => retrySend(latestPending.id)} className="text-[11px] font-semibold uppercase tracking-wider text-accent">Retry</button>
          )}
        </div>
      )}
    </div>
  )
}
