import { useEffect, useMemo, useState } from 'react'
import { useMemoryStore } from '@/stores/lemon/useMemoryStore'
import { EmptyState } from '@/components/workspace/EmptyState'
import type { LemonMemoryEntry } from '@shared/types'

type FilterId = 'all' | 'active' | 'inactive' | 'auto' | 'manual'

export function MemoryView() {
  const entries = useMemoryStore((s) => s.entries)
  const subscribe = useMemoryStore((s) => s.subscribe)
  const add = useMemoryStore((s) => s.add)
  const setActive = useMemoryStore((s) => s.setActive)
  const remove = useMemoryStore((s) => s.remove)
  const loading = useMemoryStore((s) => s.loading)

  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState<FilterId>('all')

  useEffect(() => subscribe(), [subscribe])

  const filtered = useMemo(() => {
    switch (filter) {
      case 'active':
        return entries.filter((e) => e.active)
      case 'inactive':
        return entries.filter((e) => !e.active)
      case 'auto':
        return entries.filter((e) => e.source === 'auto')
      case 'manual':
        return entries.filter((e) => e.source === 'manual')
      default:
        return entries
    }
  }, [entries, filter])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    await add(text, 'manual')
    setDraft('')
  }

  const filters: Array<{ id: FilterId; label: string; count: number }> = [
    { id: 'all', label: 'All', count: entries.length },
    { id: 'active', label: 'Active', count: entries.filter((e) => e.active).length },
    { id: 'inactive', label: 'Inactive', count: entries.filter((e) => !e.active).length },
    { id: 'auto', label: 'AI', count: entries.filter((e) => e.source === 'auto').length },
    { id: 'manual', label: 'Manual', count: entries.filter((e) => e.source === 'manual').length },
  ]

  return (
    <section className="space-y-4 animate-in">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink leading-tight">
            Memory
          </h2>
          <p className="text-xs font-sans text-ink-3 mt-1">
            Persistent rules and facts the AI uses to filter noise and personalize briefings.
          </p>
        </div>
      </header>

      <form
        onSubmit={handleAdd}
        className="bg-surface border border-line rounded-xl p-4"
      >
        <span className="block text-[10px] font-sans font-bold uppercase tracking-wider text-ink-3 mb-2">
          Teach the AI
        </span>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Lara handles Warner Music licensing — never ping me on it"
            className="flex-1 bg-bg border border-line text-ink text-sm font-sans rounded-md px-3 py-2 outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="text-[11px] font-sans font-semibold uppercase tracking-wider bg-accent text-bg px-4 py-2 rounded-md hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </form>

      <div className="flex items-center gap-1 flex-wrap">
        {filters.map((f) => {
          const active = filter === f.id
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={[
                'text-[10px] font-sans font-medium uppercase tracking-wider px-2.5 py-1 rounded-md transition-colors',
                active
                  ? 'bg-sunken text-ink border border-line'
                  : 'text-ink-3 hover:text-ink-2 border border-transparent hover:border-line',
              ].join(' ')}
            >
              {f.label} <span className="ml-1 text-ink-3 tabular-nums">{f.count}</span>
            </button>
          )
        })}
      </div>

      {loading && entries.length === 0 ? (
        <div className="bg-surface border border-line rounded-xl p-10 text-center">
          <div className="w-4 h-4 mx-auto rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No memories yet"
          body="Type an instruction above and the AI will respect it across briefings, drafts, and skills."
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((entry) => (
            <MemoryRow
              key={entry.id}
              entry={entry}
              onToggle={() => setActive(entry.id, !entry.active)}
              onRemove={() => remove(entry.id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function MemoryRow({
  entry,
  onToggle,
  onRemove,
}: {
  entry: LemonMemoryEntry
  onToggle: () => void
  onRemove: () => void
}) {
  const learnedAt = entry.learned_at
    ? new Date(
        // Firestore timestamps come through as serialized objects; the
        // value here may be a Firestore Timestamp or an ISO string.
        typeof entry.learned_at === 'string'
          ? entry.learned_at
          : (entry.learned_at as unknown as { seconds: number }).seconds * 1000,
      )
    : null

  return (
    <li
      className={[
        'bg-surface border border-line rounded-xl px-4 py-3 flex items-start gap-3 transition-opacity',
        entry.active ? 'opacity-100' : 'opacity-50',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={entry.active ? 'Deactivate memory' : 'Activate memory'}
        aria-pressed={entry.active}
        className={[
          'mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-colors border',
          entry.active
            ? 'bg-data-teal/20 border-data-teal text-data-teal'
            : 'border-line text-transparent hover:border-accent',
        ].join(' ')}
      >
        {entry.active && <span className="text-[10px] leading-none">✓</span>}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-sans text-ink leading-snug">{entry.text}</p>
        <div className="mt-1.5 flex items-center gap-2 text-[10px] font-sans text-ink-3">
          <span
            className={[
              'inline-block px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold',
              entry.source === 'auto'
                ? 'bg-data-blue/15 text-data-blue'
                : 'bg-sunken text-ink-2',
            ].join(' ')}
          >
            {entry.source === 'auto' ? 'AI learned' : 'Manual'}
          </span>
          {learnedAt && (
            <span className="font-mono">
              {learnedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Delete memory"
        className="text-ink-3 hover:text-data-coral transition-colors text-sm leading-none"
      >
        ×
      </button>
    </li>
  )
}
