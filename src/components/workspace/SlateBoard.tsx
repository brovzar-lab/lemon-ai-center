import { useMemo } from 'react'
import { assessStaleness } from '@shared/slateStaleness'
import type { StalenessAssessment } from '@shared/slateStaleness'
import { SLATE_FILM_STAGES, SLATE_SERIES_STAGES } from '@shared/types'
import type { SlateProject, SlateStage } from '@shared/types'

/**
 * The slate board — the visual pipeline (milestone 3). One lane per format
 * (film / series, since their stages differ), a fixed column per stage,
 * read-only cards carrying priority, staleness heat, waiting-on and the
 * external badge. Stage changes happen on disk (project.yaml); the board
 * reflects, it never edits. Dead projects live in _archive, not here.
 */

const STAGE_LABELS: Record<SlateStage, string> = {
  idea: 'Idea',
  concept: 'Concept',
  treatment: 'Treatment',
  outline: 'Outline',
  draft1: 'Draft 1',
  rewrites: 'Rewrites',
  polish: 'Polish',
  'market-ready': 'Market-Ready',
  bible: 'Bible',
  'pilot-outline': 'Pilot Outline',
  'pilot-draft': 'Pilot Draft',
  'season-arc': 'Season Arc',
}

const PRIORITY_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 }

interface Assessed {
  project: SlateProject
  staleness: StalenessAssessment
}

export function SlateBoard({ projects }: { projects: SlateProject[] }) {
  const now = useMemo(() => new Date(), [])
  const lanes = useMemo(() => {
    const live = projects.filter((p) => p.status !== 'dead')
    const assess = (p: SlateProject): Assessed => ({ project: p, staleness: assessStaleness(p, now) })
    return {
      film: live.filter((p) => p.format === 'film').map(assess),
      series: live.filter((p) => p.format === 'series').map(assess),
    }
  }, [projects, now])

  return (
    <div className="space-y-6">
      {lanes.film.length > 0 && <Lane title="Film" stages={SLATE_FILM_STAGES} items={lanes.film} />}
      {lanes.series.length > 0 && (
        <Lane title="Series" stages={SLATE_SERIES_STAGES} items={lanes.series} />
      )}
    </div>
  )
}

function Lane({
  title,
  stages,
  items,
}: {
  title: string
  stages: readonly SlateStage[]
  items: Assessed[]
}) {
  return (
    <section aria-label={`${title} lane`}>
      <h3 className="text-[11px] font-sans font-bold uppercase tracking-[0.14em] text-ink-2">
        {title}
        <span className="ml-2 text-ink-3 font-medium tabular-nums">{items.length}</span>
      </h3>
      <div className="mt-2 overflow-x-auto pb-2 -mx-1 px-1">
        <div className="grid grid-flow-col auto-cols-[minmax(172px,1fr)] gap-2 min-w-max lg:min-w-0">
          {stages.map((stage) => (
            <StageColumn
              key={stage}
              stage={stage}
              items={items
                .filter((i) => i.project.stage === stage)
                .sort(
                  (a, b) =>
                    (PRIORITY_ORDER[a.project.priority ?? ''] ?? 3) -
                      (PRIORITY_ORDER[b.project.priority ?? ''] ?? 3) ||
                    b.staleness.ratio - a.staleness.ratio,
                )}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function StageColumn({ stage, items }: { stage: SlateStage; items: Assessed[] }) {
  return (
    <div className="rounded-lg bg-sunken/60 px-1.5 pt-1.5 pb-2 min-h-[72px]">
      <div className="flex items-baseline justify-between px-1 pb-1.5">
        <span className="text-[9px] font-sans font-bold uppercase tracking-[0.12em] text-ink-3">
          {STAGE_LABELS[stage]}
        </span>
        {items.length > 0 && (
          <span className="text-[9px] font-sans tabular-nums text-ink-3">{items.length}</span>
        )}
      </div>
      <div className="space-y-1.5">
        {items.map(({ project, staleness }) => (
          <SlateCard key={project.slug} project={project} staleness={staleness} />
        ))}
      </div>
    </div>
  )
}

function HeatChip({ staleness }: { staleness: StalenessAssessment }) {
  if (staleness.excluded) return null
  const label = `${staleness.days}d`
  if (staleness.level === 'stale') {
    return (
      <span
        className="text-[9px] font-sans font-bold px-1.5 py-0.5 rounded bg-data-coral/15 text-data-coral tabular-nums"
        title={`Stale: ${staleness.days} days on a ${staleness.threshold}-day clock (${staleness.clock})`}
      >
        stale · {label}
      </span>
    )
  }
  if (staleness.level === 'aging') {
    return (
      <span
        className="text-[9px] font-sans font-bold px-1.5 py-0.5 rounded bg-data-violet/15 text-data-violet tabular-nums"
        title={`Aging: ${staleness.days} of ${staleness.threshold} days (${staleness.clock})`}
      >
        {label}
      </span>
    )
  }
  return (
    <span
      className="text-[9px] font-sans tabular-nums text-ink-3"
      title={`${staleness.days} of ${staleness.threshold} days (${staleness.clock})`}
    >
      {label}
    </span>
  )
}

function SlateCard({
  project: p,
  staleness,
}: {
  project: SlateProject
  staleness: StalenessAssessment
}) {
  const paused = p.status === 'paused'
  return (
    <article
      className={`bg-surface rounded-lg shadow-card px-2.5 py-2 space-y-1 ${paused ? 'opacity-60' : ''}`}
      aria-label={p.title}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="text-[12px] font-sans font-semibold leading-snug text-ink min-w-0">
          {p.title}
        </span>
        {p.priority && (
          <span className="text-[9px] font-sans font-bold px-1 py-0.5 rounded bg-accent/15 text-accent flex-shrink-0">
            {p.priority}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {p.origin === 'external' && (
          <span className="text-[8px] font-sans font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-data-coral/15 text-data-coral">
            Ext
          </span>
        )}
        {paused && (
          <span className="text-[8px] font-sans font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-sunken text-ink-3">
            Paused
          </span>
        )}
        {p.current_draft && (
          <span className="text-[8px] font-sans font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-data-teal/15 text-data-teal tabular-nums">
            v{String(p.current_draft.version).padStart(2, '0')}
          </span>
        )}
        <HeatChip staleness={staleness} />
      </div>

      {p.waiting_on && (
        <p
          className="text-[10px] font-sans italic text-ink-3 leading-snug truncate"
          title={`Waiting on ${p.waiting_on.who} — ${p.waiting_on.what} (since ${p.waiting_on.since})`}
        >
          Waiting on {p.waiting_on.who}
          {staleness.clock === 'waiting' && !staleness.excluded ? ` · ${staleness.days}d` : ''}
        </p>
      )}
    </article>
  )
}
