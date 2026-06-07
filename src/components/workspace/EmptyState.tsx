interface EmptyStateProps {
  title: string
  body?: string
  cta?: { label: string; onClick: () => void }
}

export function EmptyState({ title, body, cta }: EmptyStateProps) {
  return (
    <div className="bg-bg-surface border border-border-soft rounded-xl px-6 py-10 text-center">
      <p className="font-display text-lg italic text-text-secondary leading-tight">
        {title}
      </p>
      {body && (
        <p className="mt-2 text-xs font-body text-text-muted max-w-md mx-auto leading-relaxed">
          {body}
        </p>
      )}
      {cta && (
        <button
          type="button"
          onClick={cta.onClick}
          className="mt-4 text-[11px] font-body font-medium uppercase tracking-wider text-accent-lemon hover:opacity-80 transition-opacity"
        >
          {cta.label} →
        </button>
      )}
    </div>
  )
}
