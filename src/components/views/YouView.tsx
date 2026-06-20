import { useMemo, useState } from 'react'
import { useTrackersStore } from '@/stores/useTrackersStore'
import { useMissionStore } from '@/stores/useMissionStore'
import type {
  AIVenture,
  BurnoutDoc,
  FrontKey,
  QuoteSnapshot,
  WatchlistItem,
  WeeklyReview,
} from '@shared/types'

const FRONT_LABELS: Record<FrontKey, string> = {
  fund: 'Fund',
  writing: 'Writing',
  shows: 'Shows',
  deals: 'Deals',
  you: 'You',
}

function burnoutColor(score: number): string {
  if (score < 45) return 'var(--data-teal)'
  if (score < 65) return 'var(--accent)'
  return 'var(--data-coral)'
}

function formatUSD(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function YouView() {
  const ventures = useTrackersStore((s) => s.ventures)
  const watchlist = useTrackersStore((s) => s.watchlist)
  const createVenture = useTrackersStore((s) => s.createVenture)
  const updateVenture = useTrackersStore((s) => s.updateVenture)
  const removeVenture = useTrackersStore((s) => s.removeVenture)
  const addTicker = useTrackersStore((s) => s.addTicker)
  const removeTicker = useTrackersStore((s) => s.removeTicker)
  const burnout = useMissionStore((s) => s.burnout)
  const quotes = useMissionStore((s) => s.quotes)
  const weeklyReview = useMissionStore((s) => s.weeklyReview)

  return (
    <section className="space-y-6 animate-in">
      <header>
        <h2 className="font-display text-2xl font-semibold text-ink leading-tight">
          You
        </h2>
        <p className="text-xs font-sans text-ink-3 mt-1">
          The operator behind the operation — energy, side bets, and the portfolio
        </p>
      </header>

      {weeklyReview && <WeeklyReviewCard review={weeklyReview} />}

      <GaugeSection burnout={burnout} />

      <VenturesSection
        ventures={ventures}
        onCreate={createVenture}
        onUpdate={updateVenture}
        onRemove={removeVenture}
      />

      <WatchlistSection
        watchlist={watchlist}
        quotes={quotes?.quotes ?? []}
        computedAt={quotes?.computedAt}
        onAdd={addTicker}
        onRemove={removeTicker}
      />

      <style>{`
        .form-input {
          width: 100%;
          background: var(--bg);
          border: 1px solid var(--line);
          color: var(--ink);
          font-size: 12px;
          font-family: var(--font-body);
          padding: 8px 10px;
          border-radius: 8px;
          outline: none;
          transition: border-color 150ms;
        }
        .form-input:focus {
          border-color: var(--accent);
        }
      `}</style>
    </section>
  )
}

/* ─── Weekly review ─── */

function WeeklyReviewCard({ review }: { review: WeeklyReview }) {
  const [open, setOpen] = useState(false)
  const maxHours = Math.max(
    1,
    ...Object.values(review.attentionByFront).map((h) => h ?? 0),
  )

  return (
    <article className="bg-surface border border-line rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-sunken transition-colors"
      >
        <span className="font-display text-base font-semibold text-ink">
          Weekly Review
          <span className="text-ink-3 font-normal"> — week of {review.weekOf}</span>
        </span>
        <span className="text-[11px] font-sans uppercase tracking-wider text-ink-3">
          {open ? 'Collapse' : 'Expand'}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-line pt-4">
          <p className="text-[13px] font-sans text-ink-2 leading-relaxed">
            {review.summary}
          </p>

          {/* Attention by front */}
          <div>
            <p className="ed-section-label mb-2">Where the hours went</p>
            <div className="space-y-1.5">
              {(Object.entries(review.attentionByFront) as [FrontKey, number][])
                .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                .map(([front, hours]) => (
                  <div key={front} className="flex items-center gap-2">
                    <span className="w-16 text-[10px] font-sans font-bold uppercase tracking-wider text-ink-3">
                      {FRONT_LABELS[front] ?? front}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full"
                        style={{ width: `${((hours ?? 0) / maxHours) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-[10px] font-sans tabular-nums text-ink-3">
                      {(hours ?? 0).toFixed(1)}h
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {review.stalls.length > 0 && (
            <div>
              <p className="ed-section-label mb-2">Stalls</p>
              <ul className="space-y-1">
                {review.stalls.map((s, i) => (
                  <li key={i} className="text-[12px] font-sans text-ink-2 leading-snug">
                    · {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {review.risks.length > 0 && (
            <div>
              <p className="ed-section-label mb-2">Risks</p>
              <ul className="space-y-1">
                {review.risks.map((r, i) => (
                  <li key={i} className="text-[12px] font-sans text-data-coral leading-snug">
                    · {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-accent-soft rounded-lg px-3 py-2.5">
            <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-on-soft mb-1">
              The one recommendation
            </p>
            <p className="text-[13px] font-sans text-ink leading-relaxed">
              {review.recommendation}
            </p>
          </div>
        </div>
      )}
    </article>
  )
}

/* ─── The Gauge ─── */

function GaugeSection({ burnout }: { burnout: BurnoutDoc | null }) {
  return (
    <div className="space-y-3">
      <p className="ed-section-label">The Gauge</p>
      {!burnout ? (
        <div className="bg-surface border border-line rounded-xl px-6 py-8 text-center">
          <p className="font-display text-lg italic text-ink-2 leading-tight">
            No reading yet
          </p>
          <p className="mt-2 text-xs font-sans text-ink-3 max-w-md mx-auto leading-relaxed">
            The engine computes this nightly at 23:00 — meeting load, late-night email, days
            since a break, and writing time roll into one number.
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-xl p-5 flex flex-wrap items-center gap-6">
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-display text-5xl font-semibold tabular-nums leading-none"
              style={{ color: burnoutColor(burnout.score) }}
            >
              {Math.round(burnout.score)}
            </span>
            <span className="text-sm font-sans text-ink-3">/100</span>
          </div>

          {/* 7-day trend */}
          {burnout.trend.length > 0 && (
            <div
              className="flex items-end gap-1 h-10"
              role="img"
              aria-label={`Burnout trend, last ${burnout.trend.length} days`}
              title="Last 7 days, oldest first"
            >
              {burnout.trend.map((v, i) => (
                <span
                  key={i}
                  className="w-1.5 rounded-sm"
                  style={{
                    height: `${Math.max(8, v)}%`,
                    background: burnoutColor(v),
                    opacity: i === burnout.trend.length - 1 ? 1 : 0.5,
                  }}
                />
              ))}
            </div>
          )}

          <p className="text-[11px] font-sans text-ink-3 leading-relaxed flex-1 min-w-[200px]">
            {burnout.meetingHours.toFixed(1)}h in meetings · {burnout.lateNightEmails} late-night
            email{burnout.lateNightEmails === 1 ? '' : 's'} · {burnout.daysSinceBreak} day
            {burnout.daysSinceBreak === 1 ? '' : 's'} since a break
            {burnout.writingMinutes != null && ` · ${burnout.writingMinutes} min writing`}
          </p>
        </div>
      )}
    </div>
  )
}

/* ─── AI Ventures ─── */

function VenturesSection({
  ventures,
  onCreate,
  onUpdate,
  onRemove,
}: {
  ventures: AIVenture[]
  onCreate: (input: Omit<AIVenture, 'id'>) => Promise<void>
  onUpdate: (id: string, patch: Partial<AIVenture>) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [stage, setStage] = useState('')

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    // Firestore rejects `undefined` — only include stage when set.
    await onCreate({ name: name.trim(), ...(stage.trim() ? { stage: stage.trim() } : {}) })
    setName('')
    setStage('')
    setAdding(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="ed-section-label flex-1">AI Ventures</p>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-[11px] font-sans font-medium uppercase tracking-wider text-ink-3 hover:text-ink transition-colors whitespace-nowrap"
        >
          {adding ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="flex items-center gap-2 flex-wrap">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Venture name"
            className="form-input !w-56"
            required
          />
          <input
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            placeholder="Stage — prototype, live…"
            className="form-input !w-48"
          />
          <button
            type="submit"
            className="text-[11px] font-sans font-semibold uppercase tracking-wider bg-accent text-bg px-3 py-1.5 rounded-md hover:brightness-110 transition-all"
          >
            Add
          </button>
        </form>
      )}

      {ventures.length === 0 && !adding ? (
        <div className="bg-surface border border-line rounded-xl px-6 py-8 text-center">
          <p className="font-display text-lg italic text-ink-2 leading-tight">
            No side bets on the board
          </p>
          <p className="mt-2 text-xs font-sans text-ink-3 max-w-md mx-auto leading-relaxed">
            Track AI ventures here — the engine watches for stalls and folds them into your
            fronts once they exist.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {ventures.map((v) => (
            <VentureCard key={v.id} venture={v} onUpdate={onUpdate} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  )
}

function VentureCard({
  venture,
  onUpdate,
  onRemove,
}: {
  venture: AIVenture
  onUpdate: (id: string, patch: Partial<AIVenture>) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(venture.name)
  const [stage, setStage] = useState(venture.stage ?? '')
  const [nextAction, setNextAction] = useState(venture.nextAction ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save() {
    // Empty strings clear fields — Firestore rejects `undefined`.
    await onUpdate(venture.id, {
      name: name.trim() || venture.name,
      stage: stage.trim(),
      nextAction: nextAction.trim(),
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <article className="bg-surface border border-line rounded-xl p-4 space-y-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="form-input"
          placeholder="Name"
        />
        <input
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="form-input"
          placeholder="Stage"
        />
        <input
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          className="form-input"
          placeholder="Next action"
        />
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-[11px] font-sans text-ink-3 hover:text-ink transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="text-[11px] font-sans font-semibold uppercase tracking-wider bg-accent text-bg px-3 py-1.5 rounded-md hover:brightness-110 transition-all"
          >
            Save
          </button>
        </div>
      </article>
    )
  }

  return (
    <article className="group bg-surface border border-line hover:border-line rounded-xl p-4 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-sans font-semibold text-ink leading-tight">
          {venture.name}
        </h3>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[10px] font-sans uppercase tracking-wider text-ink-3 hover:text-ink"
          >
            Edit
          </button>
          {confirmDelete ? (
            <button
              type="button"
              onClick={() => onRemove(venture.id)}
              className="text-[10px] font-sans uppercase tracking-wider text-error"
            >
              Sure?
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label={`Remove ${venture.name}`}
              className="text-ink-3 hover:text-error leading-none"
            >
              ×
            </button>
          )}
        </div>
      </div>
      {venture.stage && (
        <span className="inline-block text-[10px] font-sans px-1.5 py-0.5 rounded bg-sunken text-ink-3 mt-1.5">
          {venture.stage}
        </span>
      )}
      {venture.nextAction && (
        <p className="text-[11px] font-sans italic mt-2 text-ink-3">
          → {venture.nextAction}
        </p>
      )}
    </article>
  )
}

/* ─── Watchlist ─── */

function WatchlistSection({
  watchlist,
  quotes,
  computedAt,
  onAdd,
  onRemove,
}: {
  watchlist: WatchlistItem[]
  quotes: QuoteSnapshot[]
  computedAt?: string
  onAdd: (ticker: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [ticker, setTicker] = useState('')

  const quoteByTicker = useMemo(() => {
    const map = new Map<string, QuoteSnapshot>()
    for (const q of quotes) map.set(q.ticker.toUpperCase(), q)
    return map
  }, [quotes])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const t = ticker.trim()
    if (!t) return
    await onAdd(t)
    setTicker('')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="ed-section-label flex-1">Watchlist</p>
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="NVDA"
            aria-label="Add ticker"
            className="form-input !w-24 uppercase"
          />
          <button
            type="submit"
            className="text-[11px] font-sans font-medium uppercase tracking-wider px-3 py-1.5 rounded-md border border-line hover:border-line text-ink-2 hover:text-ink transition-colors"
          >
            Add
          </button>
        </form>
      </div>

      {watchlist.length === 0 ? (
        <div className="bg-surface border border-line rounded-xl px-6 py-8 text-center">
          <p className="font-display text-lg italic text-ink-2 leading-tight">
            Nothing on watch
          </p>
          <p className="mt-2 text-xs font-sans text-ink-3 max-w-md mx-auto leading-relaxed">
            Add tickers above — set FINNHUB_API_KEY on the server and the engine pulls live
            quotes each morning. The list works manually without it.
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line">
                <Th>Ticker</Th>
                <Th align="right">Price</Th>
                <Th align="right">Change</Th>
                <Th align="right">Position</Th>
                <th className="w-8" aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {watchlist.map((item) => {
                const q = quoteByTicker.get(item.ticker.toUpperCase())
                const up = q != null && q.change >= 0
                const changeColor = up ? 'text-data-teal' : 'text-data-coral'
                const positionValue =
                  q != null && item.shares != null ? item.shares * q.price : null
                return (
                  <tr
                    key={item.id}
                    className="group border-b border-line last:border-b-0 hover:bg-sunken transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <span className="text-[12px] font-mono font-semibold text-ink">
                        {item.ticker.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[12px] font-mono tabular-nums text-ink">
                      {q ? formatUSD(q.price) : <span className="text-ink-3">—</span>}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right text-[12px] font-mono tabular-nums ${q ? changeColor : 'text-ink-3'}`}
                    >
                      {q
                        ? `${up ? '+' : '−'}${formatUSD(Math.abs(q.change))} (${up ? '+' : '−'}${Math.abs(q.changePct).toFixed(2)}%)`
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[11px] font-sans tabular-nums text-ink-3">
                      {item.shares != null ? (
                        <>
                          {item.shares} sh
                          {item.costBasisUSD != null && ` @ ${formatUSD(item.costBasisUSD)}`}
                          {positionValue != null && (
                            <span className="text-ink-2 font-medium">
                              {' '}
                              · {formatUSD(positionValue)}
                            </span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onRemove(item.id)}
                        aria-label={`Remove ${item.ticker}`}
                        className="opacity-0 group-hover:opacity-100 text-ink-3 hover:text-error transition-opacity leading-none px-1"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] font-sans italic text-ink-3">
        {computedAt
          ? `Quotes as of ${new Date(computedAt).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}`
          : 'No quotes yet — the engine refreshes the watchlist each morning when FINNHUB_API_KEY is set.'}
      </p>
    </div>
  )
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <th
      className={`px-4 py-2 text-[10px] font-sans font-bold uppercase tracking-wider text-ink-3 ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  )
}
