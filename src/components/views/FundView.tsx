import { useMemo, useState } from 'react'
import { useTrackersStore } from '@/stores/useTrackersStore'
import { useMissionStore } from '@/stores/useMissionStore'
import { BoardKanban, type BoardColumnDef } from '@/components/workspace/BoardKanban'
import { EmptyState } from '@/components/workspace/EmptyState'
import type { Investor, InvestorStage, Deadline } from '@shared/types'

const COLUMNS: BoardColumnDef<InvestorStage>[] = [
  { key: 'contacted', label: 'Contacted', accent: 'var(--color-accent-blue)', subtitle: 'First touch made' },
  { key: 'interested', label: 'Interested', accent: 'var(--color-accent-lemon)', subtitle: 'Warm, keep moving' },
  { key: 'docs', label: 'Docs', accent: 'var(--color-accent-coral)', subtitle: 'Papers in motion' },
  { key: 'committed', label: 'Committed', accent: 'var(--color-accent-sage)', subtitle: 'Money in' },
  { key: 'passed', label: 'Passed', accent: 'var(--color-text-muted)', subtitle: 'Not this time' },
]

const DEFAULT_TARGET_MXN = 300_000_000

/** "$45M", "$7.5M", "$850K" — MXN amounts, compact. */
function formatMXN(n?: number): string {
  if (!n || n <= 0) return '—'
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`
  }
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

function daysAgo(iso?: string): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

function daysUntil(isoDate: string): number {
  const t = Date.parse(isoDate)
  if (Number.isNaN(t)) return 0
  return Math.ceil((t - Date.now()) / 86_400_000)
}

interface NewInvestorForm {
  name: string
  stage: InvestorStage
  amount: string
}

const EMPTY_FORM: NewInvestorForm = { name: '', stage: 'contacted', amount: '' }

export function FundView() {
  const investors = useTrackersStore((s) => s.investors)
  const deadlines = useTrackersStore((s) => s.deadlines)
  const createInvestor = useTrackersStore((s) => s.createInvestor)
  const updateInvestor = useTrackersStore((s) => s.updateInvestor)
  const removeInvestor = useTrackersStore((s) => s.removeInvestor)
  const createDeadline = useTrackersStore((s) => s.createDeadline)
  const removeDeadline = useTrackersStore((s) => s.removeDeadline)
  const fund = useMissionStore((s) => s.fund)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewInvestorForm>(EMPTY_FORM)
  const [activeId, setActiveId] = useState<string | null>(null)

  const activeInvestor = useMemo(
    () => investors.find((i) => i.id === activeId) ?? null,
    [investors, activeId],
  )

  const targetMXN = fund?.targetMXN ?? DEFAULT_TARGET_MXN
  const committedMXN = useMemo(
    () =>
      investors
        .filter((i) => i.stage === 'committed')
        .reduce((sum, i) => sum + (i.amountMXN ?? 0), 0),
    [investors],
  )
  const pct = targetMXN > 0 ? Math.min(100, (committedMXN / targetMXN) * 100) : 0

  function reset() {
    setForm(EMPTY_FORM)
    setShowForm(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    const amount = Number(form.amount.replace(/[^0-9.]/g, ''))
    await createInvestor({
      name: form.name.trim(),
      stage: form.stage,
      // Firestore rejects `undefined` — only include the field when set.
      ...(Number.isFinite(amount) && amount > 0 ? { amountMXN: amount } : {}),
    })
    reset()
  }

  return (
    <section className="space-y-4 animate-in">
      {/* Heading + raise progress */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-semibold text-text-primary leading-tight">
            Lemon Trust I
          </h2>
          <p className="text-xs font-body text-text-muted mt-1">
            {investors.length} investor{investors.length === 1 ? '' : 's'} in play · drag cards
            between stages to update
          </p>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="font-display text-xl font-semibold text-text-primary tabular-nums">
            {committedMXN > 0 ? formatMXN(committedMXN) : '$0'}
            <span className="text-text-tertiary font-normal"> / {formatMXN(targetMXN)} MXN</span>
          </span>
          <span className="text-[11px] font-body font-semibold text-accent-lemon tabular-nums">
            {pct.toFixed(pct > 0 && pct < 1 ? 1 : 0)}%
          </span>
        </div>
      </header>

      {/* Thin gold progress bar */}
      <div
        className="h-1 rounded-full overflow-hidden bg-border-soft"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Raise progress"
      >
        <div
          className="h-full bg-accent-lemon rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Deadline radar */}
      <DeadlineRadar
        deadlines={deadlines}
        onAdd={createDeadline}
        onRemove={removeDeadline}
      />

      {/* Quick-add */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="text-[11px] font-body font-medium uppercase tracking-wider px-3 py-1.5 rounded-md border border-border-soft hover:border-border-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Investor'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-bg-surface border border-border-soft rounded-xl p-4 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Name" required>
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Patricia Vergara"
                className="form-input"
                required
              />
            </Field>
            <Field label="Stage">
              <select
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value as InvestorStage })}
                className="form-input"
              >
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (MXN)">
              <input
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="25000000"
                inputMode="numeric"
                className="form-input"
              />
            </Field>
          </div>
          <div className="flex items-center gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={reset}
              className="text-[11px] font-body text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-[11px] font-body font-semibold uppercase tracking-wider bg-accent-lemon text-bg-base px-4 py-1.5 rounded-md hover:brightness-110 transition-all"
            >
              Save investor
            </button>
          </div>
        </form>
      )}

      {/* Board */}
      {investors.length === 0 ? (
        <EmptyState
          title="The raise starts with one name"
          body="Add your first investor — the engine's inbox scan will surface fund conversations and stalls automatically once names are in play."
          cta={{ label: 'Add an investor', onClick: () => setShowForm(true) }}
        />
      ) : (
        <BoardKanban
          columns={COLUMNS}
          items={investors}
          getColumn={(i) => i.stage}
          onMove={(id, target) => updateInvestor(id, { stage: target })}
          onCardClick={(i) => setActiveId(i.id)}
          renderCard={(inv) => <InvestorCard investor={inv} />}
          emptyHint="No one here yet"
        />
      )}

      {/* Detail modal */}
      {activeInvestor && (
        <InvestorDetail
          investor={activeInvestor}
          onClose={() => setActiveId(null)}
          onUpdate={(patch) => updateInvestor(activeInvestor.id, patch)}
          onDelete={async () => {
            await removeInvestor(activeInvestor.id)
            setActiveId(null)
          }}
        />
      )}

      <style>{`
        .form-input {
          width: 100%;
          background: var(--color-bg-base);
          border: 1px solid var(--color-border-soft);
          color: var(--color-text-primary);
          font-size: 12px;
          font-family: 'Inter', sans-serif;
          padding: 8px 10px;
          border-radius: 8px;
          outline: none;
          transition: border-color 150ms;
        }
        .form-input:focus {
          border-color: var(--color-accent-lemon);
        }
      `}</style>
    </section>
  )
}

/* ─── Deadline radar ─── */

function DeadlineRadar({
  deadlines,
  onAdd,
  onRemove,
}: {
  deadlines: Deadline[]
  onAdd: (input: Omit<Deadline, 'id'>) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [severity, setSeverity] = useState<'hard' | 'soft'>('hard')

  const sorted = useMemo(
    () => [...deadlines].sort((a, b) => a.date.localeCompare(b.date)),
    [deadlines],
  )

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date) return
    await onAdd({ title: title.trim(), date, severity })
    setTitle('')
    setDate('')
    setSeverity('hard')
    setAdding(false)
  }

  return (
    <div className="space-y-2">
      <p className="ed-section-label">Deadline radar</p>
      <div className="flex items-center gap-2 flex-wrap">
        {sorted.length === 0 && !adding && (
          <span className="text-[11px] font-body italic text-text-muted">
            No deadlines on radar — add the dates that can hurt you.
          </span>
        )}
        {sorted.map((d) => {
          const days = daysUntil(d.date)
          const urgent = days < 30 || (d.severity === 'hard' && days < 90)
          return (
            <span
              key={d.id}
              title={`${d.title} · ${d.date} · ${d.severity}`}
              className={[
                'group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-body whitespace-nowrap transition-colors',
                urgent
                  ? 'border-accent-coral/40 text-accent-coral bg-accent-coral/10'
                  : 'border-border-soft text-text-secondary bg-bg-surface',
              ].join(' ')}
            >
              {d.severity === 'hard' && (
                <span
                  aria-hidden
                  className={`inline-block w-1.5 h-1.5 rounded-full ${urgent ? 'bg-accent-coral' : 'bg-text-tertiary'}`}
                />
              )}
              <span>{d.title}</span>
              <span className="font-semibold tabular-nums">
                {days >= 0 ? `${days}d` : `${Math.abs(days)}d past`}
              </span>
              <button
                type="button"
                onClick={() => onRemove(d.id)}
                aria-label={`Remove deadline ${d.title}`}
                className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent-rose transition-opacity leading-none -mr-0.5"
              >
                ×
              </button>
            </span>
          )
        })}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-[11px] font-body text-text-muted hover:text-accent-lemon px-2 py-1 rounded-full border border-dashed border-border-soft hover:border-border-medium transition-colors"
          >
            + deadline
          </button>
        )}
      </div>
      {adding && (
        <form onSubmit={handleAdd} className="flex items-center gap-2 flex-wrap">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Oxido Year-2 funding"
            className="form-input !w-56"
            required
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="form-input !w-40"
            required
          />
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as 'hard' | 'soft')}
            className="form-input !w-24"
          >
            <option value="hard">Hard</option>
            <option value="soft">Soft</option>
          </select>
          <button
            type="submit"
            className="text-[11px] font-body font-semibold uppercase tracking-wider bg-accent-lemon text-bg-base px-3 py-1.5 rounded-md hover:brightness-110 transition-all"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="text-[11px] font-body text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  )
}

/* ─── Investor card ─── */

function InvestorCard({ investor }: { investor: Investor }) {
  const days = daysAgo(investor.lastTouch)
  const touchOverdue =
    days !== null && days > 5 && (investor.stage === 'docs' || investor.stage === 'interested')
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-[13px] font-body font-semibold leading-tight text-text-primary">
          {investor.name}
        </h4>
        {investor.amountMXN ? (
          <span className="text-[10px] font-mono whitespace-nowrap flex-shrink-0 text-accent-sage tabular-nums">
            {formatMXN(investor.amountMXN)}
          </span>
        ) : null}
      </div>
      {investor.org && (
        <p className="text-[11px] font-body mt-1 text-text-tertiary">{investor.org}</p>
      )}
      {days !== null && (
        <p
          className={[
            'text-[10px] font-body mt-1.5',
            touchOverdue ? 'text-accent-coral font-semibold' : 'text-text-muted',
          ].join(' ')}
        >
          {days === 0 ? 'touched today' : `${days}d since last touch`}
          {touchOverdue && ' — follow up'}
        </p>
      )}
      {investor.nextAction && (
        <p className="text-[11px] font-body italic mt-1.5 truncate text-text-tertiary">
          → {investor.nextAction}
        </p>
      )}
    </>
  )
}

/* ─── Detail modal ─── */

function InvestorDetail({
  investor,
  onClose,
  onUpdate,
  onDelete,
}: {
  investor: Investor
  onClose: () => void
  onUpdate: (patch: Partial<Investor>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [amount, setAmount] = useState(
    investor.amountMXN != null ? String(investor.amountMXN) : '',
  )
  const [nextAction, setNextAction] = useState(investor.nextAction ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const days = daysAgo(investor.lastTouch)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Investor — ${investor.name}`}
      className="modal-backdrop"
      onClick={onClose}
    >
      <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="min-w-0">
            <h3 className="modal-title truncate">{investor.name}</h3>
            <p className="text-[11px] font-body text-text-muted">
              {investor.org ? `${investor.org} · ` : ''}
              {COLUMNS.find((c) => c.key === investor.stage)?.label ?? 'Contacted'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Close">
            ×
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stage">
              <select
                value={investor.stage}
                onChange={(e) => onUpdate({ stage: e.target.value as InvestorStage })}
                className="form-input"
              >
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (MXN)">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={() => {
                  const n = Number(amount.replace(/[^0-9.]/g, ''))
                  // 0 means "no amount" — Firestore rejects `undefined`.
                  const next = Number.isFinite(n) && n > 0 ? n : 0
                  if (next !== (investor.amountMXN ?? 0)) onUpdate({ amountMXN: next })
                }}
                inputMode="numeric"
                placeholder="25000000"
                className="form-input"
              />
            </Field>
          </div>
          <div>
            <span className="block text-[10px] font-body font-bold uppercase tracking-wider text-text-muted mb-1">
              Next action
            </span>
            <textarea
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              onBlur={() => {
                if (nextAction !== (investor.nextAction ?? '')) {
                  onUpdate({ nextAction })
                }
              }}
              rows={2}
              className="form-input w-full"
              placeholder="What moves this forward?"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-body text-text-tertiary">
              {days === null
                ? 'No touch logged yet'
                : days === 0
                  ? 'Touched today'
                  : `Last touch ${days}d ago`}
            </span>
            <button
              type="button"
              onClick={() => onUpdate({ lastTouch: new Date().toISOString() })}
              className="text-[11px] font-body font-semibold uppercase tracking-wider px-3 py-1.5 rounded-md border border-accent-lemon/40 text-accent-lemon hover:bg-accent-lemon/10 transition-colors"
            >
              Touched today
            </button>
          </div>
        </div>
        <div className="modal-actions">
          {confirmDelete ? (
            <>
              <span className="text-[11px] font-body text-accent-coral">
                Remove this investor?
              </span>
              <div className="modal-actions-right">
                <button
                  type="button"
                  className="text-[11px] font-body text-text-muted hover:text-text-primary"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="text-[11px] font-body font-semibold uppercase tracking-wider bg-accent-rose text-white px-3 py-1.5 rounded-md hover:brightness-110"
                  onClick={onDelete}
                >
                  Delete
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className="text-[11px] font-body text-text-muted hover:text-accent-coral transition-colors"
                onClick={() => setConfirmDelete(true)}
              >
                Remove investor
              </button>
              <div className="modal-actions-right">
                <button type="button" onClick={onClose} className="btn-secondary">
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-body font-bold uppercase tracking-wider text-text-muted mb-1">
        {label}
        {required && <span className="ml-1 text-accent-coral">*</span>}
      </span>
      {children}
    </label>
  )
}
