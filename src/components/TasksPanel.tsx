import { useState } from 'react'
import { useTaskStore } from '@/stores/useTaskStore'
import { useAuthStore } from '@/stores/useAuthStore'
import type { Bucket, TaskSource } from '@shared/types'

const BUCKETS: Bucket[] = ['now', 'next', 'orbit']
const BUCKET_LABELS: Record<Bucket, string> = { now: 'NOW', next: 'NEXT', orbit: 'ORBIT' }
const BUCKET_SUBLABEL: Record<Bucket, string> = { now: 'today', next: 'this week', orbit: 'watching' }
const BUCKET_DOT: Record<Bucket, string> = {
  now: 'bg-accent-coral',
  next: 'bg-accent-lemon',
  orbit: 'bg-text-muted',
}

const PRESETS = [
  { label: 'Last 2 weeks',    sub: 'recent activity',     fromDays: 14,  toDays: 0  },
  { label: '2–8 weeks ago',   sub: 'things that slipped',  fromDays: 56,  toDays: 14 },
  { label: '1–3 months ago',  sub: 'deeper archaeology',   fromDays: 90,  toDays: 56 },
] as const

interface Suggestion {
  title: string
  bucket: Bucket
  source: TaskSource
  notes: string | null
  included: boolean
}

type Stage = 'idle' | 'picking' | 'loading' | 'review' | 'saving'

