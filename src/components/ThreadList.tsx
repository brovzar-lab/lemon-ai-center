import { useInboxStore } from '@/stores/useInboxStore'
import { useUIStore } from '@/stores/useUIStore'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import type { InboxThread, ThreadPriority } from '@shared/types'

const PRIORITY_DOT: Record<ThreadPriority, string> = {
  HOT: 'bg-accent-coral',
  MED: 'bg-accent-sage',
  LOW: 'bg-border-medium',
}

const URGENCY_BADGE: Record<ThreadPriority, { label: string; class: string }> = {
  HOT: { label: 'HOT', class: 'bg-accent-coral/10 border-accent-coral/20 text-accent-coral' },
  MED: { label: 'MED', class: 'bg-accent-lemon/10 border-accent-lemon/20 text-accent-lemon' },
  LOW: { label: 'LOW', class: 'bg-bg-elevated border-border-soft text-text-muted' },
}

// Detect inbox category from domain/subject
function detectCategory(thread: InboxThread): { label: string; class: string } {
  const domain = (thread.fromDomain || '').toLowerCase()
  const subject = (thread.subject || '').toLowerCase()

  // Deal-related keywords
  if (subject.includes('funding') || subject.includes('fondeo') || subject.includes('nda') || subject.includes('contract') || subject.includes('deal'))
    return { label: 'DEAL', class: 'bg-accent-coral/10 text-accent-coral border-accent-coral/20' }

  // Internal Lemon
  if (domain.includes('lemon'))
    return { label: 'INT', class: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20' }

  // Info/newsletters
  if (domain.includes('anthropic') || domain.includes('google') || domain.includes('github') || subject.includes('newsletter') || subject.includes('update'))
    return { label: 'INFO', class: 'bg-bg-elevated text-text-muted border-border-soft' }

  return { label: 'OTHER', class: 'bg-bg-elevated text-text-muted border-border-soft' }
}

interface Props {
  threads: InboxThread[]
  onReply?: (thread: InboxThread) => void
  onCreateTask?: (thread: InboxThread) => void
}

export function ThreadList({ threads, onReply, onCreateTask }: Props) {
  const setActiveThread = useInboxStore((s) => s.setActiveThread)
  const setActiveContext = useUIStore((s) => s.setActiveContext)
  const openDrawer = useUIStore((s) => s.openDrawer)
  const { newDashboard } = useFeatureFlags()

  const openThread = (thread: InboxThread) => {
    setActiveThread(thread.id)
    setActiveContext({ kind: 'thread', id: thread.id })
    openDrawer()
  }

  return (
    <div className={`flex flex-col ${newDashboard ? 'gap-2' : 'gap-0.5'}`}>
      {threads.map((thread) => {
        const category = detectCategory(thread)
        const urgency = URGENCY_BADGE[thread.priority]

        return newDashboard ? (
          /* Enhanced card layout matching Banani design */
          <div
            key={thread.id}
            className="group p-3.5 rounded-lg border border-border-soft bg-bg-elevated/30 hover:bg-bg-elevated/60 transition cursor-pointer"
            onClick={() => openThread(thread)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <span className={`text-[9px] font-body font-bold px-1.5 py-0.5 rounded border shrink-0 uppercase tracking-widest ${category.class}`}>
                  {category.label}
                </span>
                <span className="text-[13px] font-body font-semibold text-text-primary truncate">
                  {thread.from}
                </span>
              </div>
              <span className={`text-[9px] font-body font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border shrink-0 ${urgency.class}`}>
                {urgency.label}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-[12px] font-body text-text-secondary truncate max-w-[85%]">
                {thread.subject}
              </p>
              <span className="text-[11px] font-body text-text-muted font-medium shrink-0">
                {new Date(thread.receivedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            {/* Hover actions */}
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 mt-2 pt-2 border-t border-border-soft transition-all">
              {onCreateTask && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onCreateTask(thread) }}
                  className="text-[10px] font-body font-medium text-accent-sage hover:text-text-primary px-2 py-1 rounded border border-border-soft"
                  title="Create task from this email"
                >
                  → Task
                </button>
              )}
              {onReply && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onReply(thread) }}
                  className="text-[10px] font-body font-medium text-accent-lemon hover:text-text-primary px-2 py-1 rounded border border-border-soft"
                >
                  Reply
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Legacy row layout — preserved exactly */
          <div key={thread.id} className="group flex items-start gap-3 p-2.5 rounded-lg hover:bg-bg-elevated transition-colors w-full">
            <button
              type="button"
              onClick={() => openThread(thread)}
              className="flex items-start gap-3 flex-1 min-w-0 text-left"
            >
              <div className="mt-1.5 flex-shrink-0">
                <span className={`block w-2 h-2 rounded-full ${PRIORITY_DOT[thread.priority]}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-body font-medium truncate ${thread.unread ? 'text-text-primary' : 'text-text-secondary'}`}>
                    {thread.from}
                  </span>
                  <span className="text-[10px] text-text-muted font-body flex-shrink-0">
                    {new Date(thread.receivedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                <p className={`text-xs font-body truncate mt-0.5 ${thread.unread ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                  {thread.subject}
                </p>
                <p className="text-[11px] font-body text-text-muted truncate mt-0.5">{thread.snippet}</p>
              </div>
            </button>
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 mt-1 flex-shrink-0 transition-all">
              {onCreateTask && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onCreateTask(thread) }}
                  className="text-[10px] font-body font-medium text-accent-sage hover:text-text-primary px-2 py-1 rounded border border-border-soft"
                  title="Create task from this email"
                >
                  → Task
                </button>
              )}
              {onReply && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onReply(thread) }}
                  className="text-[10px] font-body font-medium text-accent-lemon hover:text-text-primary px-2 py-1 rounded border border-border-soft"
                >
                  Reply
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
