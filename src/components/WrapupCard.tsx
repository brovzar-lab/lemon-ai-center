import { useTaskStore } from '@/stores/useTaskStore'
import { useFocusModeStore } from '@/stores/useFocusModeStore'

export function WrapupCard() {
  const tasks = useTaskStore((s) => s.tasks)

  const total = tasks.length
  const done = tasks.filter((t) => t.done).length
  // TODO: track dropped tasks — not displaying until real data is available

  // Real focus time from store
  const focusMinutes = useFocusModeStore((s) => s.totalFocusMinutes())

  // Recently done (today)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const recentlyDone = tasks.filter(
    (t) => t.done && t.doneAt && new Date(t.doneAt).getTime() >= todayStart.getTime(),
  )

  return (
    <section className="py-4" aria-label="End of day wrap-up">
      <p className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-ink-3 mb-1">
        Wrap-up
      </p>
      <p className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-ink-3 mb-4">
        End of Day · {new Date().getHours() >= 16 ? 'End of day review' : 'Day in progress'}
      </p>

      {/* 3-stat row — large display numbers */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <span className="font-display text-3xl font-semibold text-ink leading-none block">{done}</span>
          <p className="text-[10px] font-sans font-bold uppercase tracking-[0.15em] text-ink-3 mt-1">Shipped</p>
        </div>
        <div>
          <span className="font-display text-3xl font-semibold text-ink leading-none block">{focusMinutes}m</span>
          <p className="text-[10px] font-sans font-bold uppercase tracking-[0.15em] text-ink-3 mt-1">Deep Focus</p>
        </div>
        <div>
          <span className="font-display text-3xl font-semibold text-ink leading-none block">&mdash;</span>
          <p className="text-[10px] font-sans font-bold uppercase tracking-[0.15em] text-ink-3 mt-1">Dropped</p>
        </div>
      </div>

      {/* Summary text */}
      <p className="text-[12px] font-display italic text-ink-2 leading-relaxed mb-3">
        {recentlyDone.length > 0
          ? `${recentlyDone.map((t) => t.title.split(' ').slice(0, 3).join(' ')).join(' + ')} — completed. Tomorrow's first move pending.`
          : 'No tasks completed today yet. Focus on your One Thing.'}
      </p>

      {/* See what shipped */}
      {recentlyDone.length > 0 && (
        <button
          type="button"
          className="text-[11px] font-sans font-semibold uppercase tracking-[0.15em] text-ink-2 hover:text-ink transition-colors min-h-[36px]"
            aria-label={`See the ${recentlyDone.length} tasks shipped today`}
        >
          See What Shipped ({recentlyDone.length})
        </button>
      )}
    </section>
  )
}
