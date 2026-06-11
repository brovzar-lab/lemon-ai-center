import { useMemo, useState } from 'react'
import { useInboxStore } from '@/stores/useInboxStore'
import { useUIStore } from '@/stores/useUIStore'
import type { InboxThread } from '@shared/types'

interface Props {
  onReply?: (thread: InboxThread) => void
  onCreateTask?: (thread: InboxThread) => void
}

type GroupKey = 'needs-reply' | 'new' | 'handled'

function groupThreads(threads: InboxThread[]) {
  const needsReply: InboxThread[] = []
  const newThreads: InboxThread[] = []
  const handled: InboxThread[] = []

  for (const thread of threads) {
    if (thread.priority === 'HOT' || (thread.unread && thread.priority === 'MED')) {
      needsReply.push(thread)
    } else if (thread.unread) {
      newThreads.push(thread)
    } else {
      handled.push(thread)
    }
  }

  return { needsReply, newThreads, handled }
}

export function InboxSummary({ onReply, onCreateTask }: Props) {
  const threads = useInboxStore((s) => s.threads)
  const loading = useInboxStore((s) => s.loading)
  const setActiveThread = useInboxStore((s) => s.setActiveThread)
  const setActiveContext = useUIStore((s) => s.setActiveContext)
  const openDrawer = useUIStore((s) => s.openDrawer)

  const [expandedGroups, setExpandedGroups] = useState<Record<GroupKey, boolean>>({
    'needs-reply': true,
    'new': true,
    'handled': false,
  })

  const { needsReply, newThreads, handled } = useMemo(() => groupThreads(threads), [threads])

  const openThread = (thread: InboxThread) => {
    setActiveThread(thread.id)
    setActiveContext({ kind: 'thread', id: thread.id })
    openDrawer()
  }

  const toggleGroup = (key: GroupKey) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const ThreadRow = ({ thread }: { thread: InboxThread }) => (
    <button
      key={thread.id}
      type="button"
      onClick={() => openThread(thread)}
      className="flex items-start gap-2 text-left group hover:bg-bg-elevated/50 p-1.5 -mx-1.5 transition-colors min-h-[40px] w-full"
      role="listitem"
      aria-label={`${thread.priority} priority: ${thread.from} — ${thread.subject}`}
    >
      <span className={`text-[11px] font-body font-bold uppercase tracking-widest px-1 py-0.5 border flex-shrink-0 mt-0.5 ${
        thread.priority === 'HOT' ? 'text-accent-coral border-accent-coral/30' :
        thread.priority === 'MED' ? 'text-accent-lemon border-accent-lemon/30' :
        'text-text-muted border-border-soft'
      }`}>
        {thread.priority}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-body font-semibold text-text-primary truncate leading-tight" title={thread.from}>
          {thread.from}
        </p>
        <p className="text-[12px] font-body text-text-secondary truncate" title={thread.subject}>
          {thread.subject}
        </p>
      </div>
    </button>
  )

  const groups: { key: GroupKey; label: string; threads: InboxThread[]; accentClass: string; maxShow: number }[] = [
    { key: 'needs-reply', label: 'Needs Your Reply', threads: needsReply, accentClass: 'text-accent-coral', maxShow: 5 },
    { key: 'new', label: 'New Today', threads: newThreads, accentClass: 'text-accent-lemon', maxShow: 4 },
    { key: 'handled', label: 'Handled', threads: handled, accentClass: 'text-text-muted', maxShow: 3 },
  ]

  return (
    <section className="pb-4" aria-label="Inbox summary">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[11px] font-body font-bold uppercase tracking-[0.2em] text-text-muted">
          Inbox
        </p>
        <span className="text-[11px] font-body text-text-tertiary">
          {threads.length} threads
        </span>
      </div>

      <hr className="ed-rule mb-3" />

      {/* Loading skeleton */}
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
      ) : threads.length === 0 ? (
        <p className="text-[12px] font-body text-text-muted italic">Inbox zero — nice.</p>
      ) : (
        <div className="space-y-4">
          {groups.map(({ key, label, threads: groupThreads, accentClass, maxShow }) => {
            if (groupThreads.length === 0) return null
            const isOpen = expandedGroups[key]
            const shown = isOpen ? groupThreads.slice(0, maxShow) : []
            const remaining = groupThreads.length - maxShow

            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(key)}
                  className="flex items-center gap-2 mb-2 w-full text-left group"
                  aria-expanded={isOpen}
                >
                  <span className={`text-[11px] font-body font-bold uppercase tracking-[0.15em] ${accentClass}`}>
                    {label}
                  </span>
                  <span className={`text-[11px] font-body font-semibold ${accentClass}`}>
                    ({groupThreads.length})
                  </span>
                  <span
                    className={`text-text-muted/40 text-xs transition-transform duration-200 ml-auto ${
                      isOpen ? 'rotate-0' : '-rotate-90'
                    }`}
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                </button>

                {isOpen && (
                  <div className="flex flex-col gap-1" role="list" aria-label={`${label} threads`}>
                    {shown.map((thread) => (
                      <ThreadRow key={thread.id} thread={thread} />
                    ))}
                    {remaining > 0 && (
                      <button
                        type="button"
                        onClick={() => openThread(groupThreads[maxShow])}
                        className="text-[11px] font-body text-text-muted hover:text-accent-coral transition-colors text-left py-1 min-h-[36px] flex items-center"
                      >
                        +{remaining} more →
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <hr className="ed-rule mt-3" />
    </section>
  )
}
