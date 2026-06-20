import { ArrowRight } from 'lucide-react'

interface EmptyStateProps {
  title: string
  body?: string
  cta?: { label: string; onClick: () => void }
}

export function EmptyState({ title, body, cta }: EmptyStateProps) {
  return (
    <div className="bg-surface border border-line rounded-xl px-6 py-10 text-center">
      <p className="font-display text-lg italic text-ink-2 leading-tight">
        {title}
      </p>
      {body && (
        <p className="mt-2 text-xs font-sans text-ink-3 max-w-md mx-auto leading-relaxed">
          {body}
        </p>
      )}
      {cta && (
        <button
          type="button"
          onClick={cta.onClick}
          className="mt-4 text-[11px] font-sans font-medium uppercase tracking-wider text-accent hover:opacity-80 transition-opacity"
        >
          {cta.label} <ArrowRight size={12} className="inline" />
        </button>
      )}
    </div>
  )
}
