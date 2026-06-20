import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useMissionStore } from '@/stores/useMissionStore'
import { useViewStore, type ViewId } from '@/stores/useViewStore'
import type { Front, FrontKey, FrontItem } from '@shared/types'

/**
 * The five fronts, stacked in the order they need Billy today.
 * Quiet fronts collapse to one line; attention/critical expand.
 * Re-ranked hourly by the engine's slip_detect job.
 */

const FRONT_LABELS: Record<FrontKey, string> = {
  fund: 'Fund — Lemon Trust I',
  writing: 'Writing',
  shows: 'Shows',
  deals: 'Deals',
  you: 'You',
}

const FRONT_VIEWS: Record<FrontKey, ViewId> = {
  fund: 'fund',
  writing: 'writing',
  shows: 'projects',
  deals: 'deals',
  you: 'you',
}

function statusDot(status: Front['status']): string {
  if (status === 'critical') return 'bg-data-coral'
  if (status === 'attention') return 'bg-accent'
  return 'bg-line'
}

function itemDot(severity?: FrontItem['severity']): string {
  if (severity === 'critical') return 'bg-data-coral'
  if (severity === 'warn') return 'bg-accent'
  return 'bg-line'
}

function Band({ front }: { front: Front }) {
  const setView = useViewStore((s) => s.setView)
  const startOpen = front.status !== 'quiet'
  const [open, setOpen] = useState(startOpen)

  return (
    <div className="bg-surface rounded-lg shadow-card hover:shadow-hover transition-shadow overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-sunken/50 transition-colors"
        aria-expanded={open}
      >
        <span className="font-sans text-[13px] text-ink-3 tabular-nums w-4 num">
          {front.rank}
        </span>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(front.status)}`} />
        <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
          {FRONT_LABELS[front.key]}
        </span>
        <span className="font-sans text-[12px] text-ink-2 truncate flex-1">
          {front.headline}
        </span>
        {open ? (
          <ChevronDown size={14} className="text-ink-3 flex-shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-ink-3 flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-3 pt-0.5">
          <ul className="space-y-1.5">
            {front.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 pl-7">
                <span
                  className={`mt-[6px] w-1.5 h-1.5 rounded-full flex-shrink-0 ${itemDot(item.severity)}`}
                />
                <div className="min-w-0">
                  <span className="font-sans text-[12px] text-ink">{item.text}</span>
                  {item.detail && (
                    <span className="font-sans text-[11px] text-ink-3 ml-2">
                      {item.detail}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setView(FRONT_VIEWS[front.key])}
            className="mt-2 ml-7 text-[10px] font-sans uppercase tracking-[0.14em] text-accent hover:underline"
          >
            Open {FRONT_LABELS[front.key].split(' — ')[0]}
          </button>
        </div>
      )}
    </div>
  )
}

export function FrontBands() {
  const fronts = useMissionStore((s) => s.fronts)
  const runJob = useMissionStore((s) => s.runJob)

  if (!fronts || fronts.fronts.length === 0) {
    return (
      <section aria-label="Fronts" className="mb-5">
        <div className="ed-section-label mb-2">The Five Fronts</div>
        <div className="bg-surface rounded-lg shadow-card px-4 py-4">
          <p className="font-sans text-[12px] text-ink-2">
            The engine ranks your five fronts — Fund, Writing, Shows, Deals, You — every
            hour by what needs you most.
          </p>
          <button
            type="button"
            onClick={() => void runJob('slip_detect')}
            className="mt-2 text-[11px] font-sans uppercase tracking-[0.12em] text-accent hover:underline"
          >
            Rank now
          </button>
        </div>
      </section>
    )
  }

  const computedAgo = Math.round(
    (Date.now() - new Date(fronts.computedAt).getTime()) / 60_000,
  )

  return (
    <section aria-label="Fronts ranked by attention needed" className="mb-5">
      <div className="ed-section-label mb-2 flex items-baseline">
        <span>The Five Fronts</span>
        <span className="ml-auto text-[10px] font-sans text-ink-3 normal-case tracking-normal">
          ranked {computedAgo < 60 ? `${computedAgo}m` : `${Math.round(computedAgo / 60)}h`} ago
        </span>
      </div>
      <div className="space-y-2">
        {fronts.fronts.map((front) => (
          <Band key={front.key} front={front} />
        ))}
      </div>
    </section>
  )
}