export function TasksPanel() {
  const tasks = useTaskStore((s) => s.tasks)
  const create = useTaskStore((s) => s.create)
  const bulkCreate = useTaskStore((s) => s.bulkCreate)
  const toggleDone = useTaskStore((s) => s.toggleDone)
  const user = useAuthStore((s) => s.user)

  const [newTitle, setNewTitle] = useState('')
  const [addingTo, setAddingTo] = useState<Bucket | null>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [activePreset, setActivePreset] = useState<typeof PRESETS[number] | null>(null)
  const [scanMeta, setScanMeta] = useState<{ emailCount: number; calCount: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapsedBuckets, setCollapsedBuckets] = useState<Record<Bucket, boolean>>({
    now: false,
    next: true,
    orbit: true,
  })

  const addTask = (bucket: Bucket) => {
    if (!newTitle.trim() || !user) return
    create(user.uid, { title: newTitle.trim(), bucket, source: 'manual' })
    setNewTitle('')
    setAddingTo(null)
  }

  const generate = async (preset: typeof PRESETS[number]) => {
    if (!user) return
    setActivePreset(preset)
    setStage('loading')
    setError(null)
    try {
      const res = await fetch('/api/tasks/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fromDays: preset.fromDays, toDays: preset.toDays }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message || 'Failed')
      setSuggestions(
        (json.data.suggestions as Omit<Suggestion, 'included'>[]).map((s) => ({ ...s, included: true })),
      )
      setScanMeta({ emailCount: json.data.window.emailCount, calCount: json.data.window.calCount })
      setStage('review')
    } catch (err) {
      setError((err as Error).message)
      setStage('idle')
    }
  }

  const toggleSuggestion = (i: number) => {
    setSuggestions((prev) => prev.map((s, idx) => (idx === i ? { ...s, included: !s.included } : s)))
  }

  const saveSuggestions = async () => {
    if (!user) return
    setStage('saving')
    setError(null)
    const toCreate = suggestions
      .filter((s) => s.included)
      .map((s) => ({ ...s, notes: s.notes ?? undefined }))
    try {
      await bulkCreate(user.uid, toCreate)
      setSuggestions([])
      setScanMeta(null)
      setActivePreset(null)
      setStage('idle')
    } catch (err) {
      setError((err as Error).message || 'Could not save tasks')
      setStage('review')
    }
  }

  const selectAll = () => {
    setSuggestions((prev) => prev.map((s) => ({ ...s, included: true })))
  }

  const cancel = () => {
    setSuggestions([])
    setScanMeta(null)
    setActivePreset(null)
    setStage('idle')
  }

  const toggleBucket = (bucket: Bucket) => {
    setCollapsedBuckets((prev) => ({ ...prev, [bucket]: !prev[bucket] }))
  }

  const includedCount = suggestions.filter((s) => s.included).length
  const activeTasks = tasks.filter((t) => !t.done)
  const showBuckets = (stage === 'idle' || stage === 'picking')

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-body font-bold uppercase tracking-[0.2em] text-text-muted">
          Tasks
        </p>
        {stage === 'idle' || stage === 'picking' ? (
          <button
            type="button"
            onClick={() => setStage(stage === 'picking' ? 'idle' : 'picking')}
            className="text-[11px] font-body text-text-muted hover:text-text-secondary tracking-wide uppercase transition-colors flex items-center gap-1"
          >
            Generate
            <span className={`transition-transform duration-150 ${stage === 'picking' ? 'rotate-180' : ''}`}>↓</span>
          </button>
        ) : null}
      </div>

      {/* ── Preset picker ── */}
      {stage === 'picking' && (
        <div className="mb-4 space-y-1">
          {error && <p className="text-xs font-body text-accent-coral mb-2">{error}</p>}
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => generate(preset)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border-soft hover:border-accent-lemon/30 hover:bg-bg-elevated transition-colors text-left group"
            >
              <div>
                <span className="text-sm font-body text-text-primary">{preset.label}</span>
                <span className="ml-2 text-xs font-body text-text-muted">{preset.sub}</span>
              </div>
              <span className="text-text-muted/40 group-hover:text-accent-lemon transition-colors text-xs">→</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Loading ── */}
      {stage === 'loading' && (
        <div className="py-6 space-y-1">
          <div className="flex items-center gap-2 text-text-muted font-body text-xs">
            <div className="w-3 h-3 rounded-full border border-text-muted/40 border-t-transparent animate-spin flex-shrink-0" />
            Scanning {activePreset?.label.toLowerCase()} of email & calendar…
          </div>
          <p className="text-[11px] font-body text-text-muted/50 pl-5">This takes 10–20 seconds</p>
        </div>
      )}

      {/* ── Saving ── */}
      {stage === 'saving' && (
        <div className="flex items-center gap-2 py-6 text-text-muted font-body text-xs">
          <div className="w-3 h-3 rounded-full border border-text-muted/40 border-t-transparent animate-spin flex-shrink-0" />
          Saving tasks…
        </div>
      )}

      {/* ── Review ── */}
      {stage === 'review' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-body text-text-muted">
              {activePreset?.label} — {scanMeta?.emailCount ?? 0} emails, {scanMeta?.calCount ?? 0} events scanned
            </p>
            <button
              type="button"
              onClick={selectAll}
              className="text-[11px] font-body text-text-muted hover:text-text-secondary transition-colors"
            >
              select all
            </button>
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleSuggestion(i)}
                className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-bg-elevated transition-colors text-left"
              >
                <div className={`mt-0.5 w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors ${s.included ? 'bg-accent-lemon/20 border-accent-lemon' : 'border-border-medium'}`}>
                  {s.included && <div className="w-1.5 h-1.5 rounded-full bg-accent-lemon" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-body leading-tight ${s.included ? 'text-text-primary' : 'text-text-muted line-through'}`}>
                    {s.title}
                  </span>
                  <span className="ml-2 text-[11px] font-body uppercase tracking-wide text-text-muted/50">
                    {s.bucket}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={saveSuggestions}
              disabled={includedCount === 0}
              className="text-xs font-body px-3 py-1.5 rounded-lg bg-accent-lemon/15 text-accent-lemon hover:bg-accent-lemon/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Save {includedCount} task{includedCount !== 1 ? 's' : ''}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="text-xs font-body px-3 py-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setStage('picking')}
              className="text-xs font-body px-3 py-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors ml-auto"
            >
              ← Different window
            </button>
          </div>
        </div>
      )}

      {/* ── Collapsible bucket list (single column) ── */}
      {showBuckets && (
        <div className="space-y-2">
          {BUCKETS.map((bucket) => {
            const bucketTasks = tasks.filter((t) => t.bucket === bucket)
            const active = bucketTasks.filter((t) => !t.done)
            const done = bucketTasks.filter((t) => t.done)
            const isCollapsed = collapsedBuckets[bucket]

            return (
              <div key={bucket}>
                <button
                  type="button"
                  onClick={() => toggleBucket(bucket)}
                  className="flex items-center justify-between w-full py-1.5 group"
                  aria-expanded={!isCollapsed}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${BUCKET_DOT[bucket]}`} />
                    <span className="text-[11px] font-body font-semibold text-text-muted tracking-widest uppercase">
                      {BUCKET_LABELS[bucket]}
                    </span>
                    <span className="text-[11px] font-body text-text-muted/60 lowercase">
                      {BUCKET_SUBLABEL[bucket]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-text-muted font-body">{active.length}</span>
                    <span
                      className={`text-text-muted/40 group-hover:text-text-secondary text-xs transition-transform duration-200 ${
                        isCollapsed ? '-rotate-90' : 'rotate-0'
                      }`}
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="pl-4 space-y-0.5 pb-2">
                    {active.map((task) => (
                      <div
                        key={task.id}
                        className="group flex items-start gap-2.5 py-1.5 rounded-lg hover:bg-bg-elevated/50 px-2 -mx-2 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => user && toggleDone(user.uid, task.id)}
                          className="mt-0.5 w-4 h-4 rounded-full border border-border-medium hover:border-accent-lemon flex-shrink-0 transition-colors"
                          aria-label="Mark complete"
                        />
                        <span className="text-[13px] font-body text-text-primary leading-tight">{task.title}</span>
                      </div>
                    ))}

                    {done.length > 0 && (
                      <div className="opacity-40 mt-1">
                        {done.slice(0, 2).map((task) => (
                          <div key={task.id} className="flex items-center gap-2.5 py-1 px-2">
                            <div className="w-4 h-4 rounded-full bg-accent-sage/40 flex-shrink-0" />
                            <span className="text-[13px] font-body text-text-muted line-through leading-tight">{task.title}</span>
                          </div>
                        ))}
                        {done.length > 2 && (
                          <p className="text-[11px] font-body text-text-muted/50 pl-8">
                            +{done.length - 2} more completed
                          </p>
                        )}
                      </div>
                    )}

                    {/* Inline add */}
                    {addingTo === bucket ? (
                      <div className="mt-1 px-2">
                        <input
                          autoFocus
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') addTask(bucket); if (e.key === 'Escape') setAddingTo(null) }}
                          className="w-full text-[13px] font-body bg-bg-elevated border border-border-medium rounded px-2 py-1.5 text-text-primary outline-none focus:border-accent-lemon/40"
                          placeholder="Add task…"
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingTo(bucket)}
                        className="text-[11px] text-text-muted hover:text-text-secondary font-body transition-colors text-left px-2 py-1"
                      >
                        + add
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {activeTasks.length === 0 && stage === 'idle' && (
            <p className="text-[12px] font-body text-text-muted py-2">
              No tasks yet — use Generate to scan your history.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
