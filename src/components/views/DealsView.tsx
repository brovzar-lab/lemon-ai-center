import { useEffect, useMemo, useState } from 'react'
import { useDealsStore } from '@/stores/lemon/useDealsStore'
import { BoardKanban, type BoardColumnDef } from '@/components/workspace/BoardKanban'
import { EmptyState } from '@/components/workspace/EmptyState'
import { ScanInboxButton } from '@/components/ScanInboxButton'
import { ContextMenu, useContextMenu, type ContextAction } from '@/components/ContextMenu'
import type { LemonDeal, DealStatus } from '@shared/types'

const COLUMNS: BoardColumnDef<DealStatus>[] = [
  { key: 'active', label: 'Active', accent: 'var(--data-blue)', subtitle: 'In motion' },
  { key: 'pending_signature', label: 'Pending Sig', accent: 'var(--data-coral)', subtitle: 'Action on us' },
  { key: 'in_review', label: 'In Review', accent: 'var(--accent)', subtitle: 'Awaiting them' },
  { key: 'closed', label: 'Closed', accent: 'var(--data-teal)', subtitle: 'Won or lost' },
]

interface NewDealForm {
  name: string
  counterparty: string
  owner: string
  value: string
  next_action: string
  status: DealStatus
}

const EMPTY_FORM: NewDealForm = {
  name: '',
  counterparty: '',
  owner: '',
  value: '',
  next_action: '',
  status: 'active',
}

