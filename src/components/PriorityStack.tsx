import { useEffect } from 'react'
import { useTodayStore } from '@/stores/useTodayStore'
import { Clock, RefreshCw } from 'lucide-react'

const urgencyDot: Record<string, string> = {
  critical: 'bg-accent-coral',
  high: 'bg-accent-lemon',
  medium: 'bg-text-tertiary',
}

const urgencyLabel: Record<string, string> = {
  critical: 'critical urgency',
  high: 'high urgency',
  medium: 'medium urgency',
}

const labelColor: Record<string, string> = {
  Deals: 'text-accent-lemon bg-accent-lemon/10 border-accent-lemon/20',
  Production: 'text-accent-sage bg-accent-sage/10 border-accent-sage/20',
  Development: 'text-accent-blue bg-accent-blue/10 border-accent-blue/20',
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
          className="text-[11px] font-body text-text-muted hover:text-accent-lemon transition-colors flex items-center gap-1"
          title="Refresh priorities"
        >
          <RefreshCw size={11} /> refresh
        </button>
      </div>

      {/* North star */}
      {northStar && (
        <p className="font-display text-[14px] italic text-accent-lemon/80 mb-4 leading-relaxed">
          {northStar}
        </p>
      )}

      {/* Freshness indicator */}
      {!precomputeToday && priorities.length > 0 && (
        <div className="mb-3 px-3 py-1.5 border border-accent-lemon/20 text-[11px] font-body text-text-muted flex items-center gap-1.5">
          <Clock size={12} /> Priorities from yesterday — refresh for today's data
        </div>
      )}

      {loading && !priorities.length ? (
        <div className="flex items-center gap-2 text-[11px] font-body text-text-muted">
          <div className="spinner" />
          Loading priorities…
        </div>
      ) : (
        <ol className="space-y-3">
          {priorities.map((p) => (
            <li
              key={p.rank}
              className="flex gap-3 group -mx-2 px-2 py-2 rounded hover:bg-bg-elevated/50 transition-colors"
            >
              {/* Rank number */}
              <span className="flex-shrink-0 font-display text-2xl font-bold text-text-tertiary leading-none mt-0.5 w-7 text-right">
                {p.rank}
              </span>

              <div className="flex-1 min-w-0">
                {/* Label badge + urgency dot */}
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-body font-semibold uppercase tracking-[0.15em] border rounded ${labelColor[p.label] || 'text-text-secondary bg-bg-elevated border-border-soft'}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${urgencyDot[p.urgency] || urgencyDot.medium}`}
                      aria-label={urgencyLabel[p.urgency] || 'medium urgency'}
                      role="img"
                    />
                    {p.label}
                  </span>
                  <span className="text-[11px] font-body text-text-muted uppercase tracking-wider">
                    {p.urgency}
                  </span>
                </div>

                {/* Title */}
                <p className="font-display text-[15px] font-semibold text-text-primary leading-snug">
                  {p.title}
                </p>

                {/* Rationale */}
                <p className="font-body text-[12px] text-text-secondary mt-0.5 leading-relaxed">
                  {p.rationale}
                </p>

                {/* Thread count */}
                {p.threadCount > 0 && (
                  <p className="text-[11px] font-body text-text-muted mt-1">
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
