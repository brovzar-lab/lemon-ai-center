import { useInboxStore } from '@/stores/useInboxStore'
import { ThreadList } from './ThreadList'
import { TriageMode } from './TriageMode'
import { ArrowRight } from 'lucide-react'
import type { InboxThread } from '@shared/types'

interface InboxPanelProps {
  onReply?: (thread: InboxThread) => void
  onCreateTask?: (thread: InboxThread) => void
}

export function InboxPanel({ onReply, onCreateTask }: InboxPanelProps) {
  const { threads, triageMode, enterTriage, loading } = useInboxStore()

  return (
    <>
      <div className="bg-surface border border-line rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[10px] font-sans font-semibold text-ink-3 tracking-widest uppercase">Inbox</h2>
          <button type="button" onClick={enterTriage} className="text-[11px] font-sans font-medium text-accent hover:opacity-80 transition-opacity">
            Triage <ArrowRight size={12} className="inline" />
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          </div>
        ) : (
          <ThreadList threads={threads} onReply={onReply} onCreateTask={onCreateTask} />
        )}
      </div>
      {triageMode && <TriageMode />}
    </>
  )
}
