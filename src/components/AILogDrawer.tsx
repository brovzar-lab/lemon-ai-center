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
          'fixed bottom-20 right-6 z-40 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg border transition-all',
          count > 0
            ? 'bg-bg-surface border-accent-coral/30 text-text-primary'
            : 'bg-bg-surface border-border-soft text-text-muted',
        ].join(' ')}
        title="AI action log"
      >
        <span className="text-[11px] font-body font-semibold uppercase tracking-wider">
          AI Log
        </span>
        {count > 0 && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent-coral text-white text-[10px] font-body font-bold">
            {count}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-y-0 right-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="flex-1 bg-bg-base/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Panel */}
          <div className="w-[380px] bg-bg-surface border-l border-border-soft p-5 overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[10px] font-body font-semibold text-text-muted tracking-widest uppercase">
                AI Actions (24h)
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-text-muted hover:text-text-primary text-sm"
              >
                ✕
              </button>
            </div>

            {aiActions.length === 0 ? (
              <p className="font-body text-sm text-text-tertiary text-center py-8">
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
                        ? 'border-border-soft opacity-40'
                        : 'border-border-soft',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-body font-semibold uppercase tracking-wider text-accent-coral">
                          {TYPE_LABELS[action.type]}
                        </span>
                        <p className="font-body text-sm text-text-primary mt-1">
                          {action.target.label}
                        </p>
                        {action.type === 'delegate_recalled' && (
                          <p className="font-body text-[11px] text-accent-lemon mt-1">
                            Marked recalled — email already sent. Send a follow-up?
                          </p>
                        )}
                        <p className="font-body text-[10px] text-text-muted mt-1">
                          {new Date(action.createdAt).toLocaleTimeString()}
                          {' · '}
                          {action.confidence} confidence
                        </p>
                      </div>
                      {action.reversible && !action.undone && (
                        <button
                          type="button"
                          onClick={() => user && undo(user.uid, action.id)}
                          className="text-[10px] font-body font-semibold uppercase tracking-wider text-text-muted hover:text-accent-coral transition-colors px-2 py-1 rounded border border-border-soft hover:border-accent-coral/30"
                        >
                          Undo
                        </button>
                      )}
                    </div>
                    {action.undone && (
                      <span className="inline-block mt-2 text-[9px] font-body font-semibold uppercase tracking-widest text-text-muted">
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