export function DealsView() {
  const deals = useDealsStore((s) => s.deals)
  const subscribe = useDealsStore((s) => s.subscribe)
  const create = useDealsStore((s) => s.create)
  const updateStatus = useDealsStore((s) => s.updateStatus)
  const update = useDealsStore((s) => s.update)
  const remove = useDealsStore((s) => s.remove)
  const configured = useDealsStore((s) => s.configured)
  const loading = useDealsStore((s) => s.loading)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewDealForm>(EMPTY_FORM)
  const [activeDeal, setActiveDeal] = useState<LemonDeal | null>(null)
  const { contextMenu, onContextMenu, closeMenu } = useContextMenu()
  const [ctxDeal, setCtxDeal] = useState<LemonDeal | null>(null)

  const handleDealContext = (deal: LemonDeal, e: React.MouseEvent) => {
    setCtxDeal(deal)
    onContextMenu(e)
  }

  const ctxActions: ContextAction[] = ctxDeal ? [
    {
      label: 'Add quick note',
      icon: '📝',
      input: {
        placeholder: 'e.g. Approved Benvenuto buy',
        onSubmit: (text) => {
          const existing = ctxDeal.notes ?? ''
          const timestamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const newNote = existing ? `${existing}\n[${timestamp}] ${text}` : `[${timestamp}] ${text}`
          update(ctxDeal.id, { notes: newNote })
        },
      },
    },
    {
      label: 'Update next action',
      icon: '→',
      input: {
        placeholder: 'What needs to happen next?',
        onSubmit: (text) => update(ctxDeal.id, { next_action: text }),
      },
    },
    ...COLUMNS.filter((c) => c.key !== ctxDeal.status).map((col) => ({
      label: `Move to ${col.label}`,
      icon: '◉',
      onClick: () => updateStatus(ctxDeal.id, col.key),
    })),
    { label: 'Open details', icon: '⊙', onClick: () => setActiveDeal(ctxDeal) },
    { label: 'Delete deal', icon: '🗑', danger: true, onClick: () => remove(ctxDeal.id) },
  ] : []

  useEffect(() => {
    return subscribe()
  }, [subscribe])

  const counts = useMemo(() => {
    const map: Record<DealStatus, number> = {
      active: 0,
      pending_signature: 0,
      in_review: 0,
      closed: 0,
    }
    for (const d of deals) {
      const k: DealStatus = (d.status ?? 'active') as DealStatus
      if (map[k] !== undefined) map[k] += 1
    }
    return map
  }, [deals])

  const total = deals.length
  const openTotal = total - counts.closed

  if (!configured) {
    return (
      <EmptyState
        title="LEMON workspace not connected"
        body="Set VITE_LEMON_FIREBASE_* environment variables to load deals from your existing LEMON Firebase project."
      />
    )
  }

  function reset() {
    setForm(EMPTY_FORM)
    setShowForm(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    await create({
      name: form.name.trim(),
      counterparty: form.counterparty.trim() || undefined,
      owner: form.owner.trim() || undefined,
      value: form.value.trim() || undefined,
      next_action: form.next_action.trim() || undefined,
      status: form.status,
    })
    reset()
  }

  return (
    <section className="space-y-4 animate-in">
      {/* Heading + pipeline bar */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink leading-tight">
            Deals
          </h2>
          <p className="text-xs font-sans text-ink-3 mt-1">
            {openTotal} open · {counts.closed} closed · drag cards between stages to update
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="text-[11px] font-sans font-medium uppercase tracking-wider px-3 py-1.5 rounded-md border border-line hover:border-line text-ink-2 hover:text-ink transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Deal'}
        </button>
      </header>

      <PipelineBar counts={counts} total={total} />

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-line rounded-xl p-4 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Name" required>
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Distribution deal — Sundance"
                className="form-input"
                required
              />
            </Field>
            <Field label="Counterparty">
              <input
                value={form.counterparty}
                onChange={(e) => setForm({ ...form, counterparty: e.target.value })}
                placeholder="A24"
                className="form-input"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Owner">
              <input
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
                placeholder="Billy"
                className="form-input"
              />
            </Field>
            <Field label="Value">
              <input
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder="$7.5M"
                className="form-input"
              />
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as DealStatus })}
                className="form-input"
              >
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Next action">
            <input
              value={form.next_action}
              onChange={(e) => setForm({ ...form, next_action: e.target.value })}
              placeholder="Send revised draft to legal"
              className="form-input"
            />
          </Field>
          <div className="flex items-center gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={reset}
              className="text-[11px] font-sans text-ink-3 hover:text-ink transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-[11px] font-sans font-semibold uppercase tracking-wider bg-accent text-bg px-4 py-1.5 rounded-md hover:brightness-110 transition-all"
            >
              Save deal
            </button>
          </div>
        </form>
      )}

      {/* Board */}
      {loading && deals.length === 0 ? (
        <div className="bg-surface border border-line rounded-xl p-10 text-center">
          <div className="w-4 h-4 mx-auto rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
      ) : deals.length === 0 ? (
        <>
        <EmptyState
          title="No deals yet"
          body="Add your first deal or scan your inbox to auto-populate."
          cta={{ label: 'Add a deal', onClick: () => setShowForm(true) }}
        />
        <div className="mt-4">
          <ScanInboxButton />
        </div>
        </>
      ) : (
        <BoardKanban
          columns={COLUMNS}
          items={deals}
          getColumn={(d) => (d.status ?? 'active') as DealStatus}
          onMove={(id, target) => updateStatus(id, target)}
          onCardClick={(d) => setActiveDeal(d)}
          onCardContextMenu={(d, e) => handleDealContext(d, e)}
          renderCard={(deal) => <DealCard deal={deal} />}
        />
      )}

      {/* Right-click context menu */}
      {contextMenu && ctxDeal && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={ctxActions}
          onClose={closeMenu}
        />
      )}

      {/* Detail drawer */}
      {activeDeal && (
        <DealDetail
          deal={activeDeal}
          onClose={() => setActiveDeal(null)}
          onUpdate={async (patch) => {
            await update(activeDeal.id, patch)
            setActiveDeal({ ...activeDeal, ...patch })
          }}
          onDelete={async () => {
            await remove(activeDeal.id)
            setActiveDeal(null)
          }}
        />
      )}

      {/* Field input styling */}
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
      <span className="block text-[10px] font-sans font-bold uppercase tracking-wider text-ink-3 mb-1">
        {label}
        {required && <span className="ml-1 text-data-coral">*</span>}
      </span>
      {children}
    </label>
  )
}

