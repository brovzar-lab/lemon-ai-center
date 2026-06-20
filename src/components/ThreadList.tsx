import { useInboxStore } from '@/stores/useInboxStore'
import { useUIStore } from '@/stores/useUIStore'
import { ArrowRight } from 'lucide-react'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import type { InboxThread, ThreadPriority } from '@shared/types'

const PRIORITY_DOT: Record<ThreadPriority, string> = {
  HOT: 'bg-data-coral',
  MED: 'bg-data-teal',
  LOW: 'bg-line',
}

const URGENCY_BADGE: Record<ThreadPriority, { label: string; class: string }> = {
  HOT: { label: 'HOT', class: 'bg-data-coral/10 border-data-coral/20 text-data-coral' },
  MED: { label: 'MED', class: 'bg-accent/10 border-accent/20 text-accent' },
  LOW: { label: 'LOW', class: 'bg-sunken border-line text-ink-3' },
}

// Detect inbox category from domain/subject
function detectCategory(thread: InboxThread): { label: string; class: string } {
  const domain = (thread.fromDomain || '').toLowerCase()
  const subject = (thread.subject || '').toLowerCase()

  // Deal-related keywords
  if (subject.includes('funding') || subject.includes('fondeo') || subject.includes('nda') || subject.includes('contract') || subject.includes('deal'))
    return { label: 'DEAL', class: 'bg-data-coral/10 text-data-coral border-data-coral/20' }

  // Internal Lemon
  if (domain.includes('lemon'))
    return { label: 'INT', class: 'bg-data-blue/10 text-data-blue border-data-blue/20' }

  // Info/newsletters
  if (domain.includes('anthropic') || domain.includes('google') || domain.includes('github') || subject.includes('newsletter') || subject.includes('update'))
    return { label: 'INFO', class: 'bg-sunken text-ink-3 border-line' }

  return { label: 'OTHER', class: 'bg-sunken text-ink-3 border-line' }
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
            className="group p-3.5 rounded-lg bg-surface shadow-card hover:shadow-hover transition-shadow cursor-pointer"
            onClick={() => openThread(thread)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <span className={`text-[9px] font-sans font-bold px-1.5 py-0.5 rounded border shrink-0 uppercase tracking-widest ${category.class}`}>
                  {category.label}
                </span>
                <span className="text-[13px] font-sans font-semibold text-ink truncate">
                  {thread.from}
                </span>
              </div>
              <span className={`text-[9px] font-sans font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border shrink-0 ${urgency.class}`}>
                {urgency.label}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-[12px] font-sans text-ink-2 truncate max-w-[85%]">
                {thread.subject}
              </p>
              <span className="text-[11px] font-sans text-ink-3 font-medium shrink-0">
                {new Date(thread.receivedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            {/* Hover actions */}
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 mt-2 pt-2 border-t border-line transition-all">
              {onCreateTask && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onCreateTask(thread) }}
                  className="text-[10px] font-sans font-medium text-data-teal hover:text-ink px-2 py-1 rounded border border-line"
                  title="Create task from this email"
                >
                  <ArrowRight size={12} className="inline" /> Task
                </button>
              )}
              {onReply && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onReply(thread) }}
                  className="text-[10px] font-sans font-medium text-accent hover:text-ink px-2 py-1 rounded border border-line"
                >
                  Reply
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Legacy row layout — preserved exactly */
          <div key={thread.id} className="group flex items-start gap-3 p-2.5 rounded-lg hover:bg-sunken transition-colors w-full">
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
                  <span className={`text-xs font-sans font-medium truncate ${thread.unread ? 'text-ink' : 'text-ink-2'}`}>
                    {thread.from}
                  </span>
                  <span className="text-[10px] text-ink-3 font-sans flex-shrink-0">
                    {new Date(thread.receivedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                <p className={`text-xs font-sans truncate mt-0.5 ${thread.unread ? 'text-ink font-medium' : 'text-ink-2'}`}>
                  {thread.subject}
                </p>
                <p className="text-[11px] font-sans text-ink-3 truncate mt-0.5">{thread.snippet}</p>
              </div>
            </button>
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 mt-1 flex-shrink-0 transition-all">
              {onCreateTask && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onCreateTask(thread) }}
                  className="text-[10px] font-sans font-medium text-data-teal hover:text-ink px-2 py-1 rounded border border-line"
                  title="Create task from this email"
                >
                  <ArrowRight size={12} className="inline" /> Task
                </button>
              )}
              {onReply && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onReply(thread) }}
                  className="text-[10px] font-sans font-medium text-accent hover:text-ink px-2 py-1 rounded border border-line"
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
