import { useMemo, useState } from 'react'
import { useTrackersStore } from '@/stores/useTrackersStore'
import { EmptyState } from '@/components/workspace/EmptyState'
import type { Script, ScriptStage } from '@shared/types'

const STAGES: ScriptStage[] = ['idea', 'outline', 'draft', 'polish', 'delivered']

const STAGE_LABELS: Record<ScriptStage, string> = {
  idea: 'Idea',
  outline: 'Outline',
  draft: 'Draft',
  polish: 'Polish',
  delivered: 'Delivered',
}

function daysAgo(iso?: string): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Touch heat — gold when warm, amber when cooling, red when cold. */
function touchTone(days: number | null): { className: string; label: string } {
  if (days === null) return { className: 'text-text-muted', label: 'never touched' }
  const base = days === 0 ? 'touched today' : `last touched ${days}d ago`
  if (days < 7) return { className: 'text-accent-lemon', label: base }
  if (days <= 14) return { className: 'text-accent-coral', label: base }
  return { className: 'text-accent-rose font-semibold', label: `${base} — going cold` }
}

interface NewScriptForm {
  title: string
  stage: ScriptStage
}

export function WritingView() {
  const scripts = useTrackersStore((s) => s.scripts)
  const createScript = useTrackersStore((s) => s.createScript)
  const updateScript = useTrackersStore((s) => s.updateScript)
  const removeScript = useTrackersStore((s) => s.removeScript)
  const touchScript = useTrackersStore((s) => s.touchScript)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewScriptForm>({ title: '', stage: 'idea' })
  const [editingId, setEditingId] = useState<string | null>(null)

  const editingScript = useMemo(
    () => scripts.find((s) => s.id === editingId) ?? null,
    [scripts, editingId],
  )

  const sorted = useMemo(
    () => [...scripts].sort((a, b) => (a.slatePosition ?? 99) - (b.slatePosition ?? 99)),
    [scripts],
  )

  const summary = useMemo(() => {
    const active = scripts.filter((s) => s.stage !== 'delivered')
    const cold = active.filter((s) => {
      const d = daysAgo(s.lastTouchedAt)
      return d === null || d > 14
    })
    const withTarget = active
      .filter((s) => s.targetDate)
      .sort((a, b) => (a.targetDate ?? '').localeCompare(b.targetDate ?? ''))
    const next = withTarget[0]
    return { inMotion: active.length - cold.length, cold: cold.length, next }
  }, [scripts])

  function reset() {
    setForm({ title: '', stage: 'idea' })
    setShowForm(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    await createScript({
      title: form.title.trim(),
      stage: form.stage,
      slatePosition: scripts.length + 1,
    })
    reset()
  }

  return (
    <section className="space-y-4 animate-in">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-semibold text-text-primary leading-tight">
            The Slate
          </h2>
          <p className="text-xs font-body text-text-muted mt-1">
            {scripts.length === 0 ? (
              'Sacred work — protect the writing hours'
            ) : (
              <>
                <span className="text-accent-lemon font-medium">{summary.inMotion} in motion</span>
                {' · '}
                <span className={summary.cold > 0 ? 'text-accent-rose' : ''}>
                  {summary.cold} gone cold
                </span>
                {summary.next?.targetDate && (
                  <>
                    {' · next target: '}
                    <span className="text-text-secondary">
                      {summary.next.title} — {formatDate(summary.next.targetDate)}
                    </span>
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="text-[11px] font-body font-medium uppercase tracking-wider px-3 py-1.5 rounded-md border border-border-soft hover:border-border-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Script'}
        </button>
      </header>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-bg-surface border border-border-soft rounded-xl p-4 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Title" required>
              <input
                autoFocus
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="The Quiet Year"
                className="form-input"
                required
              />
            </Field>
            <Field label="Stage">
              <select
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value as ScriptStage })}
                className="form-input"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
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
              Save script
            </button>
          </div>
        </form>
      )}

      {scripts.length === 0 ? (
        <EmptyState
          title="Seven scripts. None tracked yet."
          body="Add your scripts and tap “I wrote today” after each session — the nightly engine watches vault activity and flags anything going cold."
          cta={{ label: 'Add a script', onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {sorted.map((script) => (
            <ScriptCard
              key={script.id}
              script={script}
              onStage={(stage) => updateScript(script.id, { stage })}
              onWrote={() => touchScript(script.id)}
              onEdit={() => setEditingId(script.id)}
            />
          ))}
        </div>
      )}

      {editingScript && (
        <ScriptDetail
          script={editingScript}
          onClose={() => setEditingId(null)}
          onUpdate={(patch) => updateScript(editingScript.id, patch)}
          onDelete={async () => {
            await removeScript(editingScript.id)
            setEditingId(null)
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

/* ─── Script card ─── */

function ScriptCard({
  script,
  onStage,
  onWrote,
  onEdit,
}: {
  script: Script
  onStage: (stage: ScriptStage) => void
  onWrote: () => void
  onEdit: () => void
}) {
  const days = daysAgo(script.lastTouchedAt)
  const tone = touchTone(days)
  const stageIdx = STAGES.indexOf(script.stage)

  return (
    <article className="group bg-bg-surface border border-border-soft hover:border-border-medium rounded-xl p-4 flex flex-col gap-3 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-text-primary leading-tight">
          {script.slatePosition != null && (
            <span className="text-text-muted font-normal mr-1.5 tabular-nums">
              {script.slatePosition}.
            </span>
          )}
          {script.title}
        </h3>
        <button
          type="button"
          onClick={onEdit}
          className="opacity-0 group-hover:opacity-100 text-[10px] font-body uppercase tracking-wider text-text-muted hover:text-text-primary transition-opacity flex-shrink-0"
        >
          Edit
        </button>
      </div>

      {/* Stage stepper */}
      <div className="flex items-center gap-1" role="group" aria-label="Stage">
        {STAGES.map((stage, i) => {
          const reached = i <= stageIdx
          const current = i === stageIdx
          return (
            <button
              key={stage}
              type="button"
              onClick={() => onStage(stage)}
              title={STAGE_LABELS[stage]}
              aria-pressed={current}
              className={[
                'flex-1 flex flex-col items-center gap-1 py-1 rounded transition-colors',
                'hover:bg-bg-elevated',
              ].join(' ')}
            >
              <span
                aria-hidden
                className={[
                  'block w-full h-1 rounded-full transition-colors',
                  reached ? 'bg-accent-lemon' : 'bg-border-soft',
                ].join(' ')}
              />
              <span
                className={[
                  'text-[8px] font-body uppercase tracking-wider',
                  current ? 'text-accent-lemon font-bold' : 'text-text-muted',
                ].join(' ')}
              >
                {STAGE_LABELS[stage]}
              </span>
            </button>
          )
        })}
      </div>

      <div className="space-y-1">
        <p className={`text-[11px] font-body ${tone.className}`}>
          {tone.label}
          {script.stage === 'draft' && !!script.draftNumber && (
            <span className="text-text-tertiary"> · draft {script.draftNumber}</span>
          )}
        </p>
        {script.targetDate && (
          <p className="text-[11px] font-body text-text-tertiary">
            target {formatDate(script.targetDate)}
          </p>
        )}
        {script.notes && (
          <p className="text-[11px] font-body italic text-text-tertiary line-clamp-2 leading-snug">
            {script.notes}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onWrote}
        className="mt-auto self-start text-[11px] font-body font-semibold uppercase tracking-wider px-3 py-1.5 rounded-md border border-accent-lemon/40 text-accent-lemon hover:bg-accent-lemon/10 transition-colors"
      >
        I wrote today
      </button>
    </article>
  )
}

/* ─── Edit modal ─── */

function ScriptDetail({
  script,
  onClose,
  onUpdate,
  onDelete,
}: {
  script: Script
  onClose: () => void
  onUpdate: (patch: Partial<Script>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [title, setTitle] = useState(script.title)
  const [draftNumber, setDraftNumber] = useState(
    script.draftNumber != null ? String(script.draftNumber) : '',
  )
  const [targetDate, setTargetDate] = useState(script.targetDate ?? '')
  const [notes, setNotes] = useState(script.notes ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Script — ${script.title}`}
      className="modal-backdrop"
      onClick={onClose}
    >
      <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="min-w-0">
            <h3 className="modal-title truncate">{script.title}</h3>
            <p className="text-[11px] font-body text-text-muted">
              {STAGE_LABELS[script.stage]}
            </p>
          </div>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Close">
            ×
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (title.trim() && title.trim() !== script.title) {
                  onUpdate({ title: title.trim() })
                }
              }}
              className="form-input"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Draft #">
              <input
                value={draftNumber}
                onChange={(e) => setDraftNumber(e.target.value)}
                onBlur={() => {
                  const n = Number(draftNumber)
                  // 0 means "no draft number" — Firestore rejects `undefined`.
                  const next = Number.isFinite(n) && n > 0 ? n : 0
                  if (next !== (script.draftNumber ?? 0)) onUpdate({ draftNumber: next })
                }}
                inputMode="numeric"
                placeholder="2"
                className="form-input"
              />
            </Field>
            <Field label="Target date">
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                onBlur={() => {
                  if (targetDate !== (script.targetDate ?? '')) {
                    // Empty string clears the date — Firestore rejects `undefined`.
                    onUpdate({ targetDate })
                  }
                }}
                className="form-input"
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (script.notes ?? '')) onUpdate({ notes })
              }}
              rows={3}
              className="form-input w-full"
              placeholder="Where the story stands"
            />
          </Field>
        </div>
        <div className="modal-actions">
          {confirmDelete ? (
            <>
              <span className="text-[11px] font-body text-accent-coral">Delete this script?</span>
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
                Delete script
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
