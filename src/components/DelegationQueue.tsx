import { ArrowRight } from 'lucide-react'

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
  high: 'text-data-coral bg-data-coral/10 border-data-coral/20',
  medium: 'text-accent bg-accent/10 border-accent/20',
  low: 'text-data-teal bg-data-teal/10 border-data-teal/20',
}

export function DelegationQueue({ delegations }: { delegations: DelegationExtracted[] }) {
  if (!delegations.length) return null

  return (
    <section aria-label="Delegation queue" className="pb-4">
      <div className="ed-section-label mb-3 flex items-center gap-2">
        <ArrowRight size={12} className="text-ink-3" />
        <span>To Delegate</span>
        <span className="text-[10px] font-sans text-ink-3 ml-auto">
          {delegations.length} item{delegations.length !== 1 ? 's' : ''}
        </span>
      </div>

      <ul className="space-y-3">
        {delegations.map((d, i) => (
          <li
            key={i}
            className="group -mx-2 px-2 py-2 rounded hover:bg-sunken/50 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              {/* Person + role */}
              <span className="font-sans text-[12px] font-semibold text-ink">
                {d.person}
              </span>
              {d.role && (
                <span className="text-[10px] font-sans text-ink-3">
                  · {d.role}
                </span>
              )}

              {/* Urgency badge */}
              <span
                className={`ml-auto inline-flex items-center px-1.5 py-0.5 text-[8px] font-sans font-bold uppercase tracking-wider rounded border ${urgencyStyle[d.urgency] || urgencyStyle.medium}`}
              >
                {d.urgency}
              </span>
            </div>

            {/* Task description */}
            <p className="font-sans text-[12px] text-ink-2 leading-relaxed">
              {d.task}
            </p>

            {/* Expected by date */}
            {d.expectedBy && (
              <p className="text-[10px] font-sans text-ink-3 mt-0.5">
                Expected by {d.expectedBy}
              </p>
            )}

            {/* Action — appears on hover */}
            <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="text-[10px] font-sans text-accent hover:text-data-coral transition-colors">
                Send to {d.person} <ArrowRight size={12} className="inline" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <hr className="ed-rule mt-4" />
    </section>
  )
}
