import { useState } from 'react'
import { useActionLogStore } from '@/stores/useActionLogStore'
import { useAuthStore } from '@/stores/useAuthStore'
import type { AIAction } from '@shared/types'

const TYPE_LABELS: Record<AIAction['type'], string> = {
  archive: 'Archived',
  label: 'Labeled',
  draft: 'Drafted',
  delegate: 'Delegated',
  delegate_recalled: 'Recall Noted',
  snooze: 'Snoozed',
  priority_change: 'Re-prioritized',
  calendar_block: 'Calendar Block',
}

export function AILogDrawer() {
  const [open, setOpen] = useState(false)
  const actions = useActionLogStore((s) => s.actions)
  const activeCount = useActionLogStore((s) => s.activeCount)
  const undo = useActionLogStore((s) => s.undo)
  const user = useAuthStore((s) => s.user)

  const count = activeCount()
  const aiActions = actions.filter((a) => a.initiator === 'ai')

  return (
    <>
      {/* Floating pill trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={[
          'fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-[calc(1.5rem+env(safe-area-inset-right,0px))] z-40 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg border transition-all',
          count > 0
            ? 'bg-surface border-data-coral/30 text-ink'
            : 'bg-surface border-line text-ink-3',
        ].join(' ')}
        title="AI action log"
      >
        <span className="text-[11px] font-sans font-semibold uppercase tracking-wider">
          AI Log
        </span>
        {count > 0 && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-data-coral text-white text-[10px] font-sans font-bold">
            {count}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-y-0 right-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="flex-1 bg-bg/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Panel */}
          <div className="w-[min(85vw,380px)] bg-surface border-l border-line p-5 overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[10px] font-sans font-semibold text-ink-3 tracking-widest uppercase">
                AI Actions (24h)
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-ink-3 hover:text-ink text-sm"
              >
                ✕
              </button>
            </div>

            {aiActions.length === 0 ? (
              <p className="font-sans text-sm text-ink-3 text-center py-8">
                No AI actions yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {aiActions.map((action) => (
                  <li
                    key={action.id}
                    className={[
                      'p-3 rounded-lg border transition-opacity',
                      action.undone
                        ? 'border-line opacity-40'
                        : 'border-line',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-data-coral">
                          {TYPE_LABELS[action.type]}
                        </span>
                        <p className="font-sans text-sm text-ink mt-1">
                          {action.target.label}
                        </p>
                        {action.type === 'delegate_recalled' && (
                          <p className="font-sans text-[11px] text-accent mt-1">
                            Marked recalled — email already sent. Send a follow-up?
                          </p>
                        )}
                        <p className="font-sans text-[10px] text-ink-3 mt-1">
                          {new Date(action.createdAt).toLocaleTimeString()}
                          {' · '}
                          {action.confidence} confidence
                        </p>
                      </div>
                      {action.reversible && !action.undone && (
                        <button
                          type="button"
                          onClick={() => user && undo(user.uid, action.id)}
                          className="text-[10px] font-sans font-semibold uppercase tracking-wider text-ink-3 hover:text-data-coral transition-colors px-2 py-1 rounded border border-line hover:border-data-coral/30"
                        >
                          Undo
                        </button>
                      )}
                    </div>
                    {action.undone && (
                      <span className="inline-block mt-2 text-[9px] font-sans font-semibold uppercase tracking-widest text-ink-3">
                        Undone
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  )
}
