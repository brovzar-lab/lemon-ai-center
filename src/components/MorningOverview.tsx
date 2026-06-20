import { useCallback } from 'react'
import { useBriefStore } from '@/stores/useBriefStore'
import { useUIStore } from '@/stores/useUIStore'
import { Cite } from './Cite'
import { ArrowRight } from 'lucide-react'
import type { Claim, Citation } from '@shared/types'

/** Render a claim's text with inline citation annotations */
function CitedText({ claim }: { claim: Claim }) {
  const parts = claim.text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/)

  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={i} className="italic text-ink-2">{part.slice(1, -1)}</em>
        }
        if (part.startsWith('_') && part.endsWith('_')) {
          return <span key={i} className="underline decoration-ink-3/40 underline-offset-2">{part.slice(1, -1)}</span>
        }
        return <span key={i}>{part}</span>
      })}
      {claim.citations.map((cite: Citation, j: number) => (
        <Cite key={j} source={cite}>
          <sup className="text-[10px] font-sans font-semibold text-data-coral ml-0.5 cursor-pointer">{j + 1}</sup>
        </Cite>
      ))}
    </span>
  )
}

export function MorningOverview() {
  const overview = useBriefStore((s) => s.overview)
  const degraded = useBriefStore((s) => s.degraded)
  const isStreaming = useBriefStore((s) => s.isStreaming)
  const soulNote = useBriefStore((s) => s.soulNote)
  const setActiveContext = useUIStore((s) => s.setActiveContext)
  const openDrawer = useUIStore((s) => s.openDrawer)

  const handleClaimClick = useCallback((claim: Claim, index: number) => {
    setActiveContext({ kind: 'claim', id: `claim-${index}` })
    openDrawer()
  }, [setActiveContext, openDrawer])

  if (!overview && !isStreaming) return null

  return (
    <section className="pb-4">
      {/* Section label — editorial ruled style */}
      <div className="ed-section-label mb-3">Today's Intelligence</div>

      {/* Sub-header */}
      <p className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-ink-3 mb-4">
        {overview?.length ?? 0} items compiled
      </p>

      {degraded && (
        <div className="mb-3 px-3 py-2 border border-accent/30 text-[11px] font-sans text-ink-2">
          ⚠ Structured brief unavailable — showing prose fallback.
        </div>
      )}

      {overview ? (
        <ol className="space-y-4">
          {overview.map((claim, i) => (
            <li
              key={i}
              className="flex gap-3 group cursor-pointer hover:bg-sunken/50 -mx-2 px-2 py-1.5 rounded transition-colors"
              onClick={() => handleClaimClick(claim, i)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClaimClick(claim, i) } }}
              aria-label={`Discuss briefing item ${i + 1}: ${claim.text.replace(/\*\*/g, '')}`}
            >
              {/* Plain number — newspaper style */}
              <span className="flex-shrink-0 font-sans text-lg font-semibold text-ink-3 leading-tight mt-0.5 w-6 text-right num">
                {i + 1}.
              </span>
              {/* Claim text — serif for editorial feel */}
              <div className="flex-1">
                <p className="font-sans text-[15px] text-ink leading-relaxed">
                  <CitedText claim={claim} />
                </p>
                <p className="text-[10px] font-sans text-data-coral/70 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  Click to discuss with Billy AI <ArrowRight size={12} className="inline" />
                </p>
              </div>
            </li>
          ))}
          {/* One for the soul — AI-generated, never hardcoded */}
          {soulNote && (
            <li className="flex gap-3 pt-2 border-t border-line">
              <span className="flex-shrink-0 font-display text-lg text-accent leading-tight mt-0.5 w-6 text-right">
                ★
              </span>
              <p className="font-display text-[15px] italic text-ink-2 leading-relaxed">
                {soulNote}
              </p>
            </li>
          )}
        </ol>
      ) : isStreaming ? (
        <div className="flex items-center gap-2 text-[11px] font-sans text-ink-3">
          <div className="spinner" />
          Generating overview…
        </div>
      ) : null}

      {/* Bottom rule */}
      <hr className="ed-rule mt-5" />
    </section>
  )
}
