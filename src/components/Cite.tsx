import { useState } from 'react'
import type { Citation } from '@shared/types'
import { citationDeepLink } from '@shared/constants'

interface CiteProps {
  source: Citation
  children: React.ReactNode
}

const CONFIDENCE_DOT: Record<Citation['confidence'], string> = {
  high: 'bg-data-teal',
  med: 'bg-accent',
  low: 'bg-ink-3',
}

/**
 * Inline citation annotation.
 * - Clickable sources (gmail/calendar/notion) render as a <button> that opens a deep-link.
 * - Inferred sources render as a non-interactive <span>.
 * - Hover/focus shows a tooltip with snippet, source type, and confidence dot.
 */
export function Cite({ source, children }: CiteProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const link = citationDeepLink(source.sourceType, source.sourceId)
  const isClickable = link !== null

  const underlineClasses = [
    'relative inline border-b border-dotted transition-colors',
    isClickable
      ? 'border-data-coral/40 hover:border-data-coral cursor-pointer'
      : 'border-ink-3/30 cursor-default',
  ].join(' ')

  const tooltip = (
    <div
      role="tooltip"
      className={[
        'absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-3 py-2 rounded-lg',
        'bg-surface border border-line shadow-lg',
        'text-[11px] font-sans text-ink-2',
        'transition-opacity duration-150',
        showTooltip ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      ].join(' ')}
    >
      {/* Confidence dot + source type */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${CONFIDENCE_DOT[source.confidence]}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
          {source.sourceType}
        </span>
      </div>
      {/* Snippet */}
      {source.snippet && (
        <p className="text-ink-3 leading-snug">{source.snippet}</p>
      )}
    </div>
  )

  if (isClickable) {
    return (
      <button
        type="button"
        className={`${underlineClasses} appearance-none bg-transparent p-0 m-0 font-inherit text-inherit text-left`}
        onClick={() => window.open(link, '_blank', 'noopener')}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        title={`Open ${source.sourceType} source`}
      >
        {children}
        {tooltip}
      </button>
    )
  }

  return (
    <span
      className={underlineClasses}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {children}
      {tooltip}
    </span>
  )
}
