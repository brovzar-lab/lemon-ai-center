import { useEffect, useMemo, useState } from 'react'
import { useDealsStore } from '@/stores/lemon/useDealsStore'
import { useTaskStore } from '@/stores/useTaskStore'
import { useAuthStore } from '@/stores/useAuthStore'
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

/** Append a timestamped note line to a deal's notes (newest last). */
function appendDealNote(existing: string | undefined, text: string): string {
  const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const line = `[${stamp}] ${text.trim()}`
  return existing ? `${existing}\n${line}` : line
}

// ── Counterparty Grouping ────────────────────────────────────────

interface CounterpartyGroup {
  counterparty: string
  deals: LemonDeal[]
}

function groupByCounterparty(deals: LemonDeal[]): (LemonDeal | CounterpartyGroup)[] {
  const groups: Record<string, LemonDeal[]> = {}
  const standalone: LemonDeal[] = []

  for (const d of deals) {
    const cp = d.counterparty?.trim()
    if (!cp) {
      standalone.push(d)
    } else {
      if (!groups[cp]) groups[cp] = []
      groups[cp].push(d)
    }
  }

  const result: (LemonDeal | CounterpartyGroup)[] = []

  // Multi-deal groups first
  for (const [counterparty, groupDeals] of Object.entries(groups)) {
    if (groupDeals.length === 1) {
      result.push(groupDeals[0])
    } else {
      result.push({ counterparty, deals: groupDeals })
    }
  }

  // Standalone deals after
  result.push(...standalone)

  return result
}

function isGroup(item: LemonDeal | CounterpartyGroup): item is CounterpartyGroup {
  return 'deals' in item && 'counterparty' in item && Array.isArray((item as any).deals)
}

// ── Main Component ───────────────────────────────────────────────

