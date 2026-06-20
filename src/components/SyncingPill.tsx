import { useBriefStore } from '@/stores/useBriefStore'

export function SyncingPill() {
  const isStreaming = useBriefStore((s) => s.isStreaming)
  if (!isStreaming) return null

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label="Syncing data"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sunken border border-line text-xs text-ink-3 font-sans"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
      Syncing
    </span>
  )
}
