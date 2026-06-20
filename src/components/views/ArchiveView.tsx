import { useEffect } from 'react'
import { useArchiveStore } from '@/stores/lemon/useArchiveStore'
import { EmptyState } from '@/components/workspace/EmptyState'
import type { LemonArchiveItem } from '@shared/types'

export function ArchiveView() {
  const items = useArchiveStore((s) => s.items)
  const subscribe = useArchiveStore((s) => s.subscribe)
  const restore = useArchiveStore((s) => s.restore)
  const configured = useArchiveStore((s) => s.configured)
  const loading = useArchiveStore((s) => s.loading)

  useEffect(() => subscribe(), [subscribe])

  if (!configured) {
    return (
      <EmptyState
        title="LEMON workspace not connected"
        body="Set VITE_LEMON_FIREBASE_* env vars to load the archive."
      />
    )
  }

  return (
    <section className="space-y-4 animate-in">
      <header>
        <h2 className="font-display text-2xl font-semibold text-ink leading-tight">
          Archive
        </h2>
        <p className="text-xs font-sans text-ink-3 mt-1">
          Items snoozed or dismissed from prior briefings. Restore to bring them back.
        </p>
      </header>

      {loading && items.length === 0 ? (
        <div className="bg-surface border border-line rounded-xl p-10 text-center">
          <div className="w-4 h-4 mx-auto rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Parking lot is empty"
          body="Things you dismiss from your morning briefing land here for safekeeping."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <ArchiveRow key={item.id} item={item} onRestore={() => restore(item.id)} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ArchiveRow({
  item,
  onRestore,
}: {
  item: LemonArchiveItem
  onRestore: () => void
}) {
  const archivedAt = parseTimestamp(item.archived_at)
  return (
    <li className="bg-surface border border-line rounded-xl px-4 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-sans text-ink leading-snug">
          {item.title ?? '(no title)'}
        </p>
        {item.description && (
          <p className="text-[11px] font-sans text-ink-3 mt-1 line-clamp-2 leading-snug">
            {item.description}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-2 text-[10px] font-sans text-ink-3 flex-wrap">
          {item.tag && (
            <span className="inline-block px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold bg-sunken text-ink-2">
              {item.tag}
            </span>
          )}
          {item.from && <span>{item.from}</span>}
          {item.briefing_date && (
            <span className="font-mono text-ink-3">{item.briefing_date}</span>
          )}
          {archivedAt && (
            <span className="font-mono">
              {archivedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRestore}
        className="text-[10px] font-sans font-medium uppercase tracking-wider px-2.5 py-1 rounded-md border border-line hover:border-line text-ink-2 hover:text-ink transition-colors flex-shrink-0"
      >
        Restore
      </button>
    </li>
  )
}

function parseTimestamp(value: unknown): Date | null {
  if (!value) return null
  if (typeof value === 'string') {
    const d = new Date(value)
    return Number.isFinite(d.getTime()) ? d : null
  }
  if (typeof value === 'object' && value !== null && 'seconds' in (value as { seconds?: number })) {
    const seconds = (value as { seconds: number }).seconds
    if (Number.isFinite(seconds)) return new Date(seconds * 1000)
  }
  return null
}