function DealCard({ deal }: { deal: LemonDeal }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-[13px] font-sans font-semibold leading-tight text-ink">
          {deal.name}
        </h4>
        {deal.value && (
          <span className="text-[10px] font-mono whitespace-nowrap flex-shrink-0 text-data-teal tabular-nums">
            {deal.value}
          </span>
        )}
      </div>
      {deal.counterparty && (
        <p className="text-[11px] font-sans mt-1 text-ink-3">{deal.counterparty}</p>
      )}
      <div className="flex items-center gap-1.5 mt-1.5">
        {deal.owner && (
          <span className="inline-block text-[10px] font-sans px-1.5 py-0.5 rounded bg-sunken text-ink-3">
            {deal.owner}
          </span>
        )}
        {deal.project && (
          <span className="inline-block text-[10px] font-sans px-1.5 py-0.5 rounded bg-sunken text-ink-3">
            {deal.project}
          </span>
        )}
      </div>
      {deal.next_action && (
        <p className="text-[11px] font-sans italic mt-2 truncate text-ink-3">
          → {deal.next_action}
        </p>
      )}
      {deal.notes && (
        <p className="text-[10px] font-sans mt-1.5 truncate text-accent/80" title={deal.notes}>
          📝 {deal.notes.split('\n').pop()}
        </p>
      )}
    </>
  )
}

function PipelineBar({
  counts,
  total,
}: {
  counts: Record<DealStatus, number>
  total: number
}) {
  if (total === 0) return null
  return (
    <div
      className="flex h-1.5 rounded-full overflow-hidden bg-line"
      role="img"
      aria-label="Pipeline distribution"
    >
      {COLUMNS.map((col) => {
        const count = counts[col.key] || 0
        const pct = total > 0 ? (count / total) * 100 : 0
        if (pct === 0) return null
        return (
          <div
            key={col.key}
            style={{ width: `${pct}%`, background: col.accent }}
            title={`${col.label}: ${count}`}
          />
        )
      })}
    </div>
  )
}

interface DealDetailProps {
  deal: LemonDeal
  onClose: () => void
  onUpdate: (patch: Partial<LemonDeal>) => Promise<void>
  onDelete: () => Promise<void>
}

function DealDetail({ deal, onClose, onUpdate, onDelete }: DealDetailProps) {
  const [editingNextAction, setEditingNextAction] = useState(deal.next_action ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Deal — ${deal.name}`}
      className="modal-backdrop"
      onClick={onClose}
    >
      <div
        className="modal-content max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="min-w-0">
            <h3 className="modal-title truncate">{deal.name}</h3>
            <p className="text-[11px] font-sans text-ink-3">
              {COLUMNS.find((c) => c.key === deal.status)?.label ?? 'Active'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Close">
            ×
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <Row label="Counterparty" value={deal.counterparty ?? '—'} />
          <Row label="Owner" value={deal.owner ?? '—'} />
          <Row label="Value" value={deal.value ?? '—'} />
          <Row label="Project" value={deal.project ?? '—'} />
          <div>
            <span className="block text-[10px] font-sans font-bold uppercase tracking-wider text-ink-3 mb-1">
              Next action
            </span>
            <textarea
              value={editingNextAction}
              onChange={(e) => setEditingNextAction(e.target.value)}
              onBlur={() => {
                if (editingNextAction !== (deal.next_action ?? '')) {
                  onUpdate({ next_action: editingNextAction })
                }
              }}
              rows={2}
              className="form-input w-full"
              placeholder="What needs to happen next?"
            />
          </div>
        </div>
        <div className="modal-actions">
          {confirmDelete ? (
            <>
              <span className="text-[11px] font-sans text-data-coral">Delete this deal?</span>
              <div className="modal-actions-right">
                <button
                  type="button"
                  className="text-[11px] font-sans text-ink-3 hover:text-ink"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="text-[11px] font-sans font-semibold uppercase tracking-wider bg-error text-white px-3 py-1.5 rounded-md hover:brightness-110"
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
                className="text-[11px] font-sans text-ink-3 hover:text-data-coral transition-colors"
                onClick={() => setConfirmDelete(true)}
              >
                Delete deal
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-ink-3 whitespace-nowrap">
        {label}
      </span>
      <span className="text-[12px] font-sans text-ink text-right truncate">
        {value}
      </span>
    </div>
  )
}
