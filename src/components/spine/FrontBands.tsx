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
  if (status === 'critical') return 'bg-accent-coral'
  if (status === 'attention') return 'bg-accent-lemon'
  return 'bg-border-medium'
}

function itemDot(severity?: FrontItem['severity']): string {
  if (severity === 'critical') return 'bg-accent-coral'
  if (severity === 'warn') return 'bg-accent-lemon'
  return 'bg-border-medium'
}

function Band({ front }: { front: Front }) {
  const setView = useViewStore((s) => s.setView)
  const startOpen = front.status !== 'quiet'
  const [open, setOpen] = useState(startOpen)

  return (
    <div className="border border-border-soft rounded-lg bg-bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-bg-elevated/50 transition-colors"
        aria-expanded={open}
      >
        <span className="font-display text-[13px] text-text-muted tabular-nums w-4">
          {front.rank}
        </span>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(front.status)}`} />
        <span className="font-body text-[11px] font-semibold uppercase tracking-[0.14em] text-text-primary">
          {FRONT_LABELS[front.key]}
        </span>
        <span className="font-body text-[12px] text-text-secondary truncate flex-1">
          {front.headline}
        </span>
        {open ? (
          <ChevronDown size={14} className="text-text-muted flex-shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-text-muted flex-shrink-0" />
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
                  <span className="font-body text-[12px] text-text-primary">{item.text}</span>
                  {item.detail && (
                    <span className="font-body text-[11px] text-text-muted ml-2">
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
            className="mt-2 ml-7 text-[10px] font-body uppercase tracking-[0.14em] text-accent-lemon hover:underline"
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
        <div className="border border-border-soft rounded-lg bg-bg-surface px-4 py-4">
          <p className="font-body text-[12px] text-text-secondary">
            The engine ranks your five fronts — Fund, Writing, Shows, Deals, You — every
            hour by what needs you most.
          </p>
          <button
            type="button"
            onClick={() => void runJob('slip_detect')}
            className="mt-2 text-[11px] font-body uppercase tracking-[0.12em] text-accent-lemon hover:underline"
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
        <span className="ml-auto text-[10px] font-body text-text-muted normal-case tracking-normal">
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
