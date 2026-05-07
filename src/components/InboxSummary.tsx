import { useInboxStore } from '@/stores/useInboxStore'
import { useUIStore } from '@/stores/useUIStore'
import type { InboxThread } from '@shared/types'

interface Props {
  onReply?: (thread: InboxThread) => void
  onCreateTask?: (thread: InboxThread) => void
}

export function InboxSummary({ onReply, onCreateTask }: Props) {
  const threads = useInboxStore((s) => s.threads)
  const loading = useInboxStore((s) => s.loading)
  const setActiveThread = useInboxStore((s) => s.setActiveThread)
  const setActiveContext = useUIStore((s) => s.setActiveContext)
  const openDrawer = useUIStore((s) => s.openDrawer)

  const readCount = threads.length
  const draftsCount = 0 // TODO: wire to real drafts count

  const openThread = (thread: InboxThread) => {
    setActiveThread(thread.id)
    setActiveContext({ kind: 'thread', id: thread.id })
    openDrawer()
  }

  return (
    <section className="pb-4" aria-label="Inbox summary">
      {/* Header row */}
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[10px] font-body font-bold uppercase tracking-[0.2em] text-text-muted">
          Inbox · Already Triaged
        </p>
      </div>
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[10px] font-body font-bold uppercase tracking-[0.2em] text-text-muted">
          {readCount} read · {draftsCount} drafts ready
        </p>
        <button
          type="button"
          onClick={() => { if (threads[0]) openThread(threads[0]) }}
          className="text-[11px] font-body font-semibold text-accent-coral hover:underline min-h-[36px] flex items-center"
          aria-label="Open inbox queue"
        >
          Open queue →
        </button>
      </div>

      <hr className="ed-rule mb-3" />

      {/* Decision Pending section */}
      <p className="text-[10px] font-body font-bold uppercase tracking-[0.2em] text-text-muted mb-3">
        Decision Pending
      </p>

      {/* M6: Loading skeleton */}
      {loading && threads.length === 0 ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading inbox threads">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-2 p-1.5">
              <div className="skeleton w-10 h-5 flex-shrink-0" />
              <div className="flex-1">
                <div className="skeleton skeleton-line w-3/4" />
                <div className="skeleton skeleton-line skeleton-line-short" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Show top few threads as compact rows */
        <div className="flex flex-col gap-2" role="list" aria-label="Pending inbox threads">
          {threads.slice(0, 6).map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => openThread(thread)}
              className="flex items-start gap-2 text-left group hover:bg-bg-elevated/50 p-1.5 -mx-1.5 transition-colors min-h-[40px]"
              role="listitem"
              aria-label={`${thread.priority} priority: ${thread.from} — ${thread.subject}`}
            >
              <span className={`text-[10px] font-body font-bold uppercase tracking-widest px-1 py-0.5 border flex-shrink-0 mt-0.5 ${
                thread.priority === 'HOT' ? 'text-accent-coral border-accent-coral/30' :
                thread.priority === 'MED' ? 'text-accent-lemon border-accent-lemon/30' :
                'text-text-muted border-border-soft'
              }`}>
                {thread.priority === 'HOT' ? 'HOT' : thread.priority === 'MED' ? 'MED' : 'LOW'}
              </span>
              <div className="flex-1 min-w-0">
                {/* M5: title attribute prevents truncation from hiding info */}
                <p
                  className="text-[12px] font-body font-semibold text-text-primary truncate leading-tight"
                  title={thread.from}
                >
                  {thread.from}
                </p>
                <p
                  className="text-[11px] font-body text-text-secondary truncate"
                  title={thread.subject}
                >
                  {thread.subject}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <hr className="ed-rule mt-3" />
    </section>
  )
}
