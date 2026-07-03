import { useEffect } from 'react'
import { ArrowUpRight, Clock, Hourglass, Send, Sparkles, TrendingUp } from 'lucide-react'
import { useSlateBriefingStore } from '@/stores/useSlateBriefingStore'
import type {
  SlateBriefingMovement,
  SlateBriefingNudge,
  SlateBriefingStale,
  SlateBriefingWaiting,
} from '@shared/types'

/**
 * The morning briefing (spec §5) — the five sections, rendered at the top
 * of the Dev Hell view on open. Generated fresh once a day; while the
 * brain works, the deterministic sections still show and the headline
 * fills in on the next poll.
 */
export function SlateBriefing() {
  const briefing = useSlateBriefingStore((s) => s.briefing)
  const status = useSlateBriefingStore((s) => s.status)
  const loaded = useSlateBriefingStore((s) => s.loaded)
  const refreshing = useSlateBriefingStore((s) => s.refreshing)
  const load = useSlateBriefingStore((s) => s.load)
  const refresh = useSlateBriefingStore((s) => s.refresh)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const generating = status === 'generating' && !briefing

  if (!loaded && !briefing) {
    return (
      <div className="bg-surface rounded-xl shadow-card p-6 flex items-center gap-3">
        <div className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        <span className="text-xs font-sans text-ink-3">Reading the slate…</span>
      </div>
    )
  }
  if (generating) {
    return (
      <div className="bg-surface rounded-xl shadow-card p-6 flex items-center gap-3">
        <div className="w-3.5 h-3.5 rounded-full border-2 border-data-violet border-t-transparent animate-spin" />
        <span className="text-xs font-sans text-ink-3">Assembling this morning&apos;s briefing…</span>
      </div>
    )
  }
  if (!briefing) return null

  const b = briefing
  const nothing =
    b.whatMoved.length === 0 &&
    b.goingStale.length === 0 &&
    b.waitingOn.length === 0 &&
    b.suggestedNudges.length === 0 &&
    b.todaysPushes.length === 0

  return (
    <div className="bg-surface rounded-xl shadow-card overflow-hidden">
      <header className="px-5 pt-5 pb-4 border-b border-line flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-sans font-bold uppercase tracking-[0.16em] text-ink-3">
            Morning Briefing · {b.date}
          </p>
          {b.headline && (
            <p className="mt-1.5 text-[15px] font-sans font-semibold text-ink leading-snug">{b.headline}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {status === 'generating' && (
            <span className="text-[9px] font-sans font-bold uppercase tracking-wider text-data-violet flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-data-violet animate-pulse" />
              Refreshing
            </span>
          )}
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void refresh()}
            className="text-[10px] font-sans font-medium uppercase tracking-wider px-2.5 py-1 rounded-md border border-line text-ink-2 hover:text-ink transition-colors disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {nothing ? (
        <p className="px-5 py-6 text-[13px] font-sans text-ink-3">
          {b.firstRun
            ? 'First briefing — nothing to compare against yet. Come back tomorrow and “What Moved” wakes up.'
            : 'Nothing moved, nothing stale, nobody waiting. The slate is current.'}
        </p>
      ) : (
        <div className="px-5 py-4 grid gap-5 md:grid-cols-2">
          <PushesSection pushes={b.todaysPushes} />
          <Section
            icon={<TrendingUp size={13} />}
            title="What Moved"
            count={b.whatMoved.length}
            empty={b.firstRun ? 'First briefing — no prior day to compare.' : 'Nothing since your last briefing.'}
          >
            {b.whatMoved.map((m, i) => (
              <MovementRow key={i} m={m} />
            ))}
          </Section>
          <Section
            icon={<Clock size={13} />}
            title="Going Stale"
            count={b.goingStale.length}
            empty="Nothing past its threshold."
          >
            {b.goingStale.map((s, i) => (
              <StaleRow key={i} s={s} />
            ))}
          </Section>
          <Section
            icon={<Hourglass size={13} />}
            title="Waiting On"
            count={b.waitingOn.length}
            empty="Nobody owes anything."
          >
            {b.waitingOn.map((w, i) => (
              <WaitingRow key={i} w={w} />
            ))}
          </Section>
          <Section
            icon={<Send size={13} />}
            title="Suggested Nudges"
            count={b.suggestedNudges.length}
            empty="No nudges needed today."
          >
            {b.suggestedNudges.map((n, i) => (
              <NudgeRow key={i} n={n} />
            ))}
          </Section>
        </div>
      )}

      {(b.upcomingDeadlines.length > 0 || b.pausedCheck.length > 0) && (
        <footer className="px-5 py-3 border-t border-line flex flex-wrap gap-x-4 gap-y-1.5">
          {b.upcomingDeadlines.map((d, i) => (
            <span
              key={`d${i}`}
              className={`text-[11px] font-sans ${d.daysUntil <= 7 ? 'text-data-coral' : 'text-ink-2'}`}
            >
              ⚑ {d.title}: {d.what} in {d.daysUntil}d
            </span>
          ))}
          {b.pausedCheck.map((p, i) => (
            <span key={`p${i}`} className="text-[11px] font-sans text-ink-3">
              ⏸ {p.title} paused {p.days}d — still on purpose?
            </span>
          ))}
        </footer>
      )}
    </div>
  )
}

