import { useState } from 'react'

export interface EisenhowerItem {
  title: string
  description: string
  from: string
  emailRef: string
  category: 'DEAL' | 'LEGAL' | 'CREATIVE' | 'OPS' | 'FUND'
}

export interface EisenhowerMatrixData {
  urgent_important: EisenhowerItem[]
  important_not_urgent: EisenhowerItem[]
  urgent_not_important: EisenhowerItem[]
  neither: EisenhowerItem[]
}

const categoryColor: Record<string, string> = {
  DEAL: 'text-accent-lemon bg-accent-lemon/10',
  LEGAL: 'text-accent-blue bg-accent-blue/10',
  CREATIVE: 'text-accent-coral bg-accent-coral/10',
  OPS: 'text-accent-sage bg-accent-sage/10',
  FUND: 'text-text-secondary bg-bg-elevated',
}

interface QuadrantProps {
  label: string
  sublabel: string
  items: EisenhowerItem[]
  accentClass: string
  borderClass: string
}

function Quadrant({ label, sublabel, items, accentClass, borderClass }: QuadrantProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  return (
    <div className={`border ${borderClass} rounded-lg p-3`}>
      <div className="flex items-baseline gap-2 mb-2">
        <h4 className={`text-[11px] font-body font-bold uppercase tracking-[0.15em] ${accentClass}`}>
          {label}
        </h4>
        <span className="text-[9px] font-body text-text-muted">{sublabel}</span>
      </div>

      {items.length === 0 ? (
        <p className="text-[11px] font-body text-text-muted italic">—</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i}>
              <button
                onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                className="w-full text-left group"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-[12px] font-medium text-text-primary leading-snug truncate group-hover:text-accent-lemon transition-colors">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] font-body text-text-muted truncate">
                        {item.from}
                      </span>
                      <span
                        className={`inline-block px-1 py-0 text-[8px] font-body font-bold uppercase rounded ${categoryColor[item.category] || ''}`}
                      >
                        {item.category}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-text-muted flex-shrink-0">
                    {expandedIdx === i ? '▾' : '▸'}
                  </span>
                </div>
              </button>

              {expandedIdx === i && (
                <div className="mt-1.5 pl-2 border-l-2 border-border-soft">
                  <p className="font-body text-[11px] text-text-secondary leading-relaxed">
                    {item.description}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function EisenhowerMatrix({ data }: { data: EisenhowerMatrixData | null }) {
  if (!data) return null

  const totalItems =
    data.urgent_important.length +
    data.important_not_urgent.length +
    data.urgent_not_important.length +
    data.neither.length

  if (totalItems === 0) return null

  return (
    <section aria-label="Eisenhower priority matrix" className="pb-4">
      <div className="ed-section-label mb-3 flex items-center gap-2">
        <span className="text-text-muted">⬡</span>
        <span>Priority Matrix</span>
        <span className="text-[10px] font-body text-text-muted ml-auto">
          {totalItems} item{totalItems !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Quadrant
          label="Do First"
          sublabel="urgent + important"
          items={data.urgent_important}
          accentClass="text-accent-coral"
          borderClass="border-accent-coral/20"
        />
        <Quadrant
          label="Schedule"
          sublabel="important"
          items={data.important_not_urgent}
          accentClass="text-accent-blue"
          borderClass="border-accent-blue/20"
        />
        <Quadrant
          label="Delegate"
          sublabel="urgent"
          items={data.urgent_not_important}
          accentClass="text-accent-lemon"
          borderClass="border-accent-lemon/20"
        />
        <Quadrant
          label="Eliminate"
          sublabel="neither"
          items={data.neither}
          accentClass="text-text-muted"
          borderClass="border-border-soft"
        />
      </div>

      <hr className="ed-rule mt-4" />
    </section>
  )
}
