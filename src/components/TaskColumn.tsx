import { useAuthStore } from '@/stores/useAuthStore'
import { useTaskStore } from '@/stores/useTaskStore'
import type { Task, Bucket } from '@shared/types'

const BUCKET_LABELS: Record<Bucket, string> = { now: 'NOW', next: 'NEXT', orbit: 'ORBIT' }
const BUCKET_SUBLABEL: Record<Bucket, string> = { now: 'today', next: 'this week', orbit: 'watching' }
const BUCKET_DOT: Record<Bucket, string> = {
  now: 'bg-accent-coral shadow-[0_0_6px_rgba(217,119,87,0.5)]',
  next: 'bg-accent-lemon shadow-[0_0_6px_rgba(245,213,71,0.4)]',
  orbit: 'bg-text-muted',
}

interface Props {
  bucket: Bucket
  tasks: Task[]
}

export function TaskColumn({ bucket, tasks }: Props) {
  const user = useAuthStore((s) => s.user)
  const { toggleDone, remove } = useTaskStore()

  const active = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-1 h-3.5 rounded-full ${BUCKET_DOT[bucket]}`} />
          <span className="text-[10px] font-body font-semibold text-text-muted tracking-widest uppercase">
            {BUCKET_LABELS[bucket]}
          </span>
          <span className="text-[10px] font-body lowercase text-text-muted/60">
            {BUCKET_SUBLABEL[bucket]}
          </span>
        </div>
        <span className="text-[10px] text-text-muted font-body">{active.length}</span>
      </div>

      {active.map((task) => (
        <div
          key={task.id}
          data-testid="task-item"
          className="group flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-bg-elevated transition-colors"
        >
          <button
            type="button"
            onClick={() => user && toggleDone(user.uid, task.id)}
            className="mt-0.5 w-4 h-4 rounded-full border border-border-medium hover:border-accent-lemon flex-shrink-0 transition-colors"
            aria-label="Mark complete"
          />
          <span className="text-sm font-body text-text-primary leading-tight">{task.title}</span>
        </div>
      ))}

      {done.length > 0 && (
        <div className="mt-2 opacity-40">
          {done.map((task) => (
            <div key={task.id} className="flex items-center gap-2.5 p-2 rounded-lg">
              <div className="w-4 h-4 rounded-full bg-accent-sage/40 flex-shrink-0" />
              <span className="text-sm font-body text-text-muted line-through leading-tight">{task.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