function Section({
  icon,
  title,
  count,
  empty,
  children,
}: {
  icon: React.ReactNode
  title: string
  count: number
  empty: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h4 className="flex items-center gap-1.5 text-[11px] font-sans font-bold uppercase tracking-[0.12em] text-ink-2">
        <span className="text-ink-3">{icon}</span>
        {title}
        {count > 0 && <span className="text-ink-3 tabular-nums">· {count}</span>}
      </h4>
      {count === 0 ? (
        <p className="mt-1.5 text-[12px] font-sans text-ink-3">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">{children}</ul>
      )}
    </section>
  )
}

function PushesSection({ pushes }: { pushes: string[] }) {
  return (
    <section className="md:row-span-2 bg-sunken rounded-lg p-3.5">
      <h4 className="flex items-center gap-1.5 text-[11px] font-sans font-bold uppercase tracking-[0.12em] text-accent">
        <Sparkles size={13} />
        Today&apos;s Pushes
      </h4>
      {pushes.length === 0 ? (
        <p className="mt-2 text-[12px] font-sans text-ink-3">
          Nothing urgent to push today — the slate is steady.
        </p>
      ) : (
        <ol className="mt-2.5 space-y-2.5">
          {pushes.map((p, i) => (
            <li key={i} className="flex gap-2 text-[13px] font-sans text-ink leading-snug">
              <span className="text-accent font-semibold tabular-nums flex-shrink-0">{i + 1}.</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

const MOVE_LABEL: Record<SlateBriefingMovement['kind'], string> = {
  'new-project': 'New',
  stage: 'Stage',
  'new-draft': 'Draft',
  coverage: 'Coverage',
  touched: 'Touched',
  archived: 'Archived',
}

function MovementRow({ m }: { m: SlateBriefingMovement }) {
  return (
    <li className="flex items-baseline gap-2 min-w-0">
      <span className="text-[9px] font-sans font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sunken text-ink-3 flex-shrink-0">
        {MOVE_LABEL[m.kind]}
      </span>
      <span className="text-[12px] font-sans text-ink truncate">
        <span className="font-medium">{m.title}</span> <span className="text-ink-3">— {m.detail}</span>
      </span>
    </li>
  )
}

function StaleRow({ s }: { s: SlateBriefingStale }) {
  const tone = s.level === 'stale' ? 'text-data-coral' : 'text-data-violet'
  return (
    <li className="flex items-baseline gap-2 min-w-0">
      <span className={`text-[11px] font-mono tabular-nums flex-shrink-0 ${tone}`}>
        {s.days}/{s.threshold}d
      </span>
      <span className="text-[12px] font-sans text-ink truncate">
        <span className="font-medium">{s.title}</span>{' '}
        <span className="text-ink-3">
          · {s.stage} · {s.clock === 'waiting' ? 'out' : 'untouched'}
        </span>
      </span>
    </li>
  )
}

function WaitingRow({ w }: { w: SlateBriefingWaiting }) {
  return (
    <li className="text-[12px] font-sans text-ink min-w-0">
      <span className="font-medium">{w.who}</span>
      <span className="text-ink-3"> owes {w.what} </span>
      <span className="text-ink-2">· {w.title}</span>
      <span className="text-ink-3 tabular-nums"> · {w.days}d</span>
    </li>
  )
}

function NudgeRow({ n }: { n: SlateBriefingNudge }) {
  return (
    <li className="text-[12px] font-sans text-ink min-w-0 flex items-baseline gap-1.5">
      <ArrowUpRight size={12} className="text-ink-3 flex-shrink-0 translate-y-0.5" />
      <span>
        <span className="font-medium">{n.recipient}</span>
        {n.contact && <span className="text-ink-3"> ({n.contact})</span>}
        <span className="text-ink-3"> — {n.reason}</span>
      </span>
    </li>
  )
}
