export interface DelegationExtracted {
  person: string
  role: string
  task: string
  source: string
  emailRef: string
  expectedBy: string | null
  urgency: 'high' | 'medium' | 'low'
}

const urgencyStyle: Record<string, string> = {
  high: 'text-accent-coral bg-accent-coral/10 border-accent-coral/20',
  medium: 'text-accent-lemon bg-accent-lemon/10 border-accent-lemon/20',
  low: 'text-accent-sage bg-accent-sage/10 border-accent-sage/20',
}

export function DelegationQueue({ delegations }: { delegations: DelegationExtracted[] }) {
  if (!delegations.length) return null

  return (
    <section aria-label="Delegation queue" className="pb-4">
      <div className="ed-section-label mb-3 flex items-center gap-2">
        <span className="text-text-muted">→</span>
        <span>To Delegate</span>
        <span className="text-[10px] font-body text-text-muted ml-auto">
          {delegations.length} item{delegations.length !== 1 ? 's' : ''}
        </span>
      </div>

      <ul className="space-y-3">
        {delegations.map((d, i) => (
          <li
            key={i}
            className="group -mx-2 px-2 py-2 rounded hover:bg-bg-elevated/50 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              {/* Person + role */}
              <span className="font-body text-[12px] font-semibold text-text-primary">
                {d.person}
              </span>
              {d.role && (
                <span className="text-[10px] font-body text-text-muted">
                  · {d.role}
                </span>
              )}

              {/* Urgency badge */}
              <span
                className={`ml-auto inline-flex items-center px-1.5 py-0.5 text-[8px] font-body font-bold uppercase tracking-wider rounded border ${urgencyStyle[d.urgency] || urgencyStyle.medium}`}
              >
                {d.urgency}
              </span>
            </div>

            {/* Task description */}
            <p className="font-body text-[12px] text-text-secondary leading-relaxed">
              {d.task}
            </p>

            {/* Expected by date */}
            {d.expectedBy && (
              <p className="text-[10px] font-body text-text-muted mt-0.5">
                Expected by {d.expectedBy}
              </p>
            )}

            {/* Action — appears on hover */}
            <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="text-[10px] font-body text-accent-lemon hover:text-accent-coral transition-colors">
                Send to {d.person} →
              </button>
            </div>
          </li>
        ))}
      </ul>

      <hr className="ed-rule mt-4" />
    </section>
  )
}
