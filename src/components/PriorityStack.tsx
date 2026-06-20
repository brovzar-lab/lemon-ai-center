import { useEffect } from 'react'
import { useTodayStore } from '@/stores/useTodayStore'
import { Clock, RefreshCw } from 'lucide-react'

const urgencyDot: Record<string, string> = {
  critical: 'bg-data-coral',
  high: 'bg-accent',
  medium: 'bg-ink-3',
}

const urgencyLabel: Record<string, string> = {
  critical: 'critical urgency',
  high: 'high urgency',
  medium: 'medium urgency',
}

const labelColor: Record<string, string> = {
  Deals: 'text-accent bg-accent/10 border-accent/20',
  Production: 'text-data-teal bg-data-teal/10 border-data-teal/20',
  Development: 'text-data-blue bg-data-blue/10 border-data-blue/20',
}

export function PriorityStack() {
  const { priorities, northStar, precomputeToday, loading, fetchToday, triggerPrecompute } = useTodayStore()

  useEffect(() => {
    fetchToday()
  }, [fetchToday])

  if (!priorities.length && !loading) return null

  return (
    <section aria-label="Today's priorities" className="pb-4">
      {/* Section label */}
      <div className="ed-section-label mb-3 flex items-center justify-between">
        <span>Today's Priorities</span>
        <button
          onClick={triggerPrecompute}
          className="text-[11px] font-sans text-ink-3 hover:text-accent transition-colors flex items-center gap-1"
          title="Refresh priorities"
        >
          <RefreshCw size={11} /> refresh
        </button>
      </div>

      {/* North star */}
      {northStar && (
        <p className="font-sans text-[14px] italic text-accent/80 mb-4 leading-relaxed">
          {northStar}
        </p>
      )}

      {/* Freshness indicator */}
      {!precomputeToday && priorities.length > 0 && (
        <div className="mb-3 px-3 py-1.5 border border-accent/20 text-[11px] font-sans text-ink-3 flex items-center gap-1.5">
          <Clock size={12} /> Priorities from yesterday — refresh for today's data
        </div>
      )}

      {loading && !priorities.length ? (
        <div className="flex items-center gap-2 text-[11px] font-sans text-ink-3">
          <div className="spinner" />
          Loading priorities…
        </div>
      ) : (
        <ol className="space-y-3">
          {priorities.map((p) => (
            <li
              key={p.rank}
              className="flex gap-3 group -mx-2 px-2 py-2 rounded hover:bg-sunken/50 transition-colors"
            >
              {/* Rank number */}
              <span className="flex-shrink-0 font-sans text-2xl font-bold text-ink-3 leading-none mt-0.5 w-7 text-right num">
                {p.rank}
              </span>

              <div className="flex-1 min-w-0">
                {/* Label badge + urgency dot */}
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-sans font-semibold uppercase tracking-[0.15em] border rounded ${labelColor[p.label] || 'text-ink-2 bg-sunken border-line'}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${urgencyDot[p.urgency] || urgencyDot.medium}`}
                      aria-label={urgencyLabel[p.urgency] || 'medium urgency'}
                      role="img"
                    />
                    {p.label}
                  </span>
                  <span className="text-[11px] font-sans text-ink-3 uppercase tracking-wider">
                    {p.urgency}
                  </span>
                </div>

                {/* Title */}
                <p className="font-sans text-[15px] font-semibold text-ink leading-snug">
                  {p.title}
                </p>

                {/* Rationale */}
                <p className="font-sans text-[12px] text-ink-2 mt-0.5 leading-relaxed">
                  {p.rationale}
                </p>

                {/* Thread count */}
                {p.threadCount > 0 && (
                  <p className="text-[11px] font-sans text-ink-3 mt-1">
                    {p.threadCount} related email{p.threadCount !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <hr className="ed-rule mt-4" />
    </section>
  )
}
