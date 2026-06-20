import { useMemo, useState } from 'react'
import { useTaskStore } from '@/stores/useTaskStore'
import { useAuthStore } from '@/stores/useAuthStore'
import type { Task } from '@shared/types'

type Quadrant = 'urgent_important' | 'important' | 'urgent' | 'neither'

const QUADRANTS: Array<{
  key: Quadrant
  label: string
  hint: string
  accent: string
}> = [
  {
    key: 'urgent_important',
    label: 'Urgent + Important',
    hint: 'Do now — before anything else',
    accent: 'var(--data-coral)',
  },
  {
    key: 'important',
    label: 'Important · Not Urgent',
    hint: 'Schedule deep work',
    accent: 'var(--accent)',
  },
  {
    key: 'urgent',
    label: 'Urgent · Not Important',
    hint: 'Delegate or batch',
    accent: 'var(--data-blue)',
  },
  {
    key: 'neither',
    label: 'Neither',
    hint: 'Drop it',
    accent: 'var(--ink-3)',
  },
]

const HOUR_MS = 1000 * 60 * 60
const DAY_MS = HOUR_MS * 24

/**
 * Classify a single task into an Eisenhower quadrant from its bucket
 * + due-date heuristics. Pure function for testability.
 */
export function classifyTask(task: Task, now: Date = new Date()): Quadrant {
  if (task.done) return 'neither'

  const due = task.dueDate ? new Date(task.dueDate) : null
  const dueInHours = due ? (due.getTime() - now.getTime()) / HOUR_MS : null

  // Urgency: due within 24h or "now" bucket means urgent
  const isUrgent =
    task.bucket === 'now' ||
    (dueInHours !== null && dueInHours <= 24)

  // Importance: bucket "now"/"next" carries weight, "orbit" generally not
  const isImportant = task.bucket === 'now' || task.bucket === 'next'

  if (isUrgent && isImportant) return 'urgent_important'
  if (!isUrgent && isImportant) return 'important'
  if (isUrgent && !isImportant) return 'urgent'
  return 'neither'
}

interface TasksEisenhowerProps {
  /** Optionally hide done tasks. Defaults to true. */
  hideDone?: boolean
}

/**
 * Compact Eisenhower 2x2 view of the current task list. Reads from
 * `useTaskStore` and offers a one-click promote action that moves the
 * task into the "now" bucket — the closest CEO-native equivalent of
 * "elevate to urgent + important". Demotion is via existing TaskColumn.
 */
export function TasksEisenhower({ hideDone = true }: TasksEisenhowerProps) {
  const tasks = useTaskStore((s) => s.tasks)
  const moveBucket = useTaskStore((s) => s.moveBucket)
  const toggleDone = useTaskStore((s) => s.toggleDone)
  const user = useAuthStore((s) => s.user)
  const [hovered, setHovered] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const map: Record<Quadrant, Task[]> = {
      urgent_important: [],
      important: [],
      urgent: [],
      neither: [],
    }
    for (const t of tasks) {
      if (hideDone && t.done) continue
      map[classifyTask(t)].push(t)
    }
    return map
  }, [tasks, hideDone])

  const total = grouped.urgent_important.length + grouped.important.length + grouped.urgent.length + grouped.neither.length

  return (
    <div className="bg-surface border border-line rounded-xl p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] font-sans font-semibold text-ink-3 tracking-widest uppercase">
          Eisenhower
        </h2>
        <span className="text-[10px] font-sans tabular-nums text-ink-3">
          {total} open
        </span>
      </header>
      <div className="grid grid-cols-2 gap-2">
        {QUADRANTS.map((q) => {
          const items = grouped[q.key]
          return (
            <section
              key={q.key}
              aria-label={q.label}
              className="bg-bg border border-line rounded-lg p-2.5 min-h-[120px] flex flex-col"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  aria-hidden
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: q.accent }}
                />
                <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-ink-2">
                  {q.label}
                </span>
                <span className="text-[10px] font-sans tabular-nums text-ink-3 ml-auto">
                  {items.length}
                </span>
              </div>
              {items.length === 0 ? (
                <p className="text-[10px] font-sans italic text-ink-3 leading-snug">
                  {q.hint}
                </p>
              ) : (
                <ul className="space-y-1 flex-1">
                  {items.slice(0, 6).map((t) => (
                    <li
                      key={t.id}
                      onMouseEnter={() => setHovered(t.id)}
                      onMouseLeave={() => setHovered(null)}
                      className="group flex items-start gap-2 text-[11px] font-sans leading-snug text-ink"
                    >
                      <button
                        type="button"
                        onClick={() => user && toggleDone(user.uid, t.id)}
                        aria-label={`Mark "${t.title}" done`}
                        className="mt-0.5 w-3 h-3 rounded-sm border border-line flex-shrink-0 hover:border-data-teal transition-colors"
                      />
                      <span className="flex-1 min-w-0 line-clamp-2">{t.title}</span>
                      {hovered === t.id && q.key !== 'urgent_important' && user && (
                        <button
                          type="button"
                          onClick={() => moveBucket(user.uid, t.id, 'now')}
                          className="text-[9px] font-sans font-bold uppercase tracking-wider text-data-coral hover:opacity-80 flex-shrink-0"
                          title="Move to NOW bucket"
                        >
                          Promote
                        </button>
                      )}
                    </li>
                  ))}
                  {items.length > 6 && (
                    <li className="text-[10px] font-sans italic text-ink-3">
                      +{items.length - 6} more
                    </li>
                  )}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
