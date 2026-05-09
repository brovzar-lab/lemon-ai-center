import { useState } from 'react'
import { useTaskStore } from '@/stores/useTaskStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { TaskColumn } from './TaskColumn'
import type { Bucket, TaskSource } from '@shared/types'

const BUCKETS: Bucket[] = ['now', 'next', 'orbit']

interface Suggestion {
  title: string
  bucket: Bucket
  source: TaskSource
  notes: string | null
  included: boolean
}

type Stage = 'idle' | 'loading' | 'review' | 'saving'

export function TasksPanel() {
  const tasks = useTaskStore((s) => s.tasks)
  const create = useTaskStore((s) => s.create)
  const bulkCreate = useTaskStore((s) => s.bulkCreate)
  const user = useAuthStore((s) => s.user)
  const [newTitle, setNewTitle] = useState('')
  const [addingTo, setAddingTo] = useState<Bucket | null>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [error, setError] = useState<string | null>(null)

  const addTask = (bucket: Bucket) => {
    if (!newTitle.trim() || !user) return
    create(user.uid, { title: newTitle.trim(), bucket, source: 'manual' })
    setNewTitle('')
    setAddingTo(null)
  }

  const generate = async () => {
    if (!user) return
    setStage('loading')
    setError(null)
    try {
      const res = await fetch('/api/tasks/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message || 'Failed')
      setSuggestions(
        (json.data.suggestions as Omit<Suggestion, 'included'>[]).map((s) => ({ ...s, included: true })),
      )
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
    const toCreate = suggestions
      .filter((s) => s.included)
      .map((s) => ({ ...s, notes: s.notes ?? undefined }))
    await bulkCreate(user.uid, toCreate)
    setSuggestions([])
    setStage('idle')
  }

  const activeTasks = tasks.filter((t) => !t.done)
  const showEmptyState = activeTasks.length === 0 && stage === 'idle'

  return (
    <div className="bg-bg-surface border border-border-soft rounded-xl p-4">
      <h2 className="text-[10px] font-body font-semibold text-text-muted tracking-widest uppercase mb-4">Tasks</h2>

      {/* ── Generate loading ── */}
      {stage === 'loading' && (
        <div className="flex items-center gap-2 py-6 text-text-muted font-body text-xs">
          <div className="w-3 h-3 rounded-full border border-text-muted/40 border-t-transparent animate-spin" />
          Scanning last 2 weeks of email & calendar…
        </div>
      )}

      {/* ── Saving ── */}
      {stage === 'saving' && (
        <div className="flex items-center gap-2 py-6 text-text-muted font-body text-xs">
          <div className="w-3 h-3 rounded-full border border-text-muted/40 border-t-transparent animate-spin" />
          Saving tasks…
        </div>
      )}

      {/* ── Review suggestions ── */}
      {stage === 'review' && (
        <div className="space-y-3">
          <p className="text-xs font-body text-text-muted">
            Select the tasks to add. Uncheck anything already done.
          </p>
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleSuggestion(i)}
                className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-bg-elevated transition-colors text-left group"
              >
                <div
                  className={`mt-0.5 w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors ${
                    s.included
                      ? 'bg-accent-lemon/20 border-accent-lemon'
                      : 'border-border-medium'
                  }`}
                >
                  {s.included && <div className="w-1.5 h-1.5 rounded-full bg-accent-lemon" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-body leading-tight ${s.included ? 'text-text-primary' : 'text-text-muted line-through'}`}>
                    {s.title}
                  </span>
                  <span className="ml-2 text-[10px] font-body uppercase tracking-wide text-text-muted/60">
                    {s.bucket}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={saveSuggestions}
              disabled={suggestions.filter((s) => s.included).length === 0}
              className="text-xs font-body px-3 py-1.5 rounded-lg bg-accent-lemon/15 text-accent-lemon hover:bg-accent-lemon/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Save {suggestions.filter((s) => s.included).length} tasks
            </button>
            <button
              type="button"
              onClick={() => { setSuggestions([]); setStage('idle') }}
              className="text-xs font-body px-3 py-1.5 rounded-lg text-text-muted hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Normal task columns ── */}
      {(stage === 'idle' || stage === 'saving') && !showEmptyState && (
        <div className="grid grid-cols-3 gap-3 divide-x divide-border-soft">
          {BUCKETS.map((bucket) => (
            <div key={bucket} className="px-2 first:pl-0 last:pr-0">
              <TaskColumn
                bucket={bucket}
                tasks={tasks.filter((t) => t.bucket === bucket)}
              />
              {addingTo === bucket ? (
                <div className="mt-2 flex gap-1">
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addTask(bucket); if (e.key === 'Escape') setAddingTo(null) }}
                    className="flex-1 text-xs font-body bg-bg-elevated border border-border-medium rounded px-2 py-1 text-text-primary outline-none focus:border-accent-lemon/40"
                    placeholder="Add task…"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingTo(bucket)}
                  className="mt-2 text-[11px] text-text-muted hover:text-text-secondary font-body transition-colors w-full text-left"
                >
                  + add
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {showEmptyState && (
        <div className="flex flex-col items-start gap-3 py-4">
          {error && (
            <p className="text-xs font-body text-accent-coral">{error}</p>
          )}
          <p className="text-xs font-body text-text-muted">
            No tasks yet. Generate from your last 2 weeks of email & calendar, or add manually below.
          </p>
          <button
            type="button"
            onClick={generate}
            className="text-xs font-body px-3 py-1.5 rounded-lg bg-accent-lemon/15 text-accent-lemon hover:bg-accent-lemon/25 transition-colors"
          >
            Generate from last 2 weeks
          </button>
          <div className="w-full grid grid-cols-3 gap-3 divide-x divide-border-soft mt-2">
            {BUCKETS.map((bucket) => (
              <div key={bucket} className="px-2 first:pl-0 last:pr-0">
                {addingTo === bucket ? (
                  <div className="mt-2 flex gap-1">
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addTask(bucket); if (e.key === 'Escape') setAddingTo(null) }}
                      className="flex-1 text-xs font-body bg-bg-elevated border border-border-medium rounded px-2 py-1 text-text-primary outline-none focus:border-accent-lemon/40"
                      placeholder="Add task…"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingTo(bucket)}
                    className="text-[11px] text-text-muted hover:text-text-secondary font-body transition-colors w-full text-left"
                  >
                    + add {bucket}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
