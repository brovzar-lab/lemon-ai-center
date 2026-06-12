import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useMissionStore } from '@/stores/useMissionStore'
import type { EngineJobId } from '@shared/types'

/**
 * Heartbeats — the engine proves it's alive. Failures surface as a
 * banner; never silent staleness (spec §4 reliability rules).
 */

const SHOWN: Array<{ id: EngineJobId; label: string }> = [
  { id: 'inbox_scan', label: 'scan' },
  { id: 'morning_assembly', label: 'brief' },
  { id: 'slip_detect', label: 'slips' },
  { id: 'nightly', label: 'metrics' },
]

function timeShort(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const today = d.toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA')
  const hm = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return today ? hm : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hm}`
}

export function EngineStatus() {
  const jobs = useMissionStore((s) => s.engineJobs)
  const runJob = useMissionStore((s) => s.runJob)

  if (!jobs.length) return null

  const byId = new Map(jobs.map((j) => [j.jobId, j]))
  const failed = jobs.filter((j) => j.status === 'error')

  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 flex-wrap text-[10px] font-body text-text-muted uppercase tracking-[0.12em]">
        <span className="text-text-tertiary">Engine</span>
        {SHOWN.map(({ id, label }) => {
          const job = byId.get(id)
          const ok = job?.status === 'ok'
          const running = job?.status === 'running'
          return (
            <span key={id} className="flex items-center gap-1">
              <span
                className={
                  running
                    ? 'text-accent-lemon'
                    : ok
                      ? 'text-accent-sage'
                      : job?.status === 'error'
                        ? 'text-accent-coral'
                        : 'text-text-muted'
                }
              >
                {running ? '◌' : ok ? '✓' : job?.status === 'error' ? '✗' : '·'}
              </span>
              <span>
                {label} {timeShort(job?.lastSuccess)}
              </span>
            </span>
          )
        })}
      </div>

      {failed.map((job) => (
        <div
          key={job.jobId}
          className="mt-2 flex items-center gap-2 border border-accent-coral/30 bg-accent-coral/5 rounded-lg px-3 py-2"
        >
          <AlertTriangle size={13} className="text-accent-coral flex-shrink-0" />
          <span className="font-body text-[11px] text-text-secondary flex-1 truncate">
            {job.jobId} failed{job.error ? `: ${job.error}` : ''}
          </span>
          <button
            type="button"
            onClick={() => void runJob(job.jobId)}
            className="flex items-center gap-1 text-[10px] font-body uppercase tracking-[0.1em] text-accent-coral hover:underline"
          >
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      ))}
    </div>
  )
}