export function DealsView() {
  const deals = useDealsStore((s) => s.deals)
  const subscribe = useDealsStore((s) => s.subscribe)
  const create = useDealsStore((s) => s.create)
  const updateStatus = useDealsStore((s) => s.updateStatus)
  const update = useDealsStore((s) => s.update)
  const remove = useDealsStore((s) => s.remove)
  const loading = useDealsStore((s) => s.loading)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewDealForm>(EMPTY_FORM)
  const [popover, setPopover] = useState<{ deal: LemonDeal; anchor: { x: number; y: number } } | null>(null)
  const { contextMenu, onContextMenu, closeMenu } = useContextMenu()
  const [ctxDeal, setCtxDeal] = useState<LemonDeal | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const handleDealContext = (deal: LemonDeal, e: React.MouseEvent) => {
    setCtxDeal(deal)
    onContextMenu(e)
  }

  const handleDealClick = (deal: LemonDeal, e?: React.MouseEvent) => {
    const anchor = e
      ? { x: Math.min(e.clientX, window.innerWidth - 360), y: Math.min(e.clientY, window.innerHeight - 400) }
      : { x: window.innerWidth / 2 - 170, y: 200 }
    setPopover({ deal, anchor })
  }

  const toggleGroup = (counterparty: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(counterparty)) next.delete(counterparty)
      else next.add(counterparty)
      return next
    })
  }

  const ctxActions: ContextAction[] = ctxDeal ? [
    {
      label: 'Add quick note',
      icon: '📝',
      input: {
        placeholder: 'e.g. Approved Benvenuto buy',
        onSubmit: (text) => update(ctxDeal.id, { notes: appendDealNote(ctxDeal.notes, text) }),
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
    { label: 'Open details', icon: '⊙', onClick: () => handleDealClick(ctxDeal) },
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
        <DealsKanban
          deals={deals}
          columns={COLUMNS}
          expandedGroups={expandedGroups}
          onToggleGroup={toggleGroup}
          onMove={(id, target) => updateStatus(id, target)}
          onCardClick={handleDealClick}
          onCardContextMenu={handleDealContext}
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

      {/* Floating popover detail */}
      {popover && (
        <DealPopover
          deal={popover.deal}
          anchor={popover.anchor}
          onClose={() => setPopover(null)}
          onUpdate={async (patch) => {
            await update(popover.deal.id, patch)
            setPopover({ ...popover, deal: { ...popover.deal, ...patch } })
          }}
          onUpdateStatus={async (status) => {
            await updateStatus(popover.deal.id, status)
            setPopover({ ...popover, deal: { ...popover.deal, status } })
          }}
          onDelete={async () => {
            await remove(popover.deal.id)
            setPopover(null)
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

// ── DealsKanban (grouped columns) ────────────────────────────────

function DealsKanban({
  deals,
  columns,
  expandedGroups,
  onToggleGroup,
  onMove,
  onCardClick,
  onCardContextMenu,
}: {
  deals: LemonDeal[]
  columns: BoardColumnDef<DealStatus>[]
  expandedGroups: Set<string>
  onToggleGroup: (cp: string) => void
  onMove: (id: string, target: DealStatus) => void
  onCardClick: (deal: LemonDeal, e?: React.MouseEvent) => void
  onCardContextMenu: (deal: LemonDeal, e: React.MouseEvent) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<DealStatus | null>(null)

  return (
    <div className="grid grid-flow-col auto-cols-fr gap-3">
      {columns.map((col) => {
        const colDeals = deals.filter((d) => (d.status ?? 'active') === col.key)
        const grouped = groupByCounterparty(colDeals)
        const isOver = overColumn === col.key && draggingId !== null

        return (
          <section key={col.key} className="flex flex-col gap-2">
            <header className="flex items-center gap-2 px-1">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: col.accent }}
                aria-hidden
              />
              <span className="text-[11px] font-sans font-semibold text-ink uppercase tracking-wider">
                {col.label}
              </span>
              <span className="text-[10px] font-sans text-ink-3 tabular-nums">{colDeals.length}</span>
              {col.subtitle && (
                <p className="text-[10px] font-sans italic text-ink-3 ml-auto">{col.subtitle}</p>
              )}
            </header>

            <div
              onDragOver={(e) => { e.preventDefault(); setOverColumn(col.key) }}
              onDragLeave={() => setOverColumn(null)}
              onDrop={(e) => {
                e.preventDefault()
                const id = e.dataTransfer.getData('text/plain')
                if (id) onMove(id, col.key)
                setOverColumn(null)
                setDraggingId(null)
              }}
              className={[
                'flex-1 min-h-[120px] rounded-xl p-2 space-y-2 border transition-colors',
                isOver ? 'bg-sunken border-accent/40' : 'bg-surface border-line',
              ].join(' ')}
            >
              {grouped.map((item) => {
                if (isGroup(item)) {
                  const expanded = expandedGroups.has(item.counterparty)
                  return (
                    <div key={`group-${item.counterparty}`} className="space-y-1">
                      <button
                        type="button"
                        onClick={() => onToggleGroup(item.counterparty)}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-sunken/50 hover:bg-sunken text-left transition-colors"
                      >
                        <span className="text-[10px] text-ink-3">{expanded ? '▾' : '▸'}</span>
                        <span className="text-[11px] font-sans font-semibold text-ink truncate flex-1">
                          {item.counterparty}
                        </span>
                        <span className="text-[10px] font-mono text-ink-3 tabular-nums">
                          {item.deals.length}
                        </span>
                      </button>
                      {expanded && item.deals.map((deal) => (
                        <DealCardWrapper
                          key={deal.id}
                          deal={deal}
                          draggingId={draggingId}
                          onDragStart={setDraggingId}
                          onDragEnd={() => setDraggingId(null)}
                          onClick={onCardClick}
                          onContextMenu={onCardContextMenu}
                          indent
                        />
                      ))}
                    </div>
                  )
                }
                return (
                  <DealCardWrapper
                    key={item.id}
                    deal={item}
                    draggingId={draggingId}
                    onDragStart={setDraggingId}
                    onDragEnd={() => setDraggingId(null)}
                    onClick={onCardClick}
                    onContextMenu={onCardContextMenu}
                  />
                )
              })}
              {colDeals.length === 0 && (
                <p className="text-[11px] italic font-sans text-ink-3 text-center py-6">
                  No deals
                </p>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

// ── Card Wrapper (draggable) ─────────────────────────────────────

function DealCardWrapper({
  deal,
  draggingId,
  onDragStart,
  onDragEnd,
  onClick,
  onContextMenu,
  indent,
}: {
  deal: LemonDeal
  draggingId: string | null
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onClick: (deal: LemonDeal, e?: React.MouseEvent) => void
  onContextMenu: (deal: LemonDeal, e: React.MouseEvent) => void
  indent?: boolean
}) {
  const isDragging = draggingId === deal.id
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', deal.id)
        onDragStart(deal.id)
      }}
      onDragEnd={onDragEnd}
      onClick={(e) => onClick(deal, e)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(deal, e) }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(deal)
        }
      }}
      className={[
        'group relative cursor-grab active:cursor-grabbing rounded-lg border bg-bg px-3 py-2.5 transition-all overflow-hidden',
        'border-line hover:border-line hover:bg-sunken',
        isDragging ? 'opacity-30 scale-[0.98]' : 'opacity-100',
        indent ? 'ml-3' : '',
      ].join(' ')}
      style={isDragging ? undefined : { boxShadow: '0 1px 0 rgba(0,0,0,0.04)' }}
    >
      <DealCard deal={deal} />
    </div>
  )
}

// ── DealCard (fixed overflow) ────────────────────────────────────

function DealCard({ deal }: { deal: LemonDeal }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-[13px] font-sans font-semibold leading-tight text-ink line-clamp-2">
          {deal.name}
        </h4>
        {deal.value && (
          <span
            className="text-[10px] font-mono truncate max-w-[120px] flex-shrink-0 text-data-teal tabular-nums"
            title={deal.value}
          >
            {deal.value}
          </span>
        )}
      </div>
      {deal.counterparty && (
        <p className="text-[11px] font-sans mt-1 text-ink-3 truncate">{deal.counterparty}</p>
      )}
      <div className="flex items-center gap-1.5 mt-1.5">
        {deal.owner && (
          <span className="inline-block text-[10px] font-sans px-1.5 py-0.5 rounded bg-sunken text-ink-3 truncate max-w-[80px]">
            {deal.owner}
          </span>
        )}
        {deal.project && (
          <span className="inline-block text-[10px] font-sans px-1.5 py-0.5 rounded bg-sunken text-ink-3 truncate max-w-[80px]">
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

// ── Deal Popover ─────────────────────────────────────────────────

function DealPopover({
  deal,
  anchor,
  onClose,
  onUpdate,
  onUpdateStatus,
  onDelete,
}: {
  deal: LemonDeal
  anchor: { x: number; y: number }
  onClose: () => void
  onUpdate: (patch: Partial<LemonDeal>) => Promise<void>
  onUpdateStatus: (status: DealStatus) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [editingNextAction, setEditingNextAction] = useState(deal.next_action ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [pushed, setPushed] = useState(false)

  const createTask = useTaskStore((s) => s.create)
  const user = useAuthStore((s) => s.user)

  const noteLines = (deal.notes ?? '').split('\n').map((l) => l.trim()).filter(Boolean)

  const addNote = () => {
    const text = noteDraft.trim()
    if (!text) return
    onUpdate({ notes: appendDealNote(deal.notes, text) })
    setNoteDraft('')
  }

  const pushToTasks = () => {
    if (!user) return
    createTask(user.uid, {
      title: deal.next_action?.trim() || deal.name,
      bucket: 'next',
      source: 'manual',
      notes: `From deal: ${deal.name}`,
    })
    setPushed(true)
    setTimeout(() => setPushed(false), 2500)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Popover */}
      <div
        className="fixed z-50 bg-surface border border-line rounded-xl shadow-2xl w-[340px] max-h-[70vh] overflow-y-auto"
        style={{ top: anchor.y, left: anchor.x }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[14px] font-sans font-semibold text-ink leading-tight">{deal.name}</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-ink-3 hover:text-ink text-sm flex-shrink-0"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {deal.value && (
            <div className="text-[12px] font-mono text-data-teal">{deal.value}</div>
          )}

          <div className="space-y-2">
            <PopoverRow label="Counterparty" value={deal.counterparty ?? '—'} />
            <PopoverRow label="Owner" value={deal.owner ?? '—'} />
            <PopoverRow label="Project" value={deal.project ?? '—'} />
          </div>

          {/* Next action — editable */}
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

          {/* Notes / Activity log */}
          <div>
            <span className="block text-[10px] font-sans font-bold uppercase tracking-wider text-ink-3 mb-1">
              Notes & Activity
            </span>
            {noteLines.length > 0 ? (
              <div className="max-h-[120px] overflow-y-auto space-y-1 mb-2">
                {noteLines.map((line, i) => (
                  <p key={i} className="text-[11px] font-sans text-ink-3">{line}</p>
                ))}
              </div>
            ) : (
              <p className="text-[11px] font-sans text-ink-3 italic mb-2">No notes yet</p>
            )}
            <div className="flex gap-1.5">
              <input
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addNote() }}
                placeholder="Add a note…"
                className="form-input flex-1"
              />
              <button
                type="button"
                onClick={addNote}
                disabled={!noteDraft.trim()}
                className="text-[10px] font-sans font-semibold uppercase tracking-wider text-accent hover:text-accent/80 px-2 disabled:opacity-30"
              >
                Add
              </button>
            </div>
          </div>

          {/* Push to Tasks */}
          {deal.next_action && (
            <button
              type="button"
              onClick={pushToTasks}
              disabled={pushed}
              className="w-full text-[11px] font-sans font-semibold uppercase tracking-wider text-center py-1.5 rounded-md border border-line hover:border-accent text-ink-2 hover:text-ink transition-colors disabled:opacity-50"
            >
              {pushed ? '✓ Pushed to Tasks' : '→ Push Next Action to Tasks'}
            </button>
          )}

          {/* Quick status move */}
          <div>
            <span className="block text-[10px] font-sans font-bold uppercase tracking-wider text-ink-3 mb-1.5">
              Move to
            </span>
            <div className="flex flex-wrap gap-1.5">
              {COLUMNS.map((col) => (
                <button
                  key={col.key}
                  type="button"
                  disabled={col.key === deal.status}
                  onClick={() => onUpdateStatus(col.key)}
                  className={[
                    'text-[10px] font-sans px-2.5 py-1 rounded-full border transition-colors',
                    col.key === deal.status
                      ? 'bg-accent/15 text-accent border-accent/30 font-semibold'
                      : 'text-ink-3 border-line hover:border-accent hover:text-ink',
                  ].join(' ')}
                >
                  {col.label}
                </button>
              ))}
            </div>
          </div>

          {/* Delete */}
          <div className="pt-2 border-t border-line flex items-center justify-between">
            {confirmDelete ? (
              <>
                <span className="text-[11px] font-sans text-data-coral">Delete this deal?</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-[11px] font-sans text-ink-3 hover:text-ink"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="text-[11px] font-sans font-semibold text-data-coral hover:brightness-110"
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
                <button type="button" onClick={onClose} className="text-[11px] font-sans text-ink-3 hover:text-ink">
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Helpers ──────────────────────────────────────────────────────

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

function PopoverRow({ label, value }: { label: string; value: string }) {
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
