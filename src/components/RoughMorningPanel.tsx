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
        className="absolute inset-0 bg-bg/80 backdrop-blur-md"
        onClick={dismiss}
      />
      {/* Panel */}
      <div className="relative w-full max-w-md mx-4 bg-surface border border-line rounded-2xl shadow-2xl p-8 text-center">
        <p className="text-[10px] font-sans font-semibold uppercase tracking-widest text-accent mb-4">
          Rough Morning Mode
        </p>
        <h2 className="font-display text-2xl font-semibold text-ink mb-2">
          Just do these three things.
        </h2>
        <p className="font-sans text-sm text-ink-3 mb-6">
          Everything else can wait. Focus on what moves the needle.
        </p>

        {topTasks.length > 0 ? (
          <ol className="space-y-3 text-left mb-8">
            {topTasks.map((task, i) => (
              <li key={task.id} className="flex items-center gap-3">
                <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-accent/15 text-accent text-sm font-display font-semibold">
                  {i + 1}
                </span>
                <span className="font-sans text-sm text-ink">{task.title}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="font-sans text-sm text-ink-3 mb-8">
            No NOW tasks — that's already a win.
          </p>
        )}

        <button
          type="button"
          onClick={dismiss}
          className="text-[11px] font-sans font-semibold uppercase tracking-wider px-6 py-2.5 rounded-lg bg-accent text-bg hover:bg-accent/90 transition-colors"
        >
          Got it, let's go
        </button>
      </div>
    </div>
  )
}
