import { useRoughMorningStore } from '@/stores/useRoughMorningStore'
import { useTaskStore } from '@/stores/useTaskStore'

export function RoughMorningPanel() {
  const active = useRoughMorningStore((s) => s.active)
  const dismiss = useRoughMorningStore((s) => s.dismiss)
  const tasks = useTaskStore((s) => s.tasks)

  if (!active) return null

  // Show the top 3 undone NOW tasks
  const topTasks = tasks
    .filter((t) => t.bucket === 'now' && !t.done)
    .slice(0, 3)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-bg-base/80 backdrop-blur-md"
        onClick={dismiss}
      />
      {/* Panel */}
      <div className="relative w-full max-w-md mx-4 bg-bg-surface border border-border-soft rounded-2xl shadow-2xl p-8 text-center">
        <p className="text-[10px] font-body font-semibold uppercase tracking-widest text-accent-lemon mb-4">
          Rough Morning Mode
        </p>
        <h2 className="font-display text-2xl font-semibold text-text-primary mb-2">
          Just do these three things.
        </h2>
        <p className="font-body text-sm text-text-tertiary mb-6">
          Everything else can wait. Focus on what moves the needle.
        </p>

        {topTasks.length > 0 ? (
          <ol className="space-y-3 text-left mb-8">
            {topTasks.map((task, i) => (
              <li key={task.id} className="flex items-center gap-3">
                <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-accent-lemon/15 text-accent-lemon text-sm font-display font-semibold">
                  {i + 1}
                </span>
                <span className="font-body text-sm text-text-primary">{task.title}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="font-body text-sm text-text-muted mb-8">
            No NOW tasks — that's already a win.
          </p>
        )}

        <button
          type="button"
          onClick={dismiss}
          className="text-[11px] font-body font-semibold uppercase tracking-wider px-6 py-2.5 rounded-lg bg-accent-lemon text-bg-base hover:bg-accent-lemon/90 transition-colors"
        >
          Got it, let's go
        </button>
      </div>
    </div>
  )
}
